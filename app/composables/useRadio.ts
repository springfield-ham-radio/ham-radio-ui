import type {
  Radio,
  RadioChannel,
  RadioCodec,
  RadioId,
  RadioMemoryMap,
  RadioProgram,
  RadioProgrammedChannel,
  RadioProgressIndicator,
  RadioSettings,
} from '@springfield/ham-radio-api';
import { RadioToneType } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { ConsoleTransport, LogLayer } from 'loglayer';
import {
  applyChannelPatch,
  availableChannelNumbers,
  channelCapacity,
  channelNameMaxLength,
  reorderProgrammedChannels,
  type ChannelPatch,
} from '~/utils/channel-edit';
import { useCatPortLock } from '~/composables/useCatPortLock';
import {
  CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION,
  CAT_MEMORY_TRANSFER_BLOCKED_TITLE,
  isCatMemoryTransferBlocked,
} from '~/utils/cat-memory-transfer';
import {
  type LoadedRadioConfig,
  listRadioCatalogRecords,
  listRadioManufacturers,
  memoryMapFromConfig,
  type RadioCatalogRecord,
} from '~/utils/radio-catalog-db';
import { reloadUserJsonCatalogRecords, uninstallRadioCatalogRecord } from '~/utils/radio-module-install';
import {
  defaultMemoryFileName,
  memoryFileDisplayName,
  parseRadioMemoryFile,
  serializeRadioMemoryFile,
  shouldPromptForSavePath,
} from '~/utils/radio-memory-file';
import {
  clearBrowserFileHandle,
  isTauriRuntime,
  readTextFileWithPicker,
  saveJsonFileWithPicker,
  writeTextFile,
  writeTextFileWithPicker,
} from '~/utils/radio-memory-file-io';
import {
  captureRadioImageBackup,
  matchBackupConfiguration,
  parseBackupFileName,
  readRadioImageBackupSettings,
  shouldCaptureRadioImageBackup,
  writeWithoutBackupWarning,
} from '~/utils/radio-image-backup';
import { createTauriRadioImageBackupStore, loadRadioImageBackup } from '~/utils/radio-image-backup-io';
import { radioCardIdKey } from '~/composables/radio-card-context';
import type { GuestRadio } from '~/utils/radio-board';
import { writeRememberedRadio } from '~/utils/remembered-radio';
import { savedRadioModelLabel } from '~/utils/saved-radios';
import {
  defaultSerialLogFileName,
  serializeSerialLogFile,
  serialLogEntryCount,
  type SerialLogOperation,
} from '~/utils/serial-log-file';

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

interface CapturedSerialLog {
  fileName: string;
  contents: string;
  entryCount: number;
  operation: SerialLogOperation;
  log: unknown;
}

interface SerialLoggedDriver {
  getSerialLogData(): unknown;
}

interface RadioCardSession {
  memory?: Uint8Array;
  /**
   * Last raw image known to be stored in the radio.
   * Set from a successful read, and replaced after a successful write.
   * Edits in the app change `memory` and leave this copy alone.
   */
  radioBaseline?: Uint8Array;
  channels: ChannelRow[];
  program?: RadioProgram;
  settingsMemoryMap?: RadioMemoryMap;
  activeRadioId?: RadioId;
  memoryFilePath?: string;
  serialLog?: CapturedSerialLog;
}

function emptyRadioCardSession(): RadioCardSession {
  return { channels: [] };
}

const cardPersistQueues = new Map<string, Promise<void>>();

/** An open radio card that can receive library channels. */
export interface RadioAddTarget {
  /** Card id, which is also the session id. */
  id: string;
  name: string;
  modelLabel: string;
  /** True when this card has a loaded memory image. */
  ready: boolean;
  freeSlotNumbers: number[];
  settingsMemoryMap?: RadioMemoryMap;
}

/** Model, port, and optional baud for a guest read with no card open. */
export interface DirectReadRequest {
  radioId: RadioId;
  baudRate?: number;
  serialPort: string;
}

export interface ChannelRow {
  channelNumber: number;
  name: string;
  transmit: string;
  receive: string;
  txTone: string;
  rxTone: string;
  toneType: string;
  transmitFrequencyHz?: number;
  receiveFrequencyHz?: number;
  /** Radio-specific channel extras from the memory map (power, mode, scan, …). */
  settings?: RadioSettings;
}

export function useRadio() {
  const toast = useToast();
  const configurations = useState<LoadedRadioConfig[]>('radio-configurations', () => []);
  const manufacturers = useState<string[]>('radio-manufacturers', () => []);
  const isLoading = useState('radio-loading', () => false);
  const error = useState<string | null>('radio-error', () => null);
  const readOpen = useState('radio-read-open', () => false);
  const directReadOpen = useState('radio-direct-read-open', () => false);
  const writeOpen = useState('radio-write-open', () => false);
  const progressOpen = useState('radio-progress-open', () => false);
  const progressKind = useState<'import' | 'write' | 'backup'>('radio-progress-kind', () => 'import');
  const progress = useState('radio-progress', () => 0);
  const progressError = useState<string | null>('radio-progress-error', () => null);
  const progressStartedAt = useState<number | null>('radio-progress-started-at', () => null);
  const canceled = useState('radio-canceled', () => false);
  const sessions = useState<Record<string, RadioCardSession>>('radio-card-sessions', () => ({}));
  const modulesInstallOpen = useState('radio-modules-install-open', () => false);
  const modulesInstallRequired = useState('radio-modules-install-required', () => false);
  const { lockedPorts: catLockedPorts } = useCatPortLock();
  const { radios } = useSavedRadios();
  const { transferCardId, focusedCardId, cards, openGuestCard, beginTransfer, clearTransfer } = useRadioBoard();
  const injectedCardId = getCurrentInstance() ? inject(radioCardIdKey, undefined) : undefined;
  /** Card this component belongs to. Read and Write dialogs use `transferCardId` instead. */
  const cardId = computed(() => injectedCardId?.value ?? focusedCardId.value);
  const savedRadio = computed(() => radios.value.find((radio) => radio.id === cardId.value));
  const cardRadio = computed(() => {
    if (savedRadio.value) {
      return savedRadio.value;
    }

    const id = cardId.value;
    const guest = cards.value.find((card) => card.id === id)?.guest;

    if (!guest || !id) {
      return undefined;
    }

    return { id, ...guest };
  });
  const addTargets = computed<RadioAddTarget[]>(() =>
    cards.value.flatMap((card) => {
      const saved = radios.value.find((radio) => radio.id === card.savedRadioId) ?? card.guest;

      if (!saved) {
        return [];
      }

      const session = sessions.value[card.id];
      const ready = Boolean(session?.program && session.memory && session.activeRadioId);
      const occupied = session?.program?.channels.map((channel) => channel.channelNumber) ?? [];

      return [
        {
          id: card.id,
          name: saved.name,
          modelLabel: savedRadioModelLabel(saved, configurations.value),
          ready,
          freeSlotNumbers: ready
            ? availableChannelNumbers(occupied, channelCapacity(session?.settingsMemoryMap))
            : [],
          settingsMemoryMap: session?.settingsMemoryMap,
        },
      ];
    }),
  );

  function boundRadio(sessionId: string): { name: string; manufacturer: string; model: string } | undefined {
    const saved = radios.value.find((radio) => radio.id === sessionId);

    if (saved) {
      return saved;
    }

    return cards.value.find((card) => card.id === sessionId)?.guest;
  }

  function readSession(id: string | undefined): RadioCardSession | undefined {
    if (!id) {
      return undefined;
    }

    return sessions.value[id];
  }

  function patchSession(id: string | undefined, patch: Partial<RadioCardSession>): void {
    if (!id) {
      return;
    }

    const current = sessions.value[id] ?? emptyRadioCardSession();
    sessions.value = {
      ...sessions.value,
      [id]: { ...current, ...patch },
    };
  }

  /**
   * Card that should receive an import, write, or file opened from outside the card.
   */
  function actingCardId(): string | undefined {
    return transferCardId.value ?? cardId.value;
  }

  /** Image and baseline for the card the write dialog was opened against. */
  const writeTarget = computed(() => {
    const session = readSession(transferCardId.value);

    return {
      memory: session?.memory,
      baseline: session?.radioBaseline,
      memoryMap: session?.settingsMemoryMap,
      radioId: session?.activeRadioId,
    };
  });

  const memory = computed({
    get: () => readSession(cardId.value)?.memory,
    set: (value) => {
      patchSession(cardId.value, { memory: value });
    },
  });
  const channels = computed({
    get: () => readSession(cardId.value)?.channels ?? [],
    set: (value) => {
      patchSession(cardId.value, { channels: value });
    },
  });
  const program = computed({
    get: () => readSession(cardId.value)?.program,
    set: (value) => {
      patchSession(cardId.value, { program: value });
    },
  });
  const settingsMemoryMap = computed({
    get: () => readSession(cardId.value)?.settingsMemoryMap,
    set: (value) => {
      patchSession(cardId.value, { settingsMemoryMap: value });
    },
  });
  const activeRadioId = computed({
    get: () => readSession(cardId.value)?.activeRadioId,
    set: (value) => {
      patchSession(cardId.value, { activeRadioId: value });
    },
  });
  const memoryFilePath = computed({
    get: () => readSession(cardId.value)?.memoryFilePath,
    set: (value) => {
      patchSession(cardId.value, { memoryFilePath: value });
    },
  });
  const serialLog = computed({
    get: () => readSession(cardId.value)?.serialLog,
    set: (value) => {
      patchSession(cardId.value, { serialLog: value });
    },
  });

  function clearCardSession(id: string): void {
    const next = { ...sessions.value };
    delete next[id];
    sessions.value = next;
    cardPersistQueues.delete(id);
  }

  function sessionQueue(id: string): Promise<void> {
    return cardPersistQueues.get(id) ?? Promise.resolve();
  }

  async function refreshCatalogState(): Promise<void> {
    await reloadUserJsonCatalogRecords();
    const records = await listRadioCatalogRecords();
    configurations.value = records.map((record) => record.config);
    manufacturers.value = await listRadioManufacturers();
  }

  async function initialize(): Promise<void> {
    if (isLoading.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      await refreshCatalogState();

      if (configurations.value.length === 0) {
        modulesInstallRequired.value = true;
        modulesInstallOpen.value = true;
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load radio configurations';
    } finally {
      isLoading.value = false;
    }
  }

  function openModulesInstall(options: { required?: boolean } = {}): void {
    modulesInstallRequired.value = options.required ?? false;
    modulesInstallOpen.value = true;
  }

  async function uninstallRadio(record: RadioCatalogRecord): Promise<void> {
    try {
      const removedModelIds = await uninstallRadioCatalogRecord(record);
      const removed = new Set(removedModelIds);
      const nextSessions = { ...sessions.value };

      for (const [id, session] of Object.entries(nextSessions)) {
        const model = session.activeRadioId?.model;

        if (model && removed.has(String(model))) {
          nextSessions[id] = emptyRadioCardSession();
        }
      }

      sessions.value = nextSessions;

      await refreshCatalogState();

      if (configurations.value.length === 0) {
        modulesInstallRequired.value = true;
      }

      const description =
        removedModelIds.length === 1
          ? record.name
          : `${removedModelIds.length} radios removed`;

      toast.add({
        title: 'Radio removed',
        description,
        color: 'success',
        icon: 'i-lucide-check',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to remove radio';
      logger.withError(cause).error('Failed to remove radio');
      toast.add({
        title: 'Could not remove radio',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  function getModelsByManufacturer(manufacturer: string): RadioId[] {
    return configurations.value.filter((config) => config.id.manufacturer === manufacturer).map((config) => config.id);
  }

  function getConfiguration(radioId: RadioId): LoadedRadioConfig | undefined {
    return configurations.value.find((config) => config.id.model === radioId.model);
  }

  async function getCodec(radioId: RadioId): Promise<RadioCodec | undefined> {
    const config = getConfiguration(radioId);
    const memoryMap = config ? memoryMapFromConfig(config) : undefined;

    if (!config || !memoryMap) {
      return undefined;
    }

    return createMemoryMapCodec({
      radioModel: radioId.model,
      memoryMap,
      memoryConfig: config.memoryConfig,
      logger,
    });
  }

  function startProgress(kind: 'import' | 'write' | 'backup'): RadioProgressIndicator {
    canceled.value = false;
    progress.value = 0;
    progressError.value = null;
    progressStartedAt.value = Date.now();
    progressKind.value = kind;
    progressOpen.value = true;

    return {
      get isCanceled() {
        return canceled.value;
      },
      set isCanceled(value: boolean) {
        canceled.value = value;
      },
      setValue(value: number) {
        progress.value = value;
      },
    };
  }

  function isCancelledTransfer(cause: unknown): boolean {
    return canceled.value || (cause instanceof Error && cause.name === 'CancelledException');
  }

  function warnIfCatBlocksMemoryTransfer(serialPortPath: string): boolean {
    if (!isCatMemoryTransferBlocked(catLockedPorts.value, serialPortPath)) {
      return false;
    }

    toast.add({
      title: CAT_MEMORY_TRANSFER_BLOCKED_TITLE,
      description: CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION,
      color: 'warning',
      icon: 'i-lucide-unplug',
    });

    return true;
  }

  /**
   * Open the read dialog. CAT on another serial port does not block this.
   *
   * With no card open, this is the same guest read as the Radio page button:
   * pick a model and port, then open a temporary clone.
   */
  function openReadFromRadio(): void {
    const id = cardId.value;

    if (!id) {
      if (configurations.value.length === 0) {
        openModulesInstall();
        return;
      }

      directReadOpen.value = true;
      return;
    }

    transferCardId.value = id;
    readOpen.value = true;
  }

  /**
   * Read into a temporary card that is not saved under Preferences.
   */
  async function readIntoGuestCard(request: DirectReadRequest): Promise<void> {
    const guest: GuestRadio = {
      name: request.radioId.name,
      manufacturer: String(request.radioId.manufacturer),
      model: String(request.radioId.model),
      serialPort: request.serialPort,
    };

    if (request.baudRate !== undefined) {
      guest.baudRate = request.baudRate;
    }

    const id = openGuestCard(guest);
    beginTransfer(id);

    try {
      await readFromRadio(request.serialPort, request.radioId, request.baudRate);
    } finally {
      clearTransfer();
    }
  }

  async function readFromRadio(serialPortPath: string, radioId: RadioId, baudRate?: number): Promise<void> {
    const sessionId = actingCardId();

    if (!sessionId) {
      toast.add({
        title: 'No radio open',
        description: 'Add a radio on the Radio page, then read into that card.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    if (warnIfCatBlocksMemoryTransfer(serialPortPath)) {
      return;
    }

    const saved = boundRadio(sessionId);

    if (saved && saved.model !== String(radioId.model)) {
      toast.add({
        title: 'Wrong radio',
        description: `${saved.name} uses ${saved.manufacturer} ${saved.model}.`,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return;
    }

    const config = getConfiguration(radioId);

    if (!config) {
      throw new Error(`Radio configuration for ${radioId.model} was not found`);
    }

    const progressIndicator = startProgress('import');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);
    let outcome: 'success' | 'canceled' | 'error' = 'success';
    let importedBytes = 0;
    let importedImage: Uint8Array | undefined;

    try {
      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);

      if (memoryData == undefined) {
        outcome = 'canceled';
      } else {
        importedBytes = memoryData.length;
        importedImage = memoryData.slice();
        await applyLoadedMemory(memoryData, radioId, sessionId);
        patchSession(sessionId, { memoryFilePath: undefined, radioBaseline: importedImage });
        clearBrowserFileHandle();
      }
    } catch (cause) {
      if (isCancelledTransfer(cause)) {
        outcome = 'canceled';
      } else {
        outcome = 'error';
        const message = cause instanceof Error ? cause.message : 'Unknown error occurred while reading radio';
        progressError.value = message;
        console.error('Failed to read radio', cause);
        logger.withError(cause).error('Failed to read radio');
      }
    } finally {
      captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
    }

    if (outcome === 'success') {
      progressOpen.value = false;
      toast.add({
        title: 'Read from radio',
        description: `${radioId.name} (${importedBytes} bytes)`,
        color: 'success',
        icon: 'i-hambench-radio-read',
      });

      if (importedImage) {
        await saveRadioImageBackup(radioId, importedImage, 'read');
      }

      return;
    }

    if (outcome === 'canceled') {
      progressOpen.value = false;
      toast.add({
        title: 'Read canceled',
        color: 'neutral',
        icon: 'i-lucide-ban',
      });
    }
  }

  /**
   * Open the write dialog unless no memory is loaded.
   */
  function openWriteToRadio(): void {
    const session = readSession(cardId.value);

    if (!session?.memory || !session.activeRadioId) {
      toast.add({
        title: 'Nothing to write',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    transferCardId.value = cardId.value;
    writeOpen.value = true;
  }

  async function writeToRadio(serialPortPath: string, baudRate?: number): Promise<void> {
    const sessionId = actingCardId();
    const session = readSession(sessionId);

    if (!sessionId || !session?.memory || !session.activeRadioId) {
      toast.add({
        title: 'Nothing to write',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    const radioId = session.activeRadioId;
    const config = getConfiguration(radioId);

    if (warnIfCatBlocksMemoryTransfer(serialPortPath)) {
      return;
    }

    if (!config) {
      throw new Error(`Radio configuration for ${radioId.model} was not found`);
    }

    if (!config.writeMemory) {
      toast.add({
        title: 'Write not supported',
        description: `${radioId.name} does not support writing memory to the radio.`,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return;
    }

    await sessionQueue(sessionId);

    const latest = readSession(sessionId);

    if (!latest?.memory || !latest.activeRadioId) {
      return;
    }

    const backupReady = await preparePrewriteBackup(sessionId, latest, radioId, serialPortPath, config, baudRate);

    if (!backupReady) {
      return;
    }

    const imageToWrite = readSession(sessionId)?.memory ?? latest.memory;
    const progressIndicator = startProgress('write');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);
    let outcome: 'success' | 'canceled' | 'error' = 'success';
    const writtenBytes = imageToWrite.length;

    try {
      await driver.writeRadio(serialPortPath, imageToWrite, progressIndicator);
    } catch (cause) {
      if (isCancelledTransfer(cause)) {
        outcome = 'canceled';
      } else {
        outcome = 'error';
        const message = cause instanceof Error ? cause.message : 'Unknown error occurred while writing radio';
        progressError.value = message;
        console.error('Failed to write radio', cause);
        logger.withError(cause).error('Failed to write radio');
      }
    } finally {
      captureSerialLog(sessionId, driver, 'write', radioId, serialPortPath);
    }

    if (outcome === 'success') {
      const written = readSession(sessionId)?.memory ?? imageToWrite;
      patchSession(sessionId, { radioBaseline: written.slice() });
      progressOpen.value = false;
      toast.add({
        title: 'Wrote to radio',
        description: `${radioId.name} (${writtenBytes} bytes)`,
        color: 'success',
        icon: 'i-hambench-radio-write',
      });
      return;
    }

    // The radio may no longer match the last download. The next backup reads it again.
    patchSession(sessionId, { radioBaseline: undefined });

    if (outcome === 'canceled') {
      progressOpen.value = false;
      toast.add({
        title: 'Write canceled',
        color: 'neutral',
        icon: 'i-lucide-ban',
      });
    }
  }

  /**
   * Read the radio into `radioBaseline` without replacing the memory open in the editor.
   * The write review uses that image to show what a write would change.
   */
  async function readRadioForWriteReview(serialPortPath: string, baudRate?: number): Promise<void> {
    const sessionId = actingCardId();
    const session = readSession(sessionId);

    if (!sessionId || !session?.activeRadioId || !session.memory) {
      toast.add({
        title: 'Nothing to compare',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    if (warnIfCatBlocksMemoryTransfer(serialPortPath)) {
      return;
    }

    const radioId = session.activeRadioId;
    const config = getConfiguration(radioId);

    if (!config?.readMemory) {
      toast.add({
        title: 'Read not supported',
        description: `${radioId.name} does not support reading memory from the radio.`,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return;
    }

    await sessionQueue(sessionId);

    const progressIndicator = startProgress('import');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);

    try {
      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);
      progressOpen.value = false;

      if (memoryData == undefined) {
        captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
        toast.add({
          title: 'Read canceled',
          description: 'The loaded memory was not compared.',
          color: 'neutral',
          icon: 'i-lucide-ban',
        });
        return;
      }

      if (memoryData.length === 0) {
        captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
        toast.add({
          title: 'Could not read radio',
          description: 'The radio returned an empty memory image.',
          color: 'error',
          icon: 'i-lucide-circle-alert',
        });
        return;
      }

      patchSession(sessionId, { radioBaseline: memoryData.slice() });
      captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
      toast.add({
        title: 'Read radio',
        description: 'Review compares the loaded memory with this image.',
        color: 'success',
        icon: 'i-hambench-radio-read',
      });
    } catch (cause) {
      progressOpen.value = false;

      if (isCancelledTransfer(cause)) {
        captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
        toast.add({
          title: 'Read canceled',
          description: 'The loaded memory was not compared.',
          color: 'neutral',
          icon: 'i-lucide-ban',
        });
        return;
      }

      const message = cause instanceof Error ? cause.message : 'Unknown error occurred while reading radio';
      logger.withError(cause).error('Failed to read radio for write review');
      captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
      toast.add({
        title: 'Could not read radio',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  /**
   * Save the image currently on the radio before replacing it.
   *
   * Uses the last successful download or write when that still describes the
   * radio. Otherwise reads the radio first. Returns false when the operator
   * stops the write because that backup could not be made.
   */
  async function preparePrewriteBackup(
    sessionId: string,
    session: RadioCardSession,
    radioId: RadioId,
    serialPortPath: string,
    config: LoadedRadioConfig,
    baudRate?: number,
  ): Promise<boolean> {
    const settings = readRadioImageBackupSettings();

    if (!shouldCaptureRadioImageBackup(settings, isTauriRuntime())) {
      return true;
    }

    const image = await prewriteBackupImage(sessionId, session, radioId, serialPortPath, config, baudRate);

    if (image === 'abort') {
      return false;
    }

    if (image === 'skip') {
      return true;
    }

    const captured = await captureRadioImageBackup({
      settings,
      identity: { manufacturer: radioId.manufacturer, model: String(radioId.model) },
      kind: 'prewrite',
      image,
      store: createTauriRadioImageBackupStore(),
    });

    if (captured.status !== 'failed') {
      return true;
    }

    logger.error(`Failed to back up radio image before write: ${captured.message}`);
    await nextTick();
    return confirmWriteWithoutBackup(captured.message);
  }

  /**
   * Bytes already known to be on the radio, or a fresh read when they are not.
   */
  async function prewriteBackupImage(
    sessionId: string,
    session: RadioCardSession,
    radioId: RadioId,
    serialPortPath: string,
    config: LoadedRadioConfig,
    baudRate?: number,
  ): Promise<Uint8Array | 'skip' | 'abort'> {
    const baseline = session.radioBaseline;

    if (baseline && baseline.length > 0) {
      return baseline.slice();
    }

    return readRadioImageForBackup(sessionId, radioId, serialPortPath, config, baudRate);
  }

  /**
   * Read the radio without replacing the image loaded in the editor.
   *
   * Returns image bytes to save, `skip` when the write may continue without a
   * backup, or `abort` when the write should stop.
   */
  async function readRadioImageForBackup(
    sessionId: string,
    radioId: RadioId,
    serialPortPath: string,
    config: LoadedRadioConfig,
    baudRate?: number,
  ): Promise<Uint8Array | 'skip' | 'abort'> {
    const progressIndicator = startProgress('backup');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);

    try {
      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);
      progressOpen.value = false;

      if (memoryData == undefined) {
        captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
        toast.add({
          title: 'Backup canceled',
          description: 'The radio was not written.',
          color: 'neutral',
          icon: 'i-lucide-ban',
        });
        return 'abort';
      }

      if (memoryData.length === 0) {
        await nextTick();
        return confirmWriteWithoutBackup('The radio returned an empty memory image.') ? 'skip' : 'abort';
      }

      return memoryData.slice();
    } catch (cause) {
      progressOpen.value = false;

      if (isCancelledTransfer(cause)) {
        captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
        toast.add({
          title: 'Backup canceled',
          description: 'The radio was not written.',
          color: 'neutral',
          icon: 'i-lucide-ban',
        });
        return 'abort';
      }

      const message = cause instanceof Error ? cause.message : 'Unknown error occurred while reading radio';
      logger.withError(cause).error('Failed to read radio for backup');
      captureSerialLog(sessionId, driver, 'import', radioId, serialPortPath);
      await nextTick();
      return confirmWriteWithoutBackup(message) ? 'skip' : 'abort';
    }
  }

  function confirmWriteWithoutBackup(reason: string): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const proceed = window.confirm(writeWithoutBackupWarning(reason));

    if (!proceed) {
      toast.add({
        title: 'Write canceled',
        description: 'The radio was not changed because a backup could not be saved.',
        color: 'neutral',
        icon: 'i-lucide-ban',
      });
    }

    return proceed;
  }

  async function saveRadioImageBackup(radioId: RadioId, image: Uint8Array, kind: 'read' | 'prewrite'): Promise<void> {
    const settings = readRadioImageBackupSettings();

    if (!shouldCaptureRadioImageBackup(settings, isTauriRuntime())) {
      return;
    }

    const captured = await captureRadioImageBackup({
      settings,
      identity: { manufacturer: radioId.manufacturer, model: String(radioId.model) },
      kind,
      image,
      store: createTauriRadioImageBackupStore(),
    });

    if (captured.status !== 'failed') {
      return;
    }

    logger.error(`Failed to back up radio image: ${captured.message}`);
    toast.add({
      title: kind === 'read' ? 'Read from radio without a backup' : 'Backup was not saved',
      description: captured.message,
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
  }

  async function updateSettings(nextSettings: RadioSettings): Promise<void> {
    if (!program.value || !memory.value || !activeRadioId.value) {
      return;
    }

    persistProgram({
      ...program.value,
      settings: nextSettings,
    });
  }

  async function updateChannel(channelNumber: number, patch: ChannelPatch): Promise<void> {
    if (!program.value || !memory.value || !activeRadioId.value) {
      return;
    }

    const nameMaxLength = channelNameMaxLength(settingsMemoryMap.value);
    persistProgram({
      ...program.value,
      channels: program.value.channels.map((programmed) => {
        if (programmed.channelNumber !== channelNumber) {
          return programmed;
        }

        return applyChannelPatch(programmed, patch, { nameMaxLength });
      }),
    });
  }

  async function addChannel(programmed: RadioProgrammedChannel): Promise<boolean> {
    if (!program.value || !memory.value || !activeRadioId.value) {
      toast.add({
        title: 'Nothing to add to',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return false;
    }

    const capacity = channelCapacity(settingsMemoryMap.value);

    if (programmed.channelNumber < 0 || programmed.channelNumber >= capacity) {
      toast.add({
        title: 'Cannot add channel',
        description: 'That memory slot is outside this radio\'s channel range.',
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return false;
    }

    if (program.value.channels.some((channel) => channel.channelNumber === programmed.channelNumber)) {
      toast.add({
        title: 'Slot in use',
        description: `Memory slot ${programmed.channelNumber} is already programmed.`,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return false;
    }

    persistProgram({
      ...program.value,
      channels: [...program.value.channels, programmed].sort((left, right) => left.channelNumber - right.channelNumber),
    });

    toast.add({
      title: 'Channel added',
      description: `Memory slot ${programmed.channelNumber} was added to the loaded image.`,
      color: 'success',
      icon: 'i-lucide-plus',
    });
    return true;
  }

  async function addChannels(programmed: RadioProgrammedChannel[], sessionId?: string): Promise<number> {
    const id = sessionId ?? cardId.value;
    const session = readSession(id);

    if (!id || !session?.program || !session.memory || !session.activeRadioId) {
      toast.add({
        title: 'Nothing to add to',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return 0;
    }

    if (programmed.length === 0) {
      return 0;
    }

    const capacity = channelCapacity(session.settingsMemoryMap);
    const occupied = new Set(session.program.channels.map((channel) => channel.channelNumber));
    const accepted = programmed.filter((channel) => {
      return channel.channelNumber >= 0 && channel.channelNumber < capacity && !occupied.has(channel.channelNumber);
    });

    if (accepted.length === 0) {
      toast.add({
        title: 'Could not add channels',
        description: 'No unused memory slots were available.',
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return 0;
    }

    persistProgram(
      {
        ...session.program,
        channels: [...session.program.channels, ...accepted].sort(
          (left, right) => left.channelNumber - right.channelNumber,
        ),
      },
      id,
    );

    const first = accepted[0]!.channelNumber;
    const last = accepted[accepted.length - 1]!.channelNumber;
    const saved = radios.value.find((radio) => radio.id === id);
    const radioName = saved?.name ?? session.activeRadioId.name;
    const slotLabel = accepted.length === 1 ? `memory slot ${first}` : `memory slots ${first} to ${last}`;

    toast.add({
      title: accepted.length === 1 ? 'Channel added' : 'Channels added',
      description: `${accepted.length === 1 ? '1 channel' : `${accepted.length} channels`} added to ${radioName} in ${slotLabel}.`,
      color: 'success',
      icon: 'i-lucide-plus',
    });
    return accepted.length;
  }

  async function reorderChannels(fromIndex: number, toIndex: number): Promise<Map<number, number>> {
    if (!program.value || !memory.value || !activeRadioId.value) {
      return new Map();
    }

    const result = reorderProgrammedChannels(program.value.channels, fromIndex, toIndex);

    if (result.previousToNext.size === 0) {
      return result.previousToNext;
    }

    persistProgram({
      ...program.value,
      channels: result.channels,
    });

    return result.previousToNext;
  }

  async function removeChannels(channelNumbers: number[]): Promise<void> {
    if (!program.value || !memory.value || !activeRadioId.value || channelNumbers.length === 0) {
      return;
    }

    const remove = new Set(channelNumbers);
    persistProgram({
      ...program.value,
      channels: program.value.channels.filter((channel) => !remove.has(channel.channelNumber)),
    });

    toast.add({
      title: channelNumbers.length === 1 ? 'Channel removed' : 'Channels removed',
      description:
        channelNumbers.length === 1
          ? `Memory slot ${channelNumbers[0]} was cleared in the loaded image.`
          : `${channelNumbers.length} memory slots were cleared in the loaded image.`,
      color: 'success',
      icon: 'i-lucide-trash-2',
    });
  }

  function persistProgram(nextProgram: RadioProgram, sessionId?: string): void {
    const id = sessionId ?? cardId.value;

    if (!id) {
      return;
    }

    patchSession(id, {
      program: nextProgram,
      channels: rowsFromProgram(nextProgram),
    });

    const queued = sessionQueue(id)
      .then(async () => {
        const session = readSession(id);

        if (!session?.program || !session.memory || !session.activeRadioId) {
          return;
        }

        const codec = await getCodec(session.activeRadioId);

        if (!codec) {
          return;
        }

        const encoded = codec.encode(session.program, {
          radioModel: session.activeRadioId.model,
          contents: session.memory,
        });

        patchSession(id, { memory: encoded.contents });
      })
      .catch((cause) => {
        logger.withError(cause).error('Failed to encode radio program');
      });

    cardPersistQueues.set(id, queued);
  }

  function cancelTransfer(): void {
    canceled.value = true;
    progressOpen.value = false;
  }

  function captureSerialLog(
    sessionId: string,
    driver: SerialLoggedDriver,
    operation: SerialLogOperation,
    radioId: RadioId,
    serialPortPath: string,
  ): void {
    const log = driver.getSerialLogData();
    const entryCount = serialLogEntryCount(log);

    if (entryCount === 0) {
      patchSession(sessionId, { serialLog: undefined });
      return;
    }

    patchSession(sessionId, {
      serialLog: {
        fileName: defaultSerialLogFileName(operation, radioId),
        contents: serializeSerialLogFile({
          operation,
          radioId,
          serialPortPath,
          log,
        }),
        entryCount,
        operation,
        log,
      },
    });
  }

  async function saveSerialLog(): Promise<void> {
    const captured = serialLog.value;

    if (!captured) {
      toast.add({
        title: 'No serial log',
        description: 'Read from or write to a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    try {
      const destination = await saveJsonFileWithPicker(captured.contents, captured.fileName, {
        title: 'Save Serial Log',
        filterName: 'Serial Log',
      });

      if (destination === undefined) {
        return;
      }

      toast.add({
        title: 'Serial log saved',
        description: `${memoryFileDisplayName(destination)} · ${captured.entryCount} frames`,
        color: 'success',
        icon: 'i-lucide-file-text',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save serial log';
      logger.withError(cause).error('Failed to save serial log');
      toast.add({
        title: 'Could not save serial log',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  /**
   * Load a saved backup image into the open radio card so it can be written back.
   */
  async function restoreRadioImageBackup(fileName: string): Promise<boolean> {
    const sessionId = cardId.value;

    if (!sessionId) {
      toast.add({
        title: 'No radio open',
        description: 'Add a radio on the Radio page, then restore a backup into that card.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return false;
    }

    const parsed = parseBackupFileName(fileName);
    const config = parsed ? matchBackupConfiguration(configurations.value, parsed) : undefined;

    if (!parsed || !config) {
      toast.add({
        title: 'Cannot restore backup',
        description: parsed
          ? `Install the ${parsed.manufacturer} ${parsed.model} driver, then try again.`
          : 'That file is not a HamBench radio image backup.',
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return false;
    }

    try {
      const image = await loadRadioImageBackup(fileName);
      await applyLoadedMemory(image, config.id, sessionId);
      patchSession(sessionId, { memoryFilePath: undefined });
      clearBrowserFileHandle();
      toast.add({
        title: 'Backup restored',
        description: `${config.id.name} (${image.length} bytes). Write it to the radio to put this image back.`,
        color: 'success',
        icon: 'i-lucide-archive-restore',
      });
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to restore the radio image backup';
      logger.withError(cause).error('Failed to restore radio image backup');
      toast.add({
        title: 'Could not restore backup',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return false;
    }
  }

  async function openMemoryFile(): Promise<void> {
    const sessionId = cardId.value;

    if (!sessionId) {
      toast.add({
        title: 'No radio open',
        description: 'Add a radio on the Radio page, then open a memory file into that card.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    try {
      const picked = await readTextFileWithPicker();

      if (picked === undefined) {
        return;
      }

      const loaded = parseRadioMemoryFile(picked.text);
      await applyLoadedMemory(loaded.contents, loaded.radioId, sessionId);
      patchSession(sessionId, { memoryFilePath: picked.path });
      toast.add({
        title: 'Memory opened',
        description: `${memoryFileDisplayName(picked.path)} · ${loaded.radioId.name} (${loaded.contents.length} bytes)`,
        color: 'success',
        icon: 'i-lucide-folder-open',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to open radio memory';
      logger.withError(cause).error('Failed to open radio memory');
      toast.add({
        title: 'Could not open memory',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  async function saveMemoryFile(): Promise<void> {
    await saveMemory(false);
  }

  async function saveMemoryFileAs(): Promise<void> {
    await saveMemory(true);
  }

  async function saveMemory(saveAs: boolean): Promise<void> {
    const sessionId = cardId.value;
    const session = readSession(sessionId);

    if (!sessionId || !session?.memory || !session.activeRadioId) {
      toast.add({
        title: 'Nothing to save',
        description: 'Open a memory file or read from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    try {
      await sessionQueue(sessionId);

      const latest = readSession(sessionId);

      if (!latest?.memory || !latest.activeRadioId) {
        return;
      }

      const contents = serializeRadioMemoryFile(latest.activeRadioId, latest.memory);
      const currentPath = latest.memoryFilePath;
      let destination: string;

      if (shouldPromptForSavePath(currentPath, saveAs) || currentPath === undefined) {
        const suggestedPath = currentPath ?? defaultMemoryFileName(latest.activeRadioId);
        const picked = await writeTextFileWithPicker(contents, suggestedPath);

        if (picked === undefined) {
          return;
        }

        destination = picked;
      } else {
        destination = currentPath;
        await writeTextFile(destination, contents);
      }

      patchSession(sessionId, { memoryFilePath: destination });
      toast.add({
        title: saveAs ? 'Memory saved as' : 'Memory saved',
        description: `${memoryFileDisplayName(destination)} (${latest.memory.length} bytes)`,
        color: 'success',
        icon: 'i-lucide-save',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to save radio memory';
      logger.withError(cause).error('Failed to save radio memory');
      toast.add({
        title: 'Could not save memory',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  async function applyLoadedMemory(memoryData: Uint8Array, radioId: RadioId, sessionId?: string): Promise<void> {
    const id = sessionId ?? actingCardId();

    if (!id) {
      throw new Error('Open a radio card before loading memory');
    }

    const saved = boundRadio(id);

    if (saved && saved.model !== String(radioId.model)) {
      throw new Error(
        `${saved.name} is set up as ${saved.manufacturer} ${saved.model}. This memory is ${radioId.manufacturer} ${radioId.name}.`,
      );
    }

    await sessionQueue(id);

    const config = getConfiguration(radioId);

    if (!config) {
      throw new Error(`No configuration found for ${radioId.manufacturer} ${radioId.name}`);
    }

    writeRememberedRadio(radioId);
    const codec = await getCodec(radioId);
    const decoded = codec?.decode({
      radioModel: radioId.model,
      contents: memoryData,
    });

    patchSession(id, {
      memory: memoryData,
      activeRadioId: radioId,
      program: decoded,
      settingsMemoryMap: memoryMapFromConfig(config),
      channels: rowsFromProgram(decoded),
    });
  }

  return {
    configurations,
    manufacturers,
    isLoading,
    error,
    readOpen,
    directReadOpen,
    writeOpen,
    progressOpen,
    progressKind,
    progress,
    progressError,
    progressStartedAt,
    memory,
    channels,
    program,
    settingsMemoryMap,
    activeRadioId,
    addTargets,
    memoryFilePath,
    serialLog,
    savedRadio,
    cardRadio,
    modulesInstallOpen,
    modulesInstallRequired,
    initialize,
    refreshCatalogState,
    openModulesInstall,
    uninstallRadio,
    getModelsByManufacturer,
    readFromRadio,
    readIntoGuestCard,
    openReadFromRadio,
    openWriteToRadio,
    writeToRadio,
    writeTarget,
    readRadioForWriteReview,
    updateSettings,
    updateChannel,
    addChannel,
    addChannels,
    reorderChannels,
    removeChannels,
    cancelTransfer,
    saveSerialLog,
    openMemoryFile,
    restoreRadioImageBackup,
    saveMemoryFile,
    saveMemoryFileAs,
    clearCardSession,
  };
}

function toRadio(config: LoadedRadioConfig, baudRate?: number): Radio {
  return {
    id: config.id,
    version: config.version,
    description: config.description,
    settingsSchema: config.settingsSchema,
    memoryConfig: config.memoryConfig,
    serialConfig: baudRate === undefined ? config.serialConfig : { ...config.serialConfig, baudRate },
    readMemory: config.readMemory,
    writeMemory: config.writeMemory,
    memoryMap: config.memoryMap,
  };
}

function rowsFromProgram(decoded: RadioProgram | undefined): ChannelRow[] {
  return (decoded?.channels ?? []).flatMap((channel) => {
    if (typeof channel.radioChannel === 'string') {
      return [];
    }

    return [toChannelRow(channel.channelNumber, channel.radioChannel, channel.settings)];
  });
}

function toChannelRow(
  channelNumber: number,
  radioChannel: RadioChannel,
  settings?: RadioSettings,
): ChannelRow {
  return {
    channelNumber,
    name: radioChannel.name ?? '',
    transmit: formatFrequency(radioChannel.transmitFrequency),
    receive: formatFrequency(radioChannel.receiveFrequency),
    txTone: formatToneValue(radioChannel.transmitTone?.tone, radioChannel.transmitTone?.type),
    rxTone: formatToneValue(radioChannel.receiveTone?.tone, radioChannel.receiveTone?.type),
    toneType: formatToneType(radioChannel.transmitTone?.tone, radioChannel.transmitTone?.type),
    transmitFrequencyHz: radioChannel.transmitFrequency,
    receiveFrequencyHz: radioChannel.receiveFrequency,
    settings,
  };
}

function formatFrequency(frequency: number | undefined): string {
  if (frequency === undefined) {
    return 'N/A';
  }

  return (frequency / 1_000_000).toFixed(4);
}

function formatToneValue(tone: number | undefined, type: RadioToneType | undefined): string {
  if (!tone) {
    return '';
  }

  return type === RadioToneType.CTCSS ? (tone / 10).toFixed(1) : tone.toString();
}

function formatToneType(tone: number | undefined, type: RadioToneType | undefined): string {
  if (!tone) {
    return '';
  }

  return type === RadioToneType.CTCSS ? 'CTCSS' : 'DCS';
}
