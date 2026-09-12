import type { RadioId } from '@springfield/ham-radio-api';
import { SerialPort } from 'tauri-plugin-serialplugin';
import {
  programmingBaudRateSelectItems,
  readRememberedBaudRate,
  resolveProgrammingBaudRate,
  shouldSelectProgrammingBaudRate,
  writeRememberedBaudRate,
} from '~/utils/radio-baud-rate';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import { readRememberedRadio, resolveRememberedRadio, writeRememberedRadio } from '~/utils/remembered-radio';
import {
  readRememberedSerialPort,
  resolveRememberedSerialPort,
  writeRememberedSerialPort,
} from '~/utils/remembered-serial-port';
import { holdSerialPortInactive, releaseSerialPortHold } from '~/utils/serial-idle-hold';
import { serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';

export type RadioConnectionFilter = (config: LoadedRadioConfig) => boolean;

export interface RadioConnectionSelection {
  radioId: RadioId;
  serialPortPath: string;
  baudRate: number;
  config: LoadedRadioConfig;
}

/**
 * Shared manufacturer / model / baud / serial-port picker used by Import and CAT.
 */
export function useRadioConnectionForm(options: {
  isOpen: () => boolean;
  filter?: RadioConnectionFilter;
}) {
  const {
    configurations,
    manufacturers,
    isLoading,
    error,
    openModulesInstall,
    refreshCatalogState,
  } = useRadio();

  const selectedManufacturer = ref<string | undefined>();
  const selectedRadio = ref<RadioId | undefined>();
  const selectedPort = ref<string | undefined>();
  const selectedBaudRate = ref<number | undefined>();
  const ports = ref<Array<{ label: string; value: string }>>([]);
  const loadingPorts = ref(false);

  const availableConfigs = computed(() => {
    if (!options.filter) {
      return configurations.value;
    }

    return configurations.value.filter(options.filter);
  });

  const availableManufacturers = computed(() => {
    const names = new Set(availableConfigs.value.map((config) => config.id.manufacturer));
    return manufacturers.value.filter((manufacturer) => names.has(manufacturer));
  });

  const models = computed(() => {
    if (!selectedManufacturer.value) {
      return [];
    }

    return availableConfigs.value
      .filter((config) => config.id.manufacturer === selectedManufacturer.value)
      .map((config) => ({
        label: config.id.name,
        value: config.id,
      }));
  });

  const selectedConfig = computed(() => {
    if (!selectedRadio.value) {
      return undefined;
    }

    return availableConfigs.value.find((config) => config.id.model === selectedRadio.value?.model);
  });

  const baudRateItems = computed(() => {
    if (!selectedConfig.value) {
      return [];
    }

    return programmingBaudRateSelectItems(selectedConfig.value.serialConfig);
  });

  const showBaudRate = computed(() => {
    if (!selectedConfig.value) {
      return false;
    }

    return shouldSelectProgrammingBaudRate(selectedConfig.value.serialConfig);
  });

  const canSubmit = computed(() =>
    Boolean(selectedRadio.value && selectedPort.value && selectedBaudRate.value !== undefined && selectedConfig.value),
  );

  watch(selectedManufacturer, (manufacturer) => {
    if (selectedRadio.value?.manufacturer !== manufacturer) {
      selectedRadio.value = undefined;
    }
  });

  watch(selectedRadio, (radioId) => {
    if (radioId) {
      writeRememberedRadio(radioId);
    }
  });

  watch(
    selectedConfig,
    (config) => {
      if (!config || !selectedRadio.value) {
        selectedBaudRate.value = undefined;
        return;
      }

      selectedBaudRate.value = resolveProgrammingBaudRate(
        config.serialConfig,
        readRememberedBaudRate(selectedRadio.value.model),
      );
    },
    { immediate: true },
  );

  watch(selectedPort, (path) => {
    if (path) {
      writeRememberedSerialPort(path);
    }

    if (!options.isOpen()) {
      return;
    }

    void holdSerialPortInactive(path).catch((cause) => {
      console.error('Failed to hold serial port inactive', cause);
    });
  });

  async function loadPorts(): Promise<void> {
    loadingPorts.value = true;
    const previousPort = selectedPort.value;

    try {
      await releaseSerialPortHold();
      const availablePorts = await SerialPort.available_ports();
      ports.value = serialPortSelectItems(Object.keys(availablePorts), readSerialPortSettings());
      selectedPort.value = resolveRememberedSerialPort(
        readRememberedSerialPort(),
        ports.value.map((port) => port.value),
        selectedPort.value,
      );
    } catch (cause) {
      console.error('Failed to list serial ports', cause);
      ports.value = [];
      selectedPort.value = undefined;
    } finally {
      loadingPorts.value = false;

      if (options.isOpen() && selectedPort.value && selectedPort.value === previousPort) {
        void holdSerialPortInactive(selectedPort.value).catch((holdCause) => {
          console.error('Failed to hold serial port inactive', holdCause);
        });
      }
    }
  }

  async function applyRememberedRadio(): Promise<void> {
    const restored = resolveRememberedRadio(
      readRememberedRadio(),
      availableConfigs.value.map((config) => config.id),
    );

    if (!restored) {
      const current = selectedRadio.value;
      const installed =
        current !== undefined && availableConfigs.value.some((config) => config.id.model === current.model);

      if (!installed) {
        selectedRadio.value = undefined;
        selectedManufacturer.value = undefined;
      }

      return;
    }

    selectedManufacturer.value = restored.manufacturer;
    await nextTick();
    selectedRadio.value = restored;
  }

  async function takeSelection(): Promise<RadioConnectionSelection | undefined> {
    if (!selectedRadio.value || !selectedPort.value || selectedBaudRate.value === undefined || !selectedConfig.value) {
      return undefined;
    }

    writeRememberedBaudRate(selectedRadio.value.model, selectedBaudRate.value);
    await releaseSerialPortHold();

    return {
      radioId: selectedRadio.value,
      serialPortPath: selectedPort.value,
      baudRate: selectedBaudRate.value,
      config: selectedConfig.value,
    };
  }

  watch(
    () => options.isOpen(),
    (open) => {
      if (open) {
        void refreshCatalogState().then(() => applyRememberedRadio());
        void loadPorts();
        return;
      }

      void releaseSerialPortHold();
    },
  );

  return {
    isLoading,
    error,
    selectedManufacturer,
    selectedRadio,
    selectedPort,
    selectedBaudRate,
    ports,
    loadingPorts,
    availableManufacturers,
    models,
    baudRateItems,
    showBaudRate,
    canSubmit,
    openModulesInstall,
    loadPorts,
    takeSelection,
  };
}
