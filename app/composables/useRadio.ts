import type {
  Radio,
  RadioChannel,
  RadioCodec,
  RadioId,
  RadioMemoryMap,
  RadioProgram,
  RadioProgressIndicator,
  RadioSettings,
} from '@springfield/ham-radio-api';
import { RadioToneType } from '@springfield/ham-radio-api';
import { CodecFactory, baofengMemoryMap, type BaofengConfig } from '@springfield/radio-module-baofeng';
import { ConsoleTransport, LogLayer } from 'loglayer';
import uv5rConfig from '#baofeng-uv5r';
import { applyChannelPatch, channelNameMaxLength, type ChannelPatch } from '~/utils/channel-edit';
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
  writeTextFile,
  writeTextFileWithPicker,
} from '~/utils/radio-memory-file-io';

interface LoadedRadioConfig extends Radio {
  codec?: {
    type: string;
    reference?: string;
    config?: Record<string, unknown>;
  };
}

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

const codecFactory = new CodecFactory();
let persistQueue: Promise<void> = Promise.resolve();

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
  const progressOpen = useState('radio-progress-open', () => false);
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

  async function initialize(): Promise<void> {
    if (configurations.value.length > 0 || isLoading.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const config = uv5rConfig as LoadedRadioConfig;
      configurations.value = [config];
      manufacturers.value = [...new Set(configurations.value.map((item) => item.id.manufacturer))].sort();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Failed to load radio configurations';
    } finally {
      isLoading.value = false;
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

    if (!config?.codec?.config) {
      return undefined;
    }

    return codecFactory.createCodec(radioId.model, config.codec.config, logger);
  }

  async function importFromRadio(serialPortPath: string, radioId: RadioId): Promise<void> {
    const config = getConfiguration(radioId);

    if (!config) {
      throw new Error(`Radio configuration for ${radioId.model} was not found`);
    }

    canceled.value = false;
    progress.value = 0;
    progressError.value = null;
    progressStartedAt.value = Date.now();
    progressOpen.value = true;

    const progressIndicator: RadioProgressIndicator = {
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

    try {
      const { RadioDriver } = await import('@springfield/ham-radio-driver');
      const driver = new RadioDriver(toRadio(config), logger);
      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);

      if (memoryData == undefined) {
        progressOpen.value = false;
        return;
      }

      await applyLoadedMemory(memoryData, radioId);
      memoryFilePath.value = undefined;
      clearBrowserFileHandle();
      progressOpen.value = false;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown error occurred while reading radio';
      progressError.value = message;
      console.error('Failed to read radio', cause);
      logger.withError(cause).error('Failed to read radio');
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

  function cancelImport(): void {
    canceled.value = true;
    progressOpen.value = false;
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
    settingsMemoryMap.value = baofengMemoryMap((config.codec?.config ?? {}) as BaofengConfig);
    channels.value = rowsFromProgram(decoded);
  }

  return {
    configurations,
    manufacturers,
    isLoading,
    error,
    importOpen,
    progressOpen,
    progress,
    progressError,
    progressStartedAt,
    memory,
    channels,
    program,
    settingsMemoryMap,
    activeRadioId,
    memoryFilePath,
    initialize,
    getModelsByManufacturer,
    importFromRadio,
    updateSettings,
    updateChannel,
    cancelImport,
    openMemoryFile,
    saveMemoryFile,
    saveMemoryFileAs,
  };
}

function toRadio(config: LoadedRadioConfig): Radio {
  return {
    id: config.id,
    version: config.version,
    description: config.description,
    settingsSchema: config.settingsSchema,
    memoryConfig: config.memoryConfig,
    serialConfig: config.serialConfig,
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
