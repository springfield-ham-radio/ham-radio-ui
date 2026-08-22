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
import { defaultMemoryFileName, parseRadioMemoryFile, serializeRadioMemoryFile } from '~/utils/radio-memory-file';
import { readTextFileWithPicker, writeTextFileWithPicker } from '~/utils/radio-memory-file-io';

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

export interface ChannelRow {
  channelNumber: number;
  name: string;
  transmit: string;
  receive: string;
  txTone: string;
  rxTone: string;
  toneType: string;
  transmitFrequencyHz?: number;
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

    const nextProgram: RadioProgram = {
      ...program.value,
      settings: nextSettings,
    };

    program.value = nextProgram;

    const codec = await getCodec(activeRadioId.value);

    if (!codec) {
      return;
    }

    const encoded = codec.encode(nextProgram, {
      radioModel: activeRadioId.value.model,
      contents: memory.value,
    });

    memory.value = encoded.contents;
  }

  function cancelImport(): void {
    canceled.value = true;
    progressOpen.value = false;
  }

  async function openMemoryFile(): Promise<void> {
    try {
      const text = await readTextFileWithPicker();

      if (text === undefined) {
        return;
      }

      const loaded = parseRadioMemoryFile(text);
      await applyLoadedMemory(loaded.contents, loaded.radioId);
      toast.add({
        title: 'Memory opened',
        description: `${loaded.radioId.name} (${loaded.contents.length} bytes)`,
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
      const contents = serializeRadioMemoryFile(activeRadioId.value, memory.value);
      const saved = await writeTextFileWithPicker(contents, defaultMemoryFileName(activeRadioId.value));

      if (!saved) {
        return;
      }

      toast.add({
        title: 'Memory saved',
        description: `${activeRadioId.value.name} (${memory.value.length} bytes)`,
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

    channels.value = (decoded?.channels ?? []).flatMap((channel) => {
      if (typeof channel.radioChannel === 'string') {
        return [];
      }

      return [toChannelRow(channel.channelNumber, channel.radioChannel, channel.settings)];
    });
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
    initialize,
    getModelsByManufacturer,
    importFromRadio,
    updateSettings,
    cancelImport,
    openMemoryFile,
    saveMemoryFile,
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
