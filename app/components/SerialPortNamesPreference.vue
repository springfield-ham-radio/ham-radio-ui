<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { serialPortMatchKey, serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings, type SerialPortAlias } from '~/utils/serial-port-settings';

const aliases = defineModel<SerialPortAlias[]>({ required: true });

const detectedNames = shallowRef<string[]>([]);
const loadingPorts = shallowRef(false);

const suggestionsByRow = computed(() =>
  aliases.value.map((_, index) => {
    const used = new Set(
      aliases.value
        .filter((alias, aliasIndex) => aliasIndex !== index)
        .map((alias) => serialPortMatchKey(alias.systemName))
        .filter((key) => key.length > 0),
    );

    return detectedNames.value.filter((name) => !used.has(serialPortMatchKey(name)));
  }),
);

const portStatus = computed(() => {
  if (loadingPorts.value) {
    return 'Looking for serial ports…';
  }

  if (detectedNames.value.length === 0) {
    return 'No serial ports detected. Type a system name such as usbserial-A50285BI or COM3.';
  }

  const count = detectedNames.value.length;

  return `${count} serial ${count === 1 ? 'port' : 'ports'} detected. Pick one or type a name.`;
});

function addAlias(): void {
  aliases.value = [...aliases.value, { systemName: '', name: '' }];
}

function removeAlias(index: number): void {
  aliases.value = aliases.value.filter((_, aliasIndex) => aliasIndex !== index);
}

async function refreshPorts(): Promise<void> {
  loadingPorts.value = true;

  try {
    const available = await SerialPort.available_ports();
    const settings = readSerialPortSettings();

    detectedNames.value = serialPortSelectItems(Object.keys(available), {
      filterCommonPorts: settings.filterCommonPorts,
      excludedPortNames: settings.excludedPortNames,
    }).map((port) => port.label);
  } catch (cause) {
    console.error('Failed to list serial ports', cause);
    detectedNames.value = [];
  } finally {
    loadingPorts.value = false;
  }
}

onMounted(() => {
  void refreshPorts();
});
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex flex-col gap-3 px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Port names</p>
          <p class="text-xs text-muted">
            Map a system port to a name you will recognize. Serial port selectors show that name.
          </p>
        </div>
        <UTooltip text="Refresh serial ports">
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="loadingPorts"
            aria-label="Refresh serial ports"
            @click="refreshPorts"
          />
        </UTooltip>
      </div>

      <p class="text-xs text-muted">{{ portStatus }}</p>

      <div
        v-if="aliases.length > 0"
        class="hidden gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]"
      >
        <p class="text-xs font-medium text-muted">System port</p>
        <p class="text-xs font-medium text-muted">Name</p>
        <span />
      </div>

      <div
        v-for="(alias, index) in aliases"
        :key="index"
        class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] sm:items-center"
      >
        <UInputMenu
          v-if="(suggestionsByRow[index]?.length ?? 0) > 0"
          v-model="alias.systemName"
          mode="autocomplete"
          :items="suggestionsByRow[index]"
          placeholder="usbserial-… or COM3"
          aria-label="System port"
          class="w-full"
          open-on-focus
        />
        <UInput
          v-else
          v-model="alias.systemName"
          placeholder="usbserial-… or COM3"
          aria-label="System port"
          class="w-full"
        />
        <UInput
          v-model="alias.name"
          placeholder="Kenwood cable"
          aria-label="Port name"
          class="w-full"
        />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          size="sm"
          aria-label="Remove port name"
          @click="removeAlias(index)"
        />
      </div>

      <div>
        <UButton
          label="Add port name"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-plus"
          @click="addAlias"
        />
      </div>
    </div>
  </div>
</template>
