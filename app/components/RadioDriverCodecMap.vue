<script setup lang="ts">
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import {
  CODEC_ROLE_LABELS,
  describeMemoryMap,
  formatCodecAddress,
  groupLayoutBands,
  type CodecFieldSlot,
  type CodecStructView,
} from '~/utils/codec-display';

const props = defineProps<{
  memoryMap: RadioMemoryMap;
  memoryConfig?: RadioMemoryConfig;
  preferRole?: 'records' | 'names' | 'extras';
  preferId?: string;
}>();

const described = computed(() => describeMemoryMap(props.memoryMap));

const selectedId = ref<string | undefined>();

watch(
  () => [props.memoryMap, props.preferRole, props.preferId] as const,
  ([memoryMap, preferRole, preferId]) => {
    const view = describeMemoryMap(memoryMap);
    const preferred =
      (preferRole ? view.structs.find((struct) => struct.role === preferRole) : undefined) ??
      (preferId ? view.structs.find((struct) => struct.id === preferId) : undefined) ??
      view.structs[0];
    selectedId.value = preferred?.id;
  },
  { immediate: true },
);

const selectedStruct = computed(() => {
  return described.value.structs.find((struct) => struct.id === selectedId.value) ?? described.value.structs[0];
});

const bands = computed(() => {
  return selectedStruct.value ? groupLayoutBands(selectedStruct.value.layout.slots) : [];
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

function percentFor(start: number, end: number): string {
  return `${((end - start + 1) / addressSpan.value) * 100}%`;
}

function offsetFor(start: number): string {
  return `${((start - addressRange.value.start) / addressSpan.value) * 100}%`;
}

const FIELD_TONES = [
  'bg-primary/15 text-primary ring-primary/25',
  'bg-info/15 text-info ring-info/25',
  'bg-warning/15 text-warning ring-warning/25',
  'bg-success/15 text-success ring-success/25',
] as const;

function slotTone(slot: CodecFieldSlot, index: number): string {
  if (slot.reserved) {
    return 'bg-elevated text-muted ring-default';
  }

  return FIELD_TONES[index % FIELD_TONES.length] ?? FIELD_TONES[0];
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

const BIT_INDEXES = [7, 6, 5, 4, 3, 2, 1, 0];
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-1 py-2">
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
            @click="selectedId = struct.id"
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
          @click="selectedId = struct.id"
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

      <div v-if="selectedStruct" class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">{{ selectedStruct.id }}</h3>
            <p class="text-xs text-muted">
              {{ formatCodecAddress(selectedStruct.span.start) }}–{{ formatCodecAddress(selectedStruct.span.end) }}
              · {{ structSummary(selectedStruct) }}
              <span v-if="selectedStruct.stride"> · stride {{ selectedStruct.stride }}</span>
            </p>
          </div>
          <p v-if="selectedStruct.notes.length" class="text-xs text-muted">
            {{ selectedStruct.notes.join(' · ') }}
          </p>
        </div>

        <p class="mb-2 text-[11px] font-medium text-muted">Record layout</p>
        <div class="flex flex-wrap gap-1">
          <template v-for="(band, bandIndex) in bands" :key="`${band.kind}-${bandIndex}`">
            <UTooltip
              v-if="band.kind === 'field'"
              :text="slotTitle(band.slot)"
              :delay-duration="200"
            >
              <div
                class="flex min-h-12 flex-col justify-center rounded-md px-1.5 py-1 ring-1"
                :class="slotTone(band.slot, bandIndex)"
                :style="{ flex: `${band.slot.size} 1 ${Math.max(band.slot.size * 2.75, 4.5)}rem` }"
              >
                <span class="truncate font-mono text-[11px] font-medium">{{ band.slot.id }}</span>
                <span class="text-[10px] opacity-80">{{ band.slot.typeLabel }} · +{{ band.slot.offset }}</span>
              </div>
            </UTooltip>
            <div
              v-else
              class="flex min-h-12 min-w-40 flex-1 flex-col justify-center gap-1 rounded-md bg-elevated px-1.5 py-1 ring-1 ring-default"
            >
              <div class="grid grid-cols-8 gap-px">
                <div
                  v-for="bit in BIT_INDEXES"
                  :key="bit"
                  class="rounded-sm px-0.5 py-1 text-center font-mono text-[9px] leading-none ring-1"
                  :class="bitSlot(band.slots, bit) ? slotTone(bitSlot(band.slots, bit)!, bandIndex) : 'bg-default text-muted ring-default'"
                  :title="bitSlot(band.slots, bit)?.id"
                >
                  {{ bit }}
                </div>
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
                <th class="py-1 pr-3 font-medium">Type</th>
                <th class="py-1 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="slot in selectedStruct.layout.slots"
                :key="slot.id"
                class="border-t border-default"
                :class="slot.reserved ? 'text-muted' : 'text-highlighted'"
              >
                <td class="py-1 pr-3 font-mono tabular-nums">
                  +{{ slot.offset }}<span v-if="slot.bitWidth">.{{ slot.bitOffset }}</span>
                </td>
                <td class="py-1 pr-3 font-mono">
                  {{ slot.id }}
                  <span v-if="slot.reserved" class="text-muted"> (reserved)</span>
                </td>
                <td class="py-1 pr-3">{{ slot.typeLabel }}</td>
                <td class="py-1">{{ slot.valueKind ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
