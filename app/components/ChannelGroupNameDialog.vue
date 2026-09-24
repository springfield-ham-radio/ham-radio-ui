<script setup lang="ts">
import { CHANNEL_GROUP_NAME_MAX_LENGTH, normalizeChannelGroupName, validateChannelGroupName } from '~/utils/channel-groups';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  title: string;
  description: string;
  confirmLabel: string;
  existingNames: string[];
  pending: boolean;
  initialName?: string;
}>();

const emit = defineEmits<{
  confirm: [name: string];
}>();

const name = shallowRef('');
const nameError = shallowRef<string | undefined>();

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  name.value = props.initialName ?? '';
  nameError.value = undefined;
});

function submit(): void {
  const error = validateChannelGroupName(name.value, props.existingNames);
  nameError.value = error;

  if (error) {
    return;
  }

  emit('confirm', normalizeChannelGroupName(name.value));
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :ui="{ footer: 'justify-end' }">
    <template #body>
      <form id="channel-group-name-form" @submit.prevent="submit">
        <UFormField label="Name" :error="nameError">
          <UInput
            v-model="name"
            autofocus
            placeholder="Travel"
            :maxlength="CHANNEL_GROUP_NAME_MAX_LENGTH"
            class="w-full"
          />
        </UFormField>
      </form>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton type="submit" form="channel-group-name-form" color="primary" :label="confirmLabel" :loading="pending" />
    </template>
  </UModal>
</template>
