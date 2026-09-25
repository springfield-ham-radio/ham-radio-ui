<script setup lang="ts">
import { describeLibrarySlotAssignment } from '~/utils/channel-edit';
import type { RadioAddTarget } from '~/composables/useRadio';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  sourceCount: number;
  targets: RadioAddTarget[];
  preferredId?: string;
  pending?: boolean;
}>();

const emit = defineEmits<{
  confirm: [sessionId: string];
}>();

const selectedId = shallowRef<string | undefined>();

const title = computed(() => (props.sourceCount === 1 ? 'Add channel to radio' : 'Add channels to radio'));
const selectedTarget = computed(() => props.targets.find((target) => target.id === selectedId.value));
const description = computed(() =>
  describeLibrarySlotAssignment({
    radioName: selectedTarget.value?.name ?? 'the selected radio',
    sourceCount: props.sourceCount,
    slotNumbers: selectedTarget.value?.freeSlotNumbers ?? [],
  }),
);
const canConfirm = computed(() => {
  const target = selectedTarget.value;
  return Boolean(target?.ready && target.freeSlotNumbers.length > 0 && props.sourceCount > 0 && !props.pending);
});
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

function confirm(): void {
  if (!selectedId.value || !canConfirm.value) {
    return;
  }

  emit('confirm', selectedId.value);
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
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-3">
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
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton color="primary" label="Add to radio" :disabled="!canConfirm" :loading="pending" @click="confirm" />
    </template>
  </UModal>
</template>
