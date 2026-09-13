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

interface HexRow {
  address: string;
  offsets: number[];
}

const BYTES_PER_ROW = 16;
const dumpRef = ref<HTMLElement>();

const formattedRows = computed(() => {
  const rows: HexRow[] = [];
  const contents = props.memory.contents;
  const memoryConfig = props.memoryConfig;

  for (let i = 0; i < contents.length; i += BYTES_PER_ROW) {
    const length = Math.min(BYTES_PER_ROW, contents.length - i);
    const offsets = Array.from({ length }, (_, byteIndex) => i + byteIndex);
    const radioAddress =
      memoryConfig === undefined
        ? i
        : (bufferOffsetToRadioAddress(i, memoryConfig, contents.length) ?? i);

    rows.push({
      address: radioAddress.toString(16).padStart(8, '0').toUpperCase(),
      offsets,
    });
  }

  return rows;
});

const selectedFieldOffsets = computed(() => new Set(props.fieldOffsets ?? []));
const selectedInstanceOffsets = computed(() => new Set(props.instanceOffsets ?? []));
const firstSelectedOffset = computed(() => {
  const fieldOffsets = props.fieldOffsets ?? [];
  const instanceOffsets = props.instanceOffsets ?? [];
  const source = fieldOffsets.length > 0 ? fieldOffsets : instanceOffsets;
  return source[0];
});

function byteValue(offset: number): string {
  return (props.memory.contents[offset] ?? 0).toString(16).padStart(2, '0').toUpperCase();
}

function asciiChar(offset: number): string {
  const byte = props.memory.contents[offset] ?? 0;
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
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

watch(firstSelectedOffset, (offset) => {
  if (offset === undefined) {
    return;
  }

  nextTick(() => {
    dumpRef.value?.querySelector('[data-hex-selected="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  });
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-default font-mono text-sm ring-1 ring-default">
    <div class="flex border-b border-default bg-elevated px-4 py-2 text-muted">
      <div class="mr-8 min-w-[8ch]">Address</div>
      <div class="mr-8 min-w-[48ch]">Data</div>
      <div class="min-w-[16ch]">ASCII</div>
    </div>
    <div ref="dumpRef" class="min-h-0 flex-1 overflow-y-auto px-4 py-2" @click="onDumpClick">
      <div v-for="row in formattedRows" :key="row.offsets[0]" class="mb-0.5 flex">
        <div class="mr-8 min-w-[8ch] text-toned">{{ row.address }}</div>
        <div class="mr-8 flex min-w-[48ch]">
          <span
            v-for="offset in row.offsets"
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
          <span v-for="offset in row.offsets" :key="offset" :class="asciiClass(offset)">{{ asciiChar(offset) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
