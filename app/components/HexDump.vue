<script setup lang="ts">
import type { RadioMemory, RadioMemoryConfig } from '@springfield/ham-radio-api';
import {
  bufferOffsetToRadioAddress,
  codecHitAtOffset,
  CODEC_BYTE_FIELD_TONES,
  CODEC_BYTE_TONES,
  type CodecByteHit,
  type CodecSelection,
} from '~/utils/codec-display';
import {
  formatHexDumpAddress,
  formatHexDumpAscii,
  formatHexDumpByte,
  HEX_DUMP_BYTES_PER_ROW,
  HEX_DUMP_ROW_HEIGHT_PX,
  hexDumpRowCount,
  hexDumpRowIndex,
} from '~/utils/hex-dump';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';

const props = defineProps<{
  memory: RadioMemory;
  memoryConfig?: RadioMemoryConfig;
  hits?: Map<number, CodecByteHit[]>;
  selection?: CodecSelection;
  instanceOffsets?: number[];
  fieldOffsets?: number[];
}>();

const emit = defineEmits<{
  select: [hit: CodecByteHit];
}>();

const dumpRef = useTemplateRef<HTMLElement>('dumpRef');

const rowCount = computed(() => hexDumpRowCount(props.memory.contents.length));

const { virtualRows, paddingTop, paddingBottom, scrollToIndex } = useFixedVirtualRows(
  rowCount,
  dumpRef,
  HEX_DUMP_ROW_HEIGHT_PX,
  8,
);

const selectedFieldOffsets = computed(() => new Set(props.fieldOffsets ?? []));
const selectedInstanceOffsets = computed(() => new Set(props.instanceOffsets ?? []));
const firstSelectedOffset = computed(() => {
  const fieldOffsets = props.fieldOffsets ?? [];
  const instanceOffsets = props.instanceOffsets ?? [];
  const source = fieldOffsets.length > 0 ? fieldOffsets : instanceOffsets;
  return source[0];
});

function rowOffsets(rowIndex: number): number[] {
  const start = rowIndex * HEX_DUMP_BYTES_PER_ROW;
  const length = Math.min(HEX_DUMP_BYTES_PER_ROW, props.memory.contents.length - start);
  const offsets = new Array<number>(length);

  for (let index = 0; index < length; index += 1) {
    offsets[index] = start + index;
  }

  return offsets;
}

function rowAddress(rowIndex: number): string {
  const offset = rowIndex * HEX_DUMP_BYTES_PER_ROW;
  const memoryConfig = props.memoryConfig;
  const radioAddress =
    memoryConfig === undefined
      ? offset
      : (bufferOffsetToRadioAddress(offset, memoryConfig, props.memory.contents.length) ?? offset);

  return formatHexDumpAddress(radioAddress);
}

function byteValue(offset: number): string {
  return formatHexDumpByte(props.memory.contents[offset] ?? 0);
}

function asciiChar(offset: number): string {
  return formatHexDumpAscii(props.memory.contents[offset] ?? 0);
}

function asciiClass(offset: number): string {
  return selectedFieldOffsets.value.has(offset) || selectedInstanceOffsets.value.has(offset)
    ? 'text-highlighted'
    : 'text-warning';
}

function byteClass(offset: number): string {
  const selection = props.selection;
  const hit = props.hits ? codecHitAtOffset(props.hits, offset) : undefined;
  const inField = selectedFieldOffsets.value.has(offset);
  const inInstance = selectedInstanceOffsets.value.has(offset);

  if (inField) {
    const tone = CODEC_BYTE_FIELD_TONES[(hit?.slotIndex ?? 0) % CODEC_BYTE_FIELD_TONES.length];
    return `${tone} rounded-sm ring-1 ring-primary/60`;
  }

  if (inInstance) {
    const tone = CODEC_BYTE_TONES[(hit?.slotIndex ?? 0) % CODEC_BYTE_TONES.length];
    return `${tone} rounded-sm`;
  }

  if (hit && selection && hit.structId === selection.structId) {
    return 'text-highlighted bg-elevated rounded-sm';
  }

  return 'text-highlighted';
}

function byteTitle(offset: number): string {
  const hit = props.hits ? codecHitAtOffset(props.hits, offset) : undefined;

  if (!hit) {
    return `0x${offset.toString(16).toUpperCase()}`;
  }

  return `${hit.structId} · ${hit.fieldId} · #${hit.instanceIndex}`;
}

function onDumpClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const raw = target.dataset.offset;
  if (raw === undefined) {
    return;
  }

  const hit = props.hits ? codecHitAtOffset(props.hits, Number(raw)) : undefined;
  if (hit) {
    emit('select', hit);
  }
}

watch(
  firstSelectedOffset,
  (offset) => {
    if (offset === undefined) {
      return;
    }

    const index = Math.min(hexDumpRowIndex(offset), Math.max(rowCount.value - 1, 0));

    nextTick(() => {
      scrollToIndex(index, 'auto');
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-default font-mono text-sm ring-1 ring-default">
    <div class="flex border-b border-default bg-elevated px-4 py-2 text-muted">
      <div class="mr-8 min-w-[8ch]">Address</div>
      <div class="mr-8 min-w-[48ch]">Data</div>
      <div class="min-w-[16ch]">ASCII</div>
    </div>
    <div ref="dumpRef" class="min-h-0 flex-1 overflow-y-auto px-4" @click="onDumpClick">
      <div :style="{ paddingTop: `${paddingTop}px`, paddingBottom: `${paddingBottom}px` }">
        <div v-for="virtualRow in virtualRows" :key="virtualRow.key" class="flex h-5" :data-hex-row="virtualRow.index">
          <div class="mr-8 min-w-[8ch] text-toned">{{ rowAddress(virtualRow.index) }}</div>
          <div class="mr-8 flex min-w-[48ch]">
            <span
              v-for="offset in rowOffsets(virtualRow.index)"
              :key="offset"
              class="mr-2 w-[2ch] cursor-pointer text-center"
              :class="byteClass(offset)"
              :title="byteTitle(offset)"
              :data-offset="offset"
              :data-hex-selected="offset === firstSelectedOffset ? 'true' : undefined"
            >
              {{ byteValue(offset) }}
            </span>
          </div>
          <div class="min-w-[16ch]">
            <span v-for="offset in rowOffsets(virtualRow.index)" :key="offset" :class="asciiClass(offset)">{{
              asciiChar(offset)
            }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
