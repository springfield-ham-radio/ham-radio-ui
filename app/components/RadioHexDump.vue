<script setup lang="ts">
import type { RadioMemory } from '@springfield/ham-radio-api';
import { decodeMemoryMap } from '@springfield/ham-radio-utils';
import {
  collectCodecByteHits,
  codecSelectionOffsets,
  describeMemoryMap,
  type CodecByteHit,
  type CodecSelection,
} from '~/utils/codec-display';
import { memoryMapFromConfig } from '~/utils/radio-catalog-db';

const props = defineProps<{
  memory: RadioMemory;
}>();

const { configurations, activeRadioId } = useRadio();

const selectedConfig = computed(() => {
  const modelId = activeRadioId.value?.model;

  if (!modelId) {
    return undefined;
  }

  return configurations.value.find((config) => config.id.model === modelId);
});

const memoryMap = computed(() => {
  return selectedConfig.value ? memoryMapFromConfig(selectedConfig.value) : undefined;
});

const memoryConfig = computed(() => selectedConfig.value?.memoryConfig);

const described = computed(() => (memoryMap.value ? describeMemoryMap(memoryMap.value) : undefined));

const selection = ref<CodecSelection>({
  structId: '',
  instanceIndex: 0,
});

watch(
  described,
  (view) => {
    const first = view?.structs[0];

    if (!view || !first) {
      return;
    }

    const current = view.structs.find((struct) => struct.id === selection.value.structId) ?? first;
    const instanceIndex = Math.min(selection.value.instanceIndex, Math.max(current.count - 1, 0));
    const fieldStillExists = current.layout.slots.some((slot) => slot.id === selection.value.fieldId);

    selection.value = {
      structId: current.id,
      instanceIndex,
      fieldId: fieldStillExists ? selection.value.fieldId : undefined,
    };
  },
  { immediate: true },
);

const decoded = computed(() => {
  if (!memoryMap.value || !memoryConfig.value) {
    return undefined;
  }

  try {
    return markRaw(decodeMemoryMap(memoryMap.value, props.memory.contents, memoryConfig.value));
  } catch {
    return undefined;
  }
});

const hits = computed(() => {
  if (!described.value) {
    return new Map<number, CodecByteHit[]>();
  }

  try {
    return markRaw(collectCodecByteHits(described.value, props.memory.contents.length, memoryConfig.value));
  } catch {
    return new Map<number, CodecByteHit[]>();
  }
});

const selectionOffsets = computed(() => {
  if (!described.value || !selection.value.structId) {
    return { instance: [] as number[], field: [] as number[] };
  }

  return codecSelectionOffsets(
    described.value,
    selection.value,
    props.memory.contents.length,
    memoryConfig.value,
  );
});

function onSelectHit(hit: CodecByteHit): void {
  selection.value = {
    structId: hit.structId,
    instanceIndex: hit.instanceIndex,
    fieldId: hit.fieldId,
  };
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <div v-if="memoryMap && memoryMap.structs.length > 0" class="flex min-h-0 flex-1 gap-2 overflow-hidden">
      <div class="flex min-h-0 min-w-0 flex-[1.15] flex-col overflow-hidden">
        <HexDump
          :memory="memory"
          :memory-config="memoryConfig"
          :hits="hits"
          :selection="selection"
          :instance-offsets="selectionOffsets.instance"
          :field-offsets="selectionOffsets.field"
          @select="onSelectHit"
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <RadioHexMap
          :memory-map="memoryMap"
          :memory-config="memoryConfig"
          :contents="memory.contents"
          :decoded="decoded"
          :selection="selection"
          @update:selection="selection = $event"
        />
      </div>
    </div>
    <HexDump v-else :memory="memory" />
  </div>
</template>
