<script setup lang="ts">
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import { formatCodecJson, type MemoryMapScope } from '~/utils/codec-display';

const props = defineProps<{
  memoryMap?: RadioMemoryMap;
  memoryConfig?: RadioMemoryConfig;
  viewMode: 'diagram' | 'json';
  scope: MemoryMapScope;
}>();

const json = computed(() => (props.memoryMap ? formatCodecJson(props.memoryMap) : ''));

const emptyMessage = computed(() => {
  return props.scope === 'channels'
    ? 'This radio has no channel memory map to display.'
    : 'This radio has no settings memory map to display.';
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
    <p v-if="!memoryMap || memoryMap.structs.length === 0" class="text-sm text-muted">{{ emptyMessage }}</p>

    <RadioDriverCodecMap
      v-else-if="viewMode === 'diagram'"
      :memory-map="memoryMap"
      :memory-config="memoryConfig"
      :prefer-role="scope === 'channels' ? 'records' : undefined"
      :prefer-id="scope === 'settings' ? 'settings' : undefined"
    />
    <JsonCode
      v-else
      :code="json"
      class="min-h-0 flex-1 overflow-auto rounded-xl bg-default shadow-sm ring-1 ring-default"
    />
  </div>
</template>
