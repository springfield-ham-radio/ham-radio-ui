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
  channelCapacity,
  channelNameMaxLength,
  reorderProgrammedChannels,
  type ChannelPatch,
} from '~/utils/channel-edit';
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
  readTextFileWithPicker,
  saveJsonFileWithPicker,
  writeTextFile,
  writeTextFileWithPicker,
} from '~/utils/radio-memory-file-io';
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

let persistQueue: Promise<void> = Promise.resolve();

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
  const importOpen = useState('radio-import-open', () => false);
  const writeOpen = useState('radio-write-open', () => false);
  const progressOpen = useState('radio-progress-open', () => false);
  const progressKind = useState<'import' | 'write'>('radio-progress-kind', () => 'import');
  const progress = useState('radio-progress', () => 0);
  const progressError = useState<string | null>('radio-progress-error', () => null);
  const progressStartedAt = useState<number | null>('radio-progress-started-at', () => null);
  const canceled = useState('radio-canceled', () => false);
  const memory = useState<Uint8Array | undefined>('radio-memory', () => undefined);
  const channels = useState<ChannelRow[]>('radio-channels', () => []);
  const program = useState<RadioProgram | undefined>('radio-program', () => undefined);
  const settingsMemoryMap = useState<RadioMemoryMap | undefined>('radio-settings-memory-map', () => undefined);
  const activeRadioId = useState<RadioId | undefined>('radio-active-id', () => undefined);
  const memoryFilePath = useState<string | undefined>('radio-memory-file-path', () => undefined);
  const serialLog = useState<CapturedSerialLog | undefined>('radio-serial-log', () => undefined);
  const modulesInstallOpen = useState('radio-modules-install-open', () => false);
  const modulesInstallRequired = useState('radio-modules-install-required', () => false);

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
      const activeModel = activeRadioId.value?.model;

      if (activeModel && removedModelIds.includes(activeModel)) {
        activeRadioId.value = undefined;
        memory.value = undefined;
        channels.value = [];
        program.value = undefined;
        settingsMemoryMap.value = undefined;
        memoryFilePath.value = undefined;
      }

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

  function startProgress(kind: 'import' | 'write'): RadioProgressIndicator {
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

  async function importFromRadio(serialPortPath: string, radioId: RadioId, baudRate?: number): Promise<void> {
    const config = getConfiguration(radioId);

    if (!config) {
      throw new Error(`Radio configuration for ${radioId.model} was not found`);
    }

    const progressIndicator = startProgress('import');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);
    let outcome: 'success' | 'canceled' | 'error' = 'success';
    let importedBytes = 0;

    try {
      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);

      if (memoryData == undefined) {
        outcome = 'canceled';
      } else {
        importedBytes = memoryData.length;
        await applyLoadedMemory(memoryData, radioId);
        memoryFilePath.value = undefined;
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
      captureSerialLog(driver, 'import', radioId, serialPortPath);
    }

    if (outcome === 'success') {
      progressOpen.value = false;
      toast.add({
        title: 'Imported from radio',
        description: `${radioId.name} (${importedBytes} bytes)`,
        color: 'success',
        icon: 'i-lucide-download',
      });
      return;
    }

    if (outcome === 'canceled') {
      progressOpen.value = false;
      toast.add({
        title: 'Import canceled',
        color: 'neutral',
        icon: 'i-lucide-ban',
      });
    }
  }

  function openWriteToRadio(): void {
    if (!memory.value || !activeRadioId.value) {
      toast.add({
        title: 'Nothing to write',
        description: 'Open a memory file or import from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    writeOpen.value = true;
  }

  async function writeToRadio(serialPortPath: string, baudRate?: number): Promise<void> {
    if (!memory.value || !activeRadioId.value) {
      toast.add({
        title: 'Nothing to write',
        description: 'Open a memory file or import from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    const radioId = activeRadioId.value;
    const config = getConfiguration(radioId);

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

    await persistQueue;

    if (!memory.value || !activeRadioId.value) {
      return;
    }

    const progressIndicator = startProgress('write');
    const { RadioDriver } = await import('@springfield/ham-radio-driver');
    const driver = new RadioDriver(toRadio(config, baudRate), logger, undefined, true);
    let outcome: 'success' | 'canceled' | 'error' = 'success';
    const writtenBytes = memory.value.length;

    try {
      await driver.writeRadio(serialPortPath, memory.value, progressIndicator);
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
      captureSerialLog(driver, 'write', radioId, serialPortPath);
    }

    if (outcome === 'success') {
      progressOpen.value = false;
      toast.add({
        title: 'Wrote to radio',
        description: `${radioId.name} (${writtenBytes} bytes)`,
        color: 'success',
        icon: 'i-lucide-upload',
      });
      return;
    }

    if (outcome === 'canceled') {
      progressOpen.value = false;
      toast.add({
        title: 'Write canceled',
        color: 'neutral',
        icon: 'i-lucide-ban',
      });
    }
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
        description: 'Open a memory file or import from a radio first.',
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

  async function addChannels(programmed: RadioProgrammedChannel[]): Promise<number> {
    if (!program.value || !memory.value || !activeRadioId.value) {
      toast.add({
        title: 'Nothing to add to',
        description: 'Open a memory file or import from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return 0;
    }

    if (programmed.length === 0) {
      return 0;
    }

    const capacity = channelCapacity(settingsMemoryMap.value);
    const occupied = new Set(program.value.channels.map((channel) => channel.channelNumber));
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

    persistProgram({
      ...program.value,
      channels: [...program.value.channels, ...accepted].sort((left, right) => left.channelNumber - right.channelNumber),
    });

    const first = accepted[0]!.channelNumber;
    const last = accepted[accepted.length - 1]!.channelNumber;
    const radioName = activeRadioId.value.name;
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

  function persistProgram(nextProgram: RadioProgram): void {
    program.value = nextProgram;
    channels.value = rowsFromProgram(nextProgram);
    persistQueue = persistQueue
      .then(async () => {
        if (!program.value || !memory.value || !activeRadioId.value) {
          return;
        }

        const codec = await getCodec(activeRadioId.value);

        if (!codec) {
          return;
        }

        const encoded = codec.encode(program.value, {
          radioModel: activeRadioId.value.model,
          contents: memory.value,
        });

        memory.value = encoded.contents;
      })
      .catch((cause) => {
        logger.withError(cause).error('Failed to encode radio program');
      });
  }

  function cancelTransfer(): void {
    canceled.value = true;
    progressOpen.value = false;
  }

  function captureSerialLog(
    driver: SerialLoggedDriver,
    operation: SerialLogOperation,
    radioId: RadioId,
    serialPortPath: string,
  ): void {
    const log = driver.getSerialLogData();
    const entryCount = serialLogEntryCount(log);

    if (entryCount === 0) {
      serialLog.value = undefined;
      return;
    }

    serialLog.value = {
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
    };
  }

  async function saveSerialLog(): Promise<void> {
    const captured = serialLog.value;

    if (!captured) {
      toast.add({
        title: 'No serial log',
        description: 'Import from or write to a radio first.',
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

  async function openMemoryFile(): Promise<void> {
    try {
      const picked = await readTextFileWithPicker();

      if (picked === undefined) {
        return;
      }

      const loaded = parseRadioMemoryFile(picked.text);
      await applyLoadedMemory(loaded.contents, loaded.radioId);
      memoryFilePath.value = picked.path;
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
    if (!memory.value || !activeRadioId.value) {
      toast.add({
        title: 'Nothing to save',
        description: 'Open a memory file or import from a radio first.',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      });
      return;
    }

    try {
      await persistQueue;

      if (!memory.value || !activeRadioId.value) {
        return;
      }

      const contents = serializeRadioMemoryFile(activeRadioId.value, memory.value);
      const currentPath = memoryFilePath.value;
      let destination: string;

      if (shouldPromptForSavePath(currentPath, saveAs) || currentPath === undefined) {
        const suggestedPath = currentPath ?? defaultMemoryFileName(activeRadioId.value);
        const picked = await writeTextFileWithPicker(contents, suggestedPath);

        if (picked === undefined) {
          return;
        }

        destination = picked;
      } else {
        destination = currentPath;
        await writeTextFile(destination, contents);
      }

      memoryFilePath.value = destination;
      toast.add({
        title: saveAs ? 'Memory saved as' : 'Memory saved',
        description: `${memoryFileDisplayName(destination)} (${memory.value.length} bytes)`,
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

  async function applyLoadedMemory(memoryData: Uint8Array, radioId: RadioId): Promise<void> {
    await persistQueue;

    const config = getConfiguration(radioId);

    if (!config) {
      throw new Error(`No configuration found for ${radioId.manufacturer} ${radioId.name}`);
    }

    memory.value = memoryData;
    activeRadioId.value = radioId;
    const codec = await getCodec(radioId);
    const decoded = codec?.decode({
      radioModel: radioId.model,
      contents: memoryData,
    });

    program.value = decoded;
    settingsMemoryMap.value = memoryMapFromConfig(config);
    channels.value = rowsFromProgram(decoded);
  }

  return {
    configurations,
    manufacturers,
    isLoading,
    error,
    importOpen,
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
    memoryFilePath,
    serialLog,
    modulesInstallOpen,
    modulesInstallRequired,
    initialize,
    refreshCatalogState,
    openModulesInstall,
    uninstallRadio,
    getModelsByManufacturer,
    importFromRadio,
    openWriteToRadio,
    writeToRadio,
    updateSettings,
    updateChannel,
    addChannel,
    addChannels,
    reorderChannels,
    removeChannels,
    cancelTransfer,
    saveSerialLog,
    openMemoryFile,
    saveMemoryFile,
    saveMemoryFileAs,
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
