<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import type { RadioMemoryMap } from '@springfield/ham-radio-api';
import { filterMemoryConfig, filterMemoryMap, formatCodecJson } from '~/utils/codec-display';
import { formatProtocolJson, formatSerialSummary } from '~/utils/protocol-display';
import { memoryMapFromConfig } from '~/utils/radio-catalog-db';

const { configurations, activeRadioId } = useRadio();
const toast = useToast();

const driverTab = ref('read');
const viewMode = ref<'diagram' | 'json'>('diagram');
const copying = ref(false);

const selectedConfig = computed(() => {
  const modelId = activeRadioId.value?.model;

  if (!modelId) {
    return undefined;
  }

  return configurations.value.find((config) => config.id.model === modelId);
});

const driverItems = computed<TabsItem[]>(() => [
  { label: 'Read', icon: 'i-lucide-download', slot: 'read' as const, value: 'read' },
  { label: 'Write', icon: 'i-lucide-upload', slot: 'write' as const, value: 'write' },
  { label: 'Channels', icon: 'i-lucide-list', slot: 'channels' as const, value: 'channels' },
  { label: 'Settings', icon: 'i-lucide-sliders-horizontal', slot: 'settings' as const, value: 'settings' },
]);

const viewItems = computed<TabsItem[]>(() => [
  {
    label: driverTab.value === 'read' || driverTab.value === 'write' ? 'Diagram' : 'Map',
    icon: 'i-lucide-waypoints',
    value: 'diagram',
  },
  { label: 'JSON', icon: 'i-lucide-braces', value: 'json' },
]);

const serialSummary = computed(() => {
  return selectedConfig.value ? formatSerialSummary(selectedConfig.value.serialConfig) : undefined;
});

const readSteps = computed(() => selectedConfig.value?.readMemory ?? []);
const writeSteps = computed(() => selectedConfig.value?.writeMemory ?? []);
const memoryMap = computed<RadioMemoryMap | undefined>(() => {
  return selectedConfig.value ? memoryMapFromConfig(selectedConfig.value) : undefined;
});
const channelsMap = computed(() => (memoryMap.value ? filterMemoryMap(memoryMap.value, 'channels') : undefined));
const settingsMap = computed(() => (memoryMap.value ? filterMemoryMap(memoryMap.value, 'settings') : undefined));
const channelsMemoryConfig = computed(() => filterMemoryConfig(selectedConfig.value?.memoryConfig, 'channels'));
const settingsMemoryConfig = computed(() => filterMemoryConfig(selectedConfig.value?.memoryConfig, 'settings'));

const currentJson = computed(() => {
  if (driverTab.value === 'channels') {
    return channelsMap.value ? formatCodecJson(channelsMap.value) : '';
  }

  if (driverTab.value === 'settings') {
    return settingsMap.value ? formatCodecJson(settingsMap.value) : '';
  }

  const steps = driverTab.value === 'write' ? writeSteps.value : readSteps.value;
  return formatProtocolJson(steps);
});

const jsonEmpty = computed(() => {
  if (driverTab.value === 'channels') {
    return !channelsMap.value || channelsMap.value.structs.length === 0;
  }

  if (driverTab.value === 'settings') {
    return !settingsMap.value || settingsMap.value.structs.length === 0;
  }

  const steps = driverTab.value === 'write' ? writeSteps.value : readSteps.value;
  return steps.length === 0;
});

async function copyJson(): Promise<void> {
  copying.value = true;

  try {
    await navigator.clipboard.writeText(currentJson.value);
    toast.add({
      title: 'Copied JSON',
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not copy to the clipboard';
    toast.add({
      title: 'Copy failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <RadioMemoryEmpty v-if="!activeRadioId" />
    <p v-else-if="!selectedConfig" class="pt-2 text-sm text-muted">
      No driver configuration is installed for this radio.
    </p>

    <template v-else>
      <div class="flex shrink-0 items-center justify-between gap-2">
        <UTabs
          v-model="driverTab"
          color="neutral"
          variant="pill"
          size="sm"
          :items="driverItems"
          :content="false"
          class="w-auto"
          :ui="{
            list: 'w-auto',
            trigger: 'grow-0',
          }"
        />
        <div class="flex items-center gap-2">
          <UTabs
            v-model="viewMode"
            :items="viewItems"
            :content="false"
            color="neutral"
            variant="pill"
            size="xs"
            class="w-auto"
            :ui="{ list: 'w-auto', trigger: 'grow-0' }"
          />
          <UButton
            v-if="viewMode === 'json'"
            icon="i-lucide-copy"
            color="neutral"
            variant="outline"
            size="xs"
            label="Copy"
            :loading="copying"
            :disabled="jsonEmpty"
            @click="copyJson"
          />
        </div>
      </div>

      <RadioDriverProtocolPanel
        v-if="driverTab === 'read'"
        :protocol="readSteps"
        :memory-config="selectedConfig.memoryConfig"
        :serial-summary="serialSummary"
        :view-mode="viewMode"
      />
      <RadioDriverProtocolPanel
        v-else-if="driverTab === 'write'"
        :protocol="writeSteps"
        :memory-config="selectedConfig.memoryConfig"
        :serial-summary="serialSummary"
        :view-mode="viewMode"
      />
      <RadioDriverCodecPanel
        v-else-if="driverTab === 'channels'"
        :memory-map="channelsMap"
        :memory-config="channelsMemoryConfig"
        :view-mode="viewMode"
        scope="channels"
      />
      <RadioDriverCodecPanel
        v-else
        :memory-map="settingsMap"
        :memory-config="settingsMemoryConfig"
        :view-mode="viewMode"
        scope="settings"
      />
    </template>
  </div>
</template>
