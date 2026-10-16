<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import {
  addToRadioRowsWithoutErrors,
  addToRadioValidationRows,
  rowHasValidationErrors,
  type ChannelValidationLicense,
  type ChannelValidationRadio,
} from '~/utils/channel-validation';

const open = defineModel<boolean>('open', { required: true });

const props = withDefaults(
  defineProps<{
    channels: Array<Partial<RadioChannel>>;
    slotNumbers: number[];
    radio: ChannelValidationRadio;
    license?: ChannelValidationLicense;
    pending?: boolean;
    title?: string;
    /** Primary label when every copied row is free of errors. */
    cleanLabel?: string;
  }>(),
  {
    title: 'Channel checks',
    cleanLabel: 'Add to radio',
  },
);

const emit = defineEmits<{
  confirm: [mode: 'all' | 'valid-only'];
}>();

const rows = computed(() =>
  addToRadioValidationRows(props.channels, props.slotNumbers, props.radio, props.license),
);
const hasValidationErrors = computed(() => rows.value.some((row) => rowHasValidationErrors(row)));
const allRowsHaveErrors = computed(
  () => rows.value.length > 0 && rows.value.every((row) => rowHasValidationErrors(row)),
);
const validRowCount = computed(() => addToRadioRowsWithoutErrors(rows.value).length);
const primaryLabel = computed(() => (hasValidationErrors.value ? 'Skip invalid' : props.cleanLabel));

function confirm(mode: 'all' | 'valid-only'): void {
  if (props.pending) {
    return;
  }

  if (mode === 'valid-only' && validRowCount.value === 0) {
    return;
  }

  emit('confirm', mode);
}

function confirmPrimary(): void {
  confirm(hasValidationErrors.value ? 'valid-only' : 'all');
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    description="Review how these channels fit the radio before they are copied."
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div class="space-y-2">
        <ChannelFitList :rows="rows" />
        <p v-if="hasValidationErrors && !allRowsHaveErrors" class="text-xs text-muted">
          {{ validRowCount }} of {{ rows.length }} channels can be copied without errors.
        </p>
        <p v-else-if="allRowsHaveErrors" class="text-xs text-error">
          Every channel has at least one error for this radio. You can still copy them anyway.
        </p>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton
        v-if="hasValidationErrors"
        color="neutral"
        variant="outline"
        label="Add anyway"
        :disabled="pending"
        :loading="pending"
        @click="confirm('all')"
      />
      <UButton
        color="primary"
        :label="primaryLabel"
        :disabled="pending || (hasValidationErrors && validRowCount === 0)"
        :loading="pending"
        @click="confirmPrimary"
      />
    </template>
  </UModal>
</template>
