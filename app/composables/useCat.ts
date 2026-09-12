import type { RadioId } from '@springfield/ham-radio-api';
import { ConsoleTransport, LogLayer } from 'loglayer';
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { kenwoodCatDialectForRadio } from '~/utils/kenwood-cat-control';
import { openKenwoodCatSerialTransport } from '~/utils/kenwood-cat-serial';
import { KenwoodCatSession, type CatStatus, type CatVfo } from '~/utils/kenwood-cat-session';
import type { KenwoodCatPower } from '~/utils/kenwood-cat-control';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

const POLL_INTERVAL_MS = 1500;

let session: KenwoodCatSession | undefined;
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

  const connected = computed(() => Boolean(session && status.value && lockedPort.value));

  async function connect(path: string, radio: LoadedRadioConfig, baudRate: number): Promise<void> {
    if (!isTauriRuntime()) {
      error.value = 'CAT control requires the HamBench desktop app.';
      return;
    }

    if (!radioSupportsLiveCat(radio)) {
      error.value = `${radio.id.name} does not declare live control. Clone-only radios stay on the Radio page.`;
      return;
    }

    if (session) {
      await disconnect();
    }

    connecting.value = true;
    error.value = null;

    try {
      await releaseSerialPortHold();
      const transport = await openKenwoodCatSerialTransport(path, radio.serialConfig, baudRate);
      const nextSession = new KenwoodCatSession({
        transport,
        dialect: kenwoodCatDialectForRadio({ model: radio.id.model, cat: radio.cat }),
      });

      try {
        status.value = await nextSession.connect();
      } catch (cause) {
        await transport.close().catch(() => undefined);
        throw cause;
      }

      session = nextSession;
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
    const current = session;
    session = undefined;
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
    if (!session || busy.value || session.status?.transmitting) {
      return;
    }

    try {
      status.value = await session.poll();
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

  async function setPower(band: CatVfo['band'], power: KenwoodCatPower): Promise<void> {
    await runCommand((current) => current.setPower(band, power));
  }

  async function setTransmit(transmit: boolean): Promise<void> {
    await runCommand((current) => current.setTransmit(transmit));
  }

  async function runCommand(action: (current: KenwoodCatSession) => Promise<CatStatus>): Promise<void> {
    const current = session;

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

  return {
    status,
    connecting,
    busy,
    error,
    connected,
    connectedRadio,
    lockedPort,
    connect,
    disconnect,
    poll,
    setFrequency,
    setMode,
    setPower,
    setTransmit,
  };
}
