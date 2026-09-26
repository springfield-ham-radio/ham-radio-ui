<script setup lang="ts">
import type { DriverExpectDraft, DriverExpectMode, DriverToken } from '~/utils/driver-draft';

const props = defineProps<{
  expect: DriverExpectDraft;
  label: string;
  description?: string;
  error?: string;
}>();

const emit = defineEmits<{
  'update:expect': [expect: DriverExpectDraft];
}>();

const modeItems = [
  { label: 'Do not wait', value: 'none' },
  { label: 'Exact bytes', value: 'exact' },
  { label: 'Any number of bytes', value: 'bytes' },
  { label: 'Until a delimiter', value: 'until' },
];

function patch(partial: Partial<DriverExpectDraft>): void {
  emit('update:expect', { ...props.expect, ...partial });
}

function isMode(value: unknown): value is DriverExpectMode {
  return value === 'none' || value === 'exact' || value === 'bytes' || value === 'until';
}

function onMode(value: unknown): void {
  if (isMode(value)) {
    patch({ mode: value });
  }
}

function onUntil(tokens: DriverToken[]): void {
  const until = tokens[0];

  if (until) {
    patch({ until });
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UFormField :label="label" :description="description">
      <USelect
        :model-value="expect.mode"
        :items="modeItems"
        value-key="value"
        class="w-full max-w-xs"
        @update:model-value="onMode"
      />
    </UFormField>
    <DriverTokenField
      v-if="expect.mode === 'exact'"
      :tokens="expect.tokens"
      label="Exact reply"
      description="Each token is one byte, one character, or a $placeholder."
      :error="error"
      @update:tokens="patch({ tokens: $event })"
    />
    <UFormField v-else-if="expect.mode === 'bytes'" label="Byte count" :error="error">
      <UInput
        :model-value="expect.byteCount"
        class="w-28 font-mono"
        inputmode="numeric"
        @update:model-value="patch({ byteCount: String($event ?? '') })"
      />
    </UFormField>
    <DriverTokenField
      v-else-if="expect.mode === 'until'"
      :tokens="[expect.until]"
      label="Read until"
      description="The delimiter itself is not included in the reply."
      :error="error"
      fixed
      @update:tokens="onUntil"
    />
  </div>
</template>
