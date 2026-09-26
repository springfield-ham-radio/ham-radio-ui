<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import { createDriverSegment, type DriverSegmentDraft } from '~/utils/driver-draft';

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

function addSegment(): void {
  patch({ segments: [...draft.value.segments, createDriverSegment()] });
}

function removeSegment(id: string): void {
  patch({ segments: draft.value.segments.filter((segment) => segment.id !== id) });
}
</script>

<template>
  <div class="flex max-w-3xl flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField label="Chunk size" required :error="errorAt('memory.chunkSize')" description="Default bytes per block.">
        <UInput v-model="chunkSize" class="w-full font-mono" inputmode="numeric" />
      </UFormField>
      <UFormField label="Address size" required :error="errorAt('memory.addressSize')" description="Bytes used for $address.">
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
      <div>
        <p class="text-sm font-medium text-highlighted">Segments</p>
        <p class="text-xs text-muted">End address is inclusive. 0–1023 is 1024 bytes.</p>
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
          inputmode="numeric"
          @update:model-value="updateSegment(segment.id, { startAddress: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="End" :error="errorAt(`memory.segments.${segment.id}.endAddress`)">
        <UInput
          :model-value="segment.endAddress"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="updateSegment(segment.id, { endAddress: String($event ?? '') })"
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
