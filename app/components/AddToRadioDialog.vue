<script setup lang="ts">
import type { PrivilegeAssessment } from '~/utils/license-people';
import type { SavedChannel } from '~/utils/saved-channels-db';
import { describeLibrarySlotAssignment } from '~/utils/channel-edit';
import type { RadioAddTarget } from '~/composables/useRadio';
import {
  addToRadioRowsWithoutErrors,
  addToRadioValidationRows,
  rowHasValidationErrors,
} from '~/utils/channel-validation';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  channels: SavedChannel[];
  targets: RadioAddTarget[];
  preferredId?: string;
  pending?: boolean;
  licenseForTarget: (targetId: string) => PrivilegeAssessment;
}>();

const emit = defineEmits<{
  confirm: [payload: { sessionId: string; mode: 'all' | 'valid-only' }];
}>();

const selectedId = shallowRef<string | undefined>();

const title = computed(() => (props.channels.length === 1 ? 'Add channel to radio' : 'Add channels to radio'));
const selectedTarget = computed(() => props.targets.find((target) => target.id === selectedId.value));

const validationRows = computed(() => {
  const target = selectedTarget.value;

  if (!target?.ready || target.freeSlotNumbers.length === 0) {
    return [];
  }

  const license = props.licenseForTarget(target.id);

  return addToRadioValidationRows(
    props.channels,
    target.freeSlotNumbers,
    {
      bands: target.bands,
      memoryMap: target.settingsMemoryMap,
      channelSchema: target.channelSchema,
    },
    license,
  );
});

const hasValidationErrors = computed(() => validationRows.value.some((row) => rowHasValidationErrors(row)));
const allRowsHaveErrors = computed(
  () => validationRows.value.length > 0 && validationRows.value.every((row) => rowHasValidationErrors(row)),
);
const validRowCount = computed(() => addToRadioRowsWithoutErrors(validationRows.value).length);

const description = computed(() =>
  describeLibrarySlotAssignment({
    radioName: selectedTarget.value?.name ?? 'the selected radio',
    sourceCount: props.channels.length,
    slotNumbers: selectedTarget.value?.freeSlotNumbers ?? [],
  }),
);

const canAdd = computed(() => {
  const target = selectedTarget.value;
  return Boolean(target?.ready && target.freeSlotNumbers.length > 0 && props.channels.length > 0 && !props.pending);
});

const primaryAddLabel = computed(() => (hasValidationErrors.value ? 'Skip invalid' : 'Add to radio'));

const radioItems = computed(() =>
  props.targets.map((target) => ({
    label: target.name,
    value: target.id,
    description: radioTargetDescription(target),
    disabled: !target.ready || target.freeSlotNumbers.length === 0,
  })),
);

function radioTargetDescription(target: RadioAddTarget): string {
  if (!target.ready) {
    return `${target.modelLabel} · no memory loaded`;
  }

  const count = target.freeSlotNumbers.length;

  if (count === 0) {
    return `${target.modelLabel} · no unused slots`;
  }

  const noun = count === 1 ? 'unused slot' : 'unused slots';
  return `${target.modelLabel} · ${count} ${noun}`;
}

function chooseDefaultRadio(): void {
  const available = props.targets.filter((target) => target.ready && target.freeSlotNumbers.length > 0);
  const preferred = available.find((target) => target.id === props.preferredId);
  selectedId.value = preferred?.id ?? available[0]?.id;
}

function confirm(mode: 'all' | 'valid-only'): void {
  if (!selectedId.value || !canAdd.value) {
    return;
  }

  if (mode === 'valid-only' && validRowCount.value === 0) {
    return;
  }

  emit('confirm', { sessionId: selectedId.value, mode });
}

function confirmPrimary(): void {
  confirm(hasValidationErrors.value ? 'valid-only' : 'all');
}

watch(open, (isOpen) => {
  if (isOpen) {
    chooseDefaultRadio();
  }
});

watch(
  () => props.targets,
  () => {
    if (!open.value) {
      return;
    }

    const current = props.targets.find((target) => target.id === selectedId.value);

    if (current?.ready && current.freeSlotNumbers.length > 0) {
      return;
    }

    chooseDefaultRadio();
  },
);
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    description="Choose which open radio receives these channels."
    :ui="{ content: 'sm:max-w-2xl', footer: 'justify-end gap-2' }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Radio">
          <USelectMenu
            v-model="selectedId"
            :items="radioItems"
            value-key="value"
            :search-input="targets.length > 8"
            placeholder="Select a radio"
            color="neutral"
            class="w-full"
          />
        </UFormField>
        <p class="text-sm text-muted">{{ description }}</p>
        <div v-if="validationRows.length > 0" class="space-y-2">
          <p class="text-sm font-medium text-highlighted">Channel checks</p>
          <ChannelFitList :rows="validationRows" />
          <p v-if="hasValidationErrors && !allRowsHaveErrors" class="text-xs text-muted">
            {{ validRowCount }} of {{ validationRows.length }} channels can be added without errors.
          </p>
          <p v-else-if="allRowsHaveErrors" class="text-xs text-error">
            Every channel has at least one error for this radio. You can still add them anyway.
          </p>
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton
        v-if="hasValidationErrors"
        color="neutral"
        variant="outline"
        label="Add anyway"
        :disabled="!canAdd"
        :loading="pending"
        @click="confirm('all')"
      />
      <UButton
        color="primary"
        :label="primaryAddLabel"
        :disabled="!canAdd || (hasValidationErrors && validRowCount === 0)"
        :loading="pending"
        @click="confirmPrimary"
      />
    </template>
  </UModal>
</template>
