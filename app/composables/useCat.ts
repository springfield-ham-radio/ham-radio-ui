import type { RadioId } from '@springfield/ham-radio-api';
import { ConsoleTransport, LogLayer } from 'loglayer';
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { createCatSerialLog, type CatSerialLogSnapshot } from '~/utils/cat-serial-log';
import { kenwoodCatProfileFromConfig } from '~/utils/kenwood-cat-profile';
import { openKenwoodCatSerialTransport } from '~/utils/kenwood-cat-serial';
import { KenwoodCatSession, type CatStatus, type CatVfo } from '~/utils/kenwood-cat-session';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';
import { isTauriRuntime, saveJsonFileWithPicker } from '~/utils/radio-memory-file-io';
import { releaseSerialPortHold } from '~/utils/serial-idle-hold';
import {
  defaultSerialLogFileName,
  serializeSerialLogFile,
  serialLogEntryCount,
} from '~/utils/serial-log-file';

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

const POLL_INTERVAL_MS = 1500;

const session = shallowRef<KenwoodCatSession | undefined>();
let pollTimer: ReturnType<typeof setInterval> | undefined;
let commandQueue: Promise<void> = Promise.resolve();

export function useCat() {
  const toast = useToast();
  const { lockedPort } = useCatPortLock();
  const status = useState<CatStatus | undefined>('cat-status', () => undefined);
  const connecting = useState('cat-connecting', () => false);
  const busy = useState('cat-busy', () => false);
  const error = useState<string | null>('cat-error', () => null);
  const connectedRadio = useState<RadioId | undefined>('cat-connected-radio', () => undefined);
  const serialLog = useState<CatSerialLogSnapshot | undefined>('cat-serial-log', () => undefined);
  const logRadio = useState<RadioId | undefined>('cat-log-radio', () => undefined);
  const logPort = useState<string | undefined>('cat-log-port', () => undefined);

  // Read every ref. A plain `session && status.value` never tracks status/port, so the
  // Control tab stays on Connect after a successful handshake.
  const connected = computed(
    () => Boolean(session.value) && Boolean(status.value) && Boolean(lockedPort.value),
  );

  async function connect(path: string, radio: LoadedRadioConfig, baudRate: number): Promise<void> {
    if (!isTauriRuntime()) {
      error.value = 'CAT control requires the HamBench desktop app.';
      return;
    }

    if (!radioSupportsLiveCat(radio)) {
      error.value = `${radio.id.name} does not declare live control. Clone-only radios stay on the Radio page.`;
      return;
    }

    if (session.value) {
      await disconnect();
    }

    connecting.value = true;
    error.value = null;
    logRadio.value = radio.id;
    logPort.value = path;
    const traffic = createCatSerialLog();
    serialLog.value = traffic.snapshot();

    try {
      await releaseSerialPortHold();
      const transport = await openKenwoodCatSerialTransport(path, radio.serialConfig, baudRate, (direction, data) => {
        traffic.append(direction, data);
        serialLog.value = traffic.snapshot();
      });
      const nextSession = new KenwoodCatSession({
        transport,
        profile: kenwoodCatProfileFromConfig(radio.cat),
      });

      try {
        status.value = await nextSession.connect();
      } catch (cause) {
        await transport.close().catch(() => undefined);
        throw cause;
      }

      session.value = nextSession;
      lockedPort.value = path;
      connectedRadio.value = radio.id;
      startPolling();
      toast.add({
        title: 'CAT connected',
        description: status.value?.radioIdentity || radio.id.name,
        color: 'success',
        icon: 'i-lucide-cable',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to open CAT session';
      error.value = message;
      logger.withError(cause).error('CAT connect failed');
      toast.add({
        title: 'Could not connect CAT',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    } finally {
      connecting.value = false;
    }
  }

  async function disconnect(): Promise<void> {
    stopPolling();
    const current = session.value;
    session.value = undefined;
    lockedPort.value = undefined;
    connectedRadio.value = undefined;
    status.value = undefined;
    error.value = null;

    if (!current) {
      return;
    }

    try {
      await current.disconnect();
    } catch (cause) {
      logger.withError(cause).warn('CAT disconnect failed');
    }
  }

  async function poll(): Promise<void> {
    const current = session.value;

    if (!current || busy.value || current.status?.transmitting) {
      return;
    }

    try {
      status.value = await current.poll();
      error.value = null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'CAT poll failed';
      error.value = message;
      logger.withError(cause).warn('CAT poll failed');
    }
  }

  async function setFrequency(band: CatVfo['band'], frequencyHz: number): Promise<void> {
    await runCommand((current) => current.setFrequency(band, frequencyHz));
  }

  async function setMode(band: CatVfo['band'], mode: string): Promise<void> {
    await runCommand((current) => current.setMode(band, mode));
  }

  async function setPower(band: CatVfo['band'], power: string): Promise<void> {
    await runCommand((current) => current.setPower(band, power));
  }

  async function setTransmit(transmit: boolean): Promise<void> {
    await runCommand((current) => current.setTransmit(transmit));
  }

  async function runCommand(action: (current: KenwoodCatSession) => Promise<CatStatus>): Promise<void> {
    const current = session.value;

    if (!current) {
      return;
    }

    const work = commandQueue.then(async () => {
      busy.value = true;

      try {
        status.value = await action(current);
        error.value = null;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'CAT command failed';
        error.value = message;
        logger.withError(cause).error('CAT command failed');
        toast.add({
          title: 'CAT command failed',
          description: message,
          color: 'error',
          icon: 'i-lucide-circle-alert',
        });
      } finally {
        busy.value = false;
      }
    });

    commandQueue = work.catch(() => undefined);
    await work;
  }

  function startPolling(): void {
    stopPolling();
    pollTimer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(): void {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  }

  async function saveSerialLog(): Promise<void> {
    const captured = serialLog.value;
    const entryCount = serialLogEntryCount(captured);

    if (!captured || entryCount === 0) {
      toast.add({
        title: 'No serial log',
        description: 'Connect CAT to capture serial traffic.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    try {
      const contents = serializeSerialLogFile({
        operation: 'cat',
        radioId: logRadio.value ?? connectedRadio.value,
        serialPortPath: logPort.value ?? lockedPort.value,
        log: captured,
      });
      const destination = await saveJsonFileWithPicker(
        contents,
        defaultSerialLogFileName('cat', logRadio.value ?? connectedRadio.value),
        {
          title: 'Save Serial Log',
          filterName: 'Serial Log',
        },
      );

      if (destination === undefined) {
        return;
      }

      toast.add({
        title: 'Serial log saved',
        description: `${memoryFileDisplayName(destination)} · ${entryCount} frames`,
        color: 'success',
        icon: 'i-lucide-file-text',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save serial log';
      logger.withError(cause).error('Failed to save CAT serial log');
      toast.add({
        title: 'Could not save serial log',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  return {
    status,
    connecting,
    busy,
    error,
    connected,
    connectedRadio,
    lockedPort,
    serialLog,
    connect,
    disconnect,
    poll,
    setFrequency,
    setMode,
    setPower,
    setTransmit,
    saveSerialLog,
  };
}
