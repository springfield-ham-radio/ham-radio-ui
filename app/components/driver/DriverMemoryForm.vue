<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import {
  canonicalizeSkipAddress,
  createDriverSegment,
  formatFinishedDriverAddress,
  type DriverSegmentDraft,
} from '~/utils/driver-draft';

const { draft, compiled, patch } = useDriverDraft();

const endianItems = [
  { label: 'Big endian', value: 'big' },
  { label: 'Little endian', value: 'little' },
];

const chunkSize = computed({
  get: () => draft.value.chunkSize,
  set: (value: string) => patch({ chunkSize: value }),
});
const addressSize = computed({
  get: () => draft.value.addressSize,
  set: (value: string) => patch({ addressSize: value }),
});

function errorAt(path: string): string | undefined {
  return driverFieldError(compiled.value.issues, path);
}

function onEndian(value: unknown): void {
  if (value === 'big' || value === 'little') {
    patch({ addressEndianness: value });
  }
}

function updateSegment(id: string, partial: Partial<DriverSegmentDraft>): void {
  patch({
    segments: draft.value.segments.map((segment) => (segment.id === id ? { ...segment, ...partial } : segment)),
  });
}

function displayAddress(raw: string, force: boolean): string {
  if (!raw.trim()) {
    return raw;
  }

  return force ? canonicalizeSkipAddress(raw) : formatFinishedDriverAddress(raw);
}

const addressesOpened = shallowRef(false);

watch(
  () => draft.value.segments.map((segment) => `${segment.id}:${segment.startAddress}:${segment.endAddress}`).join('|'),
  () => {
    const force = !addressesOpened.value;
    addressesOpened.value = true;
    let changed = false;
    const segments = draft.value.segments.map((segment) => {
      const startAddress = displayAddress(segment.startAddress, force);
      const endAddress = displayAddress(segment.endAddress, force);

      if (startAddress !== segment.startAddress || endAddress !== segment.endAddress) {
        changed = true;
      }

      return { ...segment, startAddress, endAddress };
    });

    if (changed) {
      patch({ segments });
    }
  },
  { immediate: true },
);

function commitAddress(id: string, field: 'startAddress' | 'endAddress', event: FocusEvent): void {
  const target = event.target;
  const value = canonicalizeSkipAddress(target instanceof HTMLInputElement ? target.value : '');
  const current = draft.value.segments.find((segment) => segment.id === id);

  if (current && current[field] !== value) {
    updateSegment(id, { [field]: value });
  }
}

function addSegment(): void {
  patch({ segments: [...draft.value.segments, createDriverSegment()] });
}

function removeSegment(id: string): void {
  patch({ segments: draft.value.segments.filter((segment) => segment.id !== id) });
}
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField label="Chunk size" required :error="errorAt('memory.chunkSize')">
        <template #hint>
          <HelpTooltip text="Default bytes per block." />
        </template>
        <UInput v-model="chunkSize" class="w-full font-mono" inputmode="numeric" />
      </UFormField>
      <UFormField label="Address size" required :error="errorAt('memory.addressSize')">
        <template #hint>
          <HelpTooltip text="Bytes used for $address." />
        </template>
        <UInput v-model="addressSize" class="w-full font-mono" inputmode="numeric" />
      </UFormField>
      <UFormField label="Address endianness">
        <USelect
          :model-value="draft.addressEndianness"
          :items="endianItems"
          value-key="value"
          class="w-full"
          @update:model-value="onEndian"
        />
      </UFormField>
    </div>
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <p class="text-sm font-medium text-highlighted">Segments</p>
        <HelpTooltip text="End address is inclusive. 0x0000–0x03FF is 1024 bytes." />
      </div>
      <UButton label="Add segment" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addSegment" />
    </div>
    <p v-if="errorAt('memory.segments')" class="text-sm text-error">{{ errorAt('memory.segments') }}</p>
    <div v-for="segment in draft.segments" :key="segment.id" class="grid items-end gap-2 rounded-lg bg-muted p-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
      <UFormField label="Name" :error="errorAt(`memory.segments.${segment.id}.name`)">
        <UInput
          :model-value="segment.name"
          class="w-full font-mono"
          placeholder="channels"
          @update:model-value="updateSegment(segment.id, { name: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Start" :error="errorAt(`memory.segments.${segment.id}.startAddress`)">
        <UInput
          :model-value="segment.startAddress"
          class="w-full font-mono"
          placeholder="0x0000"
          spellcheck="false"
          autocapitalize="characters"
          @update:model-value="updateSegment(segment.id, { startAddress: String($event ?? '') })"
          @blur="commitAddress(segment.id, 'startAddress', $event)"
        />
      </UFormField>
      <UFormField label="End" :error="errorAt(`memory.segments.${segment.id}.endAddress`)">
        <UInput
          :model-value="segment.endAddress"
          class="w-full font-mono"
          placeholder="0x0000"
          spellcheck="false"
          autocapitalize="characters"
          @update:model-value="updateSegment(segment.id, { endAddress: String($event ?? '') })"
          @blur="commitAddress(segment.id, 'endAddress', $event)"
        />
      </UFormField>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Remove segment"
        @click="removeSegment(segment.id)"
      />
    </div>
  </div>
</template>
