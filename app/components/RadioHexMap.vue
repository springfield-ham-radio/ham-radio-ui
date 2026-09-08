<script setup lang="ts">
import type { RadioMemoryConfig, RadioMemoryMap, RadioSettings, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  CODEC_ROLE_LABELS,
  codecDecodedRecord,
  codecInstanceLabel,
  codecSlotTone,
  codecStructInstanceAddress,
  describeMemoryMap,
  formatCodecAddress,
  formatCodecFieldHex,
  formatCodecSettingValue,
  groupLayoutBands,
  type CodecFieldSlot,
  type CodecSelection,
  type CodecStructView,
} from '~/utils/codec-display';

const props = defineProps<{
  memoryMap: RadioMemoryMap;
  memoryConfig?: RadioMemoryConfig;
  contents?: Uint8Array;
  decoded?: RadioSettings;
  selection: CodecSelection;
}>();

const emit = defineEmits<{
  'update:selection': [selection: CodecSelection];
}>();

const described = computed(() => describeMemoryMap(props.memoryMap));

const selectedStruct = computed(() => {
  return described.value.structs.find((struct) => struct.id === props.selection.structId) ?? described.value.structs[0];
});

const instanceIndex = computed(() => {
  const count = selectedStruct.value?.count ?? 1;
  return Math.min(Math.max(props.selection.instanceIndex, 0), Math.max(count - 1, 0));
});

const bands = computed(() => {
  return selectedStruct.value ? groupLayoutBands(selectedStruct.value.layout.slots) : [];
});

const selectedRecord = computed(() => {
  if (!selectedStruct.value) {
    return undefined;
  }

  return codecDecodedRecord(props.decoded, selectedStruct.value, instanceIndex.value);
});

const instanceSpan = computed(() => {
  const struct = selectedStruct.value;

  if (!struct) {
    return undefined;
  }

  const start = codecStructInstanceAddress(struct, instanceIndex.value);
  return {
    start,
    end: start + Math.max(struct.layout.recordSize, 1) - 1,
  };
});

const addressRange = computed(() => {
  const starts: number[] = [];
  const ends: number[] = [];

  for (const struct of described.value.structs) {
    starts.push(struct.span.start);
    ends.push(struct.span.end);
  }

  if (props.memoryConfig) {
    for (const segment of Object.values(props.memoryConfig.segments)) {
      starts.push(segment.startAddress);
      ends.push(segment.endAddress);
    }
  }

  if (starts.length === 0 || ends.length === 0) {
    return { start: 0, end: 0 };
  }

  return {
    start: Math.min(...starts),
    end: Math.max(...ends),
  };
});

const addressSpan = computed(() => addressRange.value.end - addressRange.value.start + 1);
const canPageInstances = computed(() => (selectedStruct.value?.count ?? 1) > 1);
const atFirstInstance = computed(() => instanceIndex.value <= 0);
const atLastInstance = computed(() => instanceIndex.value >= (selectedStruct.value?.count ?? 1) - 1);

function percentFor(start: number, end: number): string {
  return `${((end - start + 1) / addressSpan.value) * 100}%`;
}

function offsetFor(start: number): string {
  return `${((start - addressRange.value.start) / addressSpan.value) * 100}%`;
}

function slotTitle(slot: CodecFieldSlot): string {
  const parts = [slot.uiLabel ?? slot.id, slot.typeLabel];

  if (slot.valueKind && slot.valueKind !== slot.typeLabel) {
    parts.push(slot.valueKind);
  }

  if (slot.reserved) {
    parts.push('reserved');
  }

  return parts.join(' · ');
}

function occupiesBit(slot: CodecFieldSlot, bit: number): boolean {
  if (slot.bitOffset === undefined || slot.bitWidth === undefined) {
    return false;
  }

  const least = slot.bitOffset - (slot.bitWidth - 1);
  return bit <= slot.bitOffset && bit >= least;
}

function bitSlot(slots: CodecFieldSlot[], bit: number): CodecFieldSlot | undefined {
  return slots.find((slot) => occupiesBit(slot, bit));
}

function structSummary(struct: CodecStructView): string {
  const size = struct.layout.recordSize;
  const count = struct.count;

  if (count > 1) {
    return `${count} × ${size} bytes`;
  }

  return `${size} byte${size === 1 ? '' : 's'}`;
}

function selectStruct(structId: string): void {
  const struct = described.value.structs.find((entry) => entry.id === structId);
  const nextIndex = struct && instanceIndex.value < struct.count ? instanceIndex.value : 0;

  emit('update:selection', {
    structId,
    instanceIndex: nextIndex,
    fieldId: undefined,
  });
}

function selectField(fieldId: string): void {
  if (!selectedStruct.value) {
    return;
  }

  emit('update:selection', {
    structId: selectedStruct.value.id,
    instanceIndex: instanceIndex.value,
    fieldId,
  });
}

function goToInstance(nextIndex: number): void {
  if (!selectedStruct.value) {
    return;
  }

  const clamped = Math.min(Math.max(nextIndex, 0), selectedStruct.value.count - 1);

  emit('update:selection', {
    structId: selectedStruct.value.id,
    instanceIndex: clamped,
    fieldId: props.selection.fieldId,
  });
}

function fieldValue(slot: CodecFieldSlot): RadioSettingValue | undefined {
  const record = selectedRecord.value;

  if (record === null || record === undefined) {
    return undefined;
  }

  return record[slot.id];
}

const BIT_INDEXES = [7, 6, 5, 4, 3, 2, 1, 0];
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-default ring-1 ring-default">
    <div class="min-h-0 flex-1 overflow-auto">
      <div class="flex flex-col gap-4 px-3 py-3">
        <div v-if="described.version || described.description" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span v-if="described.version" class="text-xs text-muted">v{{ described.version }}</span>
          <p v-if="described.description" class="text-sm text-muted">{{ described.description }}</p>
        </div>

        <div>
          <p class="mb-1.5 text-xs font-medium text-muted">Address map</p>
          <div class="relative h-10 overflow-hidden rounded-lg bg-elevated ring-1 ring-default">
            <button
              v-for="struct in described.structs"
              :key="struct.id"
              type="button"
              class="absolute top-1 bottom-1 rounded-sm ring-1 transition-colors"
              :class="
                struct.id === selectedStruct?.id
                  ? 'bg-primary/35 ring-primary/50'
                  : 'bg-primary/15 ring-primary/20 hover:bg-primary/25'
              "
              :style="{ left: offsetFor(struct.span.start), width: percentFor(struct.span.start, struct.span.end) }"
              :title="`${struct.id} ${formatCodecAddress(struct.span.start)}–${formatCodecAddress(struct.span.end)}`"
              @click="selectStruct(struct.id)"
            />
          </div>
          <p class="mt-1 flex justify-between font-mono text-[10px] text-muted">
            <span>{{ formatCodecAddress(addressRange.start) }}</span>
            <span>{{ formatCodecAddress(addressRange.end) }}</span>
          </p>
        </div>

        <div class="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto p-px">
          <button
            v-for="struct in described.structs"
            :key="`chip-${struct.id}`"
            type="button"
            class="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs ring-1 transition-colors"
            :class="
              struct.id === selectedStruct?.id
                ? 'bg-primary/15 text-highlighted ring-primary/40'
                : 'bg-default text-toned ring-default hover:bg-elevated'
            "
            @click="selectStruct(struct.id)"
          >
            <span class="font-medium text-highlighted">{{ struct.id }}</span>
            <span class="font-mono text-muted">{{ formatCodecAddress(struct.seek) }}</span>
            <UBadge
              v-if="struct.role"
              :label="CODEC_ROLE_LABELS[struct.role]"
              color="primary"
              variant="subtle"
              size="xs"
            />
          </button>
        </div>

        <div v-if="selectedStruct" class="rounded-xl bg-elevated/50 p-3 ring-1 ring-default">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">{{ selectedStruct.id }}</h3>
              <p class="text-xs text-muted">
                <template v-if="instanceSpan">
                  {{ formatCodecAddress(instanceSpan.start) }}–{{ formatCodecAddress(instanceSpan.end) }}
                </template>
                · {{ structSummary(selectedStruct) }}
                <span v-if="selectedStruct.stride"> · stride {{ selectedStruct.stride }}</span>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge v-if="selectedRecord === null" label="Empty" color="neutral" variant="subtle" size="xs" />
              <div v-if="canPageInstances" class="flex items-center gap-1">
                <UButton
                  icon="i-lucide-chevron-left"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="atFirstInstance"
                  :aria-label="`Previous ${codecInstanceLabel(selectedStruct).toLowerCase()}`"
                  @click="goToInstance(instanceIndex - 1)"
                />
                <span class="min-w-32 whitespace-nowrap px-1 text-center text-xs tabular-nums text-highlighted">
                  {{ codecInstanceLabel(selectedStruct) }} {{ instanceIndex }}
                  <span class="text-muted">of {{ selectedStruct.count }}</span>
                </span>
                <UButton
                  icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="atLastInstance"
                  :aria-label="`Next ${codecInstanceLabel(selectedStruct).toLowerCase()}`"
                  @click="goToInstance(instanceIndex + 1)"
                />
              </div>
            </div>
          </div>

          <p v-if="selectedStruct.notes.length" class="mb-2 text-xs text-muted">
            {{ selectedStruct.notes.join(' · ') }}
          </p>

          <p class="mb-2 text-[11px] font-medium text-muted">Record layout</p>
          <div class="flex flex-wrap gap-1">
            <template v-for="(band, bandIndex) in bands" :key="`${band.kind}-${bandIndex}`">
              <UTooltip
                v-if="band.kind === 'field'"
                :text="slotTitle(band.slot)"
                :delay-duration="200"
              >
                <button
                  type="button"
                  class="flex min-h-12 flex-col justify-center rounded-md px-1.5 py-1 text-left ring-1"
                  :class="[
                    codecSlotTone(band.slot, bandIndex),
                    selection.fieldId === band.slot.id ? 'ring-2 ring-primary' : '',
                  ]"
                  :style="{ flex: `${band.slot.size} 1 ${Math.max(band.slot.size * 2.75, 4.5)}rem` }"
                  @click="selectField(band.slot.id)"
                >
                  <span class="truncate font-mono text-[11px] font-medium">{{ band.slot.id }}</span>
                  <span class="text-[10px] opacity-80">{{ band.slot.typeLabel }} · +{{ band.slot.offset }}</span>
                </button>
              </UTooltip>
              <div
                v-else
                class="flex min-h-12 min-w-40 flex-1 flex-col justify-center gap-1 rounded-md bg-elevated px-1.5 py-1 ring-1 ring-default"
              >
                <div class="grid grid-cols-8 gap-px">
                  <button
                    v-for="bit in BIT_INDEXES"
                    :key="bit"
                    type="button"
                    class="rounded-sm px-0.5 py-1 text-center font-mono text-[9px] leading-none ring-1"
                    :class="[
                      bitSlot(band.slots, bit)
                        ? codecSlotTone(bitSlot(band.slots, bit)!, bandIndex)
                        : 'bg-default text-muted ring-default',
                      bitSlot(band.slots, bit) && selection.fieldId === bitSlot(band.slots, bit)!.id
                        ? 'ring-2 ring-primary'
                        : '',
                    ]"
                    :title="bitSlot(band.slots, bit)?.id"
                    :disabled="!bitSlot(band.slots, bit)"
                    @click="bitSlot(band.slots, bit) && selectField(bitSlot(band.slots, bit)!.id)"
                  >
                    {{ bit }}
                  </button>
                </div>
                <span class="truncate text-[10px] text-muted">
                  {{ band.slots.map((slot) => slot.id).join(' · ') }} · +{{ band.offset }}
                </span>
              </div>
            </template>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="w-full border-collapse text-left text-xs">
              <thead>
                <tr class="text-[11px] text-muted">
                  <th class="py-1 pr-3 font-medium">Offset</th>
                  <th class="py-1 pr-3 font-medium">Field</th>
                  <th class="py-1 pr-3 font-medium">Encoded</th>
                  <th class="py-1 font-medium">Decoded</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="slot in selectedStruct.layout.slots"
                  :key="slot.id"
                  class="cursor-pointer border-t border-default"
                  :class="
                    selection.fieldId === slot.id
                      ? 'bg-primary/10 text-highlighted'
                      : slot.reserved
                        ? 'text-muted'
                        : 'text-highlighted'
                  "
                  @click="selectField(slot.id)"
                >
                  <td class="py-1 pr-3 font-mono tabular-nums">
                    +{{ slot.offset }}<span v-if="slot.bitWidth">.{{ slot.bitOffset }}</span>
                  </td>
                  <td class="py-1 pr-3 font-mono">
                    {{ slot.id }}
                    <span v-if="slot.reserved" class="text-muted"> (reserved)</span>
                  </td>
                  <td class="py-1 pr-3 font-mono tabular-nums">
                    {{
                      contents
                        ? formatCodecFieldHex(contents, selectedStruct, instanceIndex, slot, memoryConfig)
                        : slot.typeLabel
                    }}
                  </td>
                  <td class="py-1">
                    {{ selectedRecord === null ? '—' : formatCodecSettingValue(fieldValue(slot), slot) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
