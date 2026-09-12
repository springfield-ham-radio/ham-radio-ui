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

interface CatRuntime {
  session: KenwoodCatSession;
  traffic: ReturnType<typeof createCatSerialLog>;
  commandQueue: Promise<void>;
  pollTimer?: ReturnType<typeof setInterval>;
}

const runtimes = new Map<string, CatRuntime>();

/** UI copy of one live CAT radio. The Kenwood session object stays in `runtimes`. */
export interface CatLiveRadio {
  port: string;
  radio: RadioId;
  status: CatStatus;
  busy: boolean;
  error: string | null;
  serialLog: CatSerialLogSnapshot;
}

export function useCat() {
  const toast = useToast();
  const { lockedPorts, setLockedPorts } = useCatPortLock();
  const liveRadios = useState<CatLiveRadio[]>('cat-live-radios', () => []);
  const connecting = useState('cat-connecting', () => false);
  const error = useState<string | null>('cat-error', () => null);
  const failedConnectLog = useState<CatSerialLogSnapshot | undefined>('cat-failed-log', () => undefined);
  const failedConnectRadio = useState<RadioId | undefined>('cat-failed-radio', () => undefined);
  const failedConnectPort = useState<string | undefined>('cat-failed-port', () => undefined);

  const connected = computed(() => liveRadios.value.length > 0);

  function syncLockedPorts(): void {
    setLockedPorts(liveRadios.value.map((radio) => radio.port));
  }

  function patchLiveRadio(port: string, patch: Partial<CatLiveRadio>): void {
    liveRadios.value = liveRadios.value.map((radio) => (radio.port === port ? { ...radio, ...patch } : radio));
  }

  function startPolling(port: string): void {
    const runtime = runtimes.get(port);

    if (!runtime) {
      return;
    }

    stopPolling(port);
    runtime.pollTimer = setInterval(() => {
      void poll(port);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling(port: string): void {
    const runtime = runtimes.get(port);

    if (runtime?.pollTimer !== undefined) {
      clearInterval(runtime.pollTimer);
      runtime.pollTimer = undefined;
    }
  }

  async function connect(path: string, radio: LoadedRadioConfig, baudRate: number): Promise<void> {
    if (!isTauriRuntime()) {
      error.value = 'CAT control requires the HamBench desktop app.';
      return;
    }

    if (!radioSupportsLiveCat(radio)) {
      error.value = `${radio.id.name} does not declare live control. Clone-only radios stay on the Radio page.`;
      return;
    }

    if (runtimes.has(path)) {
      await disconnect(path);
    }

    connecting.value = true;
    error.value = null;
    failedConnectRadio.value = radio.id;
    failedConnectPort.value = path;
    const traffic = createCatSerialLog();
    failedConnectLog.value = traffic.snapshot();

    try {
      await releaseSerialPortHold();
      const transport = await openKenwoodCatSerialTransport(path, radio.serialConfig, baudRate, (direction, data) => {
        traffic.append(direction, data);
        const snapshot = traffic.snapshot();
        const live = liveRadios.value.find((item) => item.port === path);

        if (live) {
          patchLiveRadio(path, { serialLog: snapshot });
        } else {
          failedConnectLog.value = snapshot;
        }
      });
      const nextSession = new KenwoodCatSession({
        transport,
        profile: kenwoodCatProfileFromConfig(radio.cat),
      });

      let status: CatStatus;

      try {
        status = await nextSession.connect();
      } catch (cause) {
        await transport.close().catch(() => undefined);
        throw cause;
      }

      runtimes.set(path, {
        session: nextSession,
        traffic,
        commandQueue: Promise.resolve(),
      });
      liveRadios.value = [
        ...liveRadios.value.filter((item) => item.port !== path),
        {
          port: path,
          radio: radio.id,
          status,
          busy: false,
          error: null,
          serialLog: traffic.snapshot(),
        },
      ];
      syncLockedPorts();
      failedConnectLog.value = undefined;
      failedConnectRadio.value = undefined;
      failedConnectPort.value = undefined;
      startPolling(path);
      toast.add({
        title: 'CAT connected',
        description: status.radioIdentity || radio.id.name,
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

  /**
   * Close one CAT session, or every session when `port` is omitted.
   */
  async function disconnect(port?: string): Promise<void> {
    const ports = port === undefined ? [...runtimes.keys()] : [port];

    for (const path of ports) {
      stopPolling(path);
      const runtime = runtimes.get(path);
      runtimes.delete(path);
      liveRadios.value = liveRadios.value.filter((radio) => radio.port !== path);

      if (!runtime) {
        continue;
      }

      try {
        await runtime.session.disconnect();
      } catch (cause) {
        logger.withError(cause).warn('CAT disconnect failed');
      }
    }

    syncLockedPorts();
    error.value = null;
  }

  async function poll(port: string): Promise<void> {
    const runtime = runtimes.get(port);
    const live = liveRadios.value.find((radio) => radio.port === port);

    if (!runtime || !live || live.busy || runtime.session.status?.transmitting) {
      return;
    }

    try {
      const status = await runtime.session.poll();
      patchLiveRadio(port, { status, error: null });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'CAT poll failed';
      patchLiveRadio(port, { error: message });
      logger.withError(cause).warn('CAT poll failed');
    }
  }

  async function setFrequency(port: string, band: CatVfo['band'], frequencyHz: number): Promise<void> {
    await runCommand(port, (session) => session.setFrequency(band, frequencyHz));
  }

  async function setMode(port: string, band: CatVfo['band'], mode: string): Promise<void> {
    await runCommand(port, (session) => session.setMode(band, mode));
  }

  async function setPower(port: string, band: CatVfo['band'], power: string): Promise<void> {
    await runCommand(port, (session) => session.setPower(band, power));
  }

  async function setTransmit(port: string, transmit: boolean): Promise<void> {
    await runCommand(port, (session) => session.setTransmit(transmit));
  }

  async function runCommand(
    port: string,
    action: (session: KenwoodCatSession) => Promise<CatStatus>,
  ): Promise<void> {
    const runtime = runtimes.get(port);

    if (!runtime) {
      return;
    }

    const work = runtime.commandQueue.then(async () => {
      patchLiveRadio(port, { busy: true });

      try {
        const status = await action(runtime.session);
        patchLiveRadio(port, { status, busy: false, error: null });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'CAT command failed';
        patchLiveRadio(port, { busy: false, error: message });
        logger.withError(cause).error('CAT command failed');
        toast.add({
          title: 'CAT command failed',
          description: message,
          color: 'error',
          icon: 'i-lucide-circle-alert',
        });
      }
    });

    runtime.commandQueue = work.catch(() => undefined);
    await work;
  }

  async function saveSerialLog(port?: string): Promise<void> {
    const failed = port === 'failed' || (!port && liveRadios.value.length === 0);
    const live = failed ? undefined : port ? liveRadios.value.find((radio) => radio.port === port) : liveRadios.value[0];
    const captured = live?.serialLog ?? failedConnectLog.value;
    const radioId = live?.radio ?? failedConnectRadio.value;
    const serialPortPath = live?.port ?? failedConnectPort.value;
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
        radioId,
        serialPortPath,
        log: captured,
      });
      const destination = await saveJsonFileWithPicker(contents, defaultSerialLogFileName('cat', radioId), {
        title: 'Save Serial Log',
        filterName: 'Serial Log',
      });

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
    liveRadios,
    connecting,
    error,
    connected,
    lockedPorts,
    failedConnectLog,
    failedConnectRadio,
    failedConnectPort,
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
