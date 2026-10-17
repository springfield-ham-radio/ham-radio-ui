<script setup lang="ts">
import type { ChannelPackMetadata } from '~/utils/channel-pack';
import { countRepeaterBookChannels } from '~/utils/channel-pack';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  groupName: string;
  channelCount: number;
  channels: readonly { sourceFormat?: string }[];
  initial: ChannelPackMetadata;
}>();

const emit = defineEmits<{
  save: [payload: { metadata: ChannelPackMetadata; includeRepeaterBook: boolean }];
}>();

const name = ref('');
const description = ref('');
const author = ref('');
const version = ref('');
const source = ref('');
const includeRepeaterBook = ref(false);
const saving = ref(false);

const repeaterBookCount = computed(() => countRepeaterBookChannels(props.channels as never));

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      saving.value = false;
      return;
    }

    name.value = props.initial.name;
    description.value = props.initial.description ?? '';
    author.value = props.initial.author ?? '';
    version.value = props.initial.version;
    source.value = props.initial.source ?? '';
    includeRepeaterBook.value = false;
  },
);

function submit(): void {
  saving.value = true;
  emit('save', {
    metadata: {
      id: props.initial.id,
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      author: author.value.trim() || undefined,
      version: version.value.trim(),
      updated: new Date().toISOString(),
      source: source.value.trim() || undefined,
    },
    includeRepeaterBook: includeRepeaterBook.value,
  });
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Export channel pack"
    :description="`Group “${groupName}” · ${channelCount} ${channelCount === 1 ? 'channel' : 'channels'}`"
    modal
    dismissible
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput v-model="name" maxlength="40" />
        </UFormField>
        <UFormField label="Author">
          <UInput v-model="author" />
        </UFormField>
        <UFormField label="Version" required>
          <UInput v-model="version" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="description" :rows="3" />
        </UFormField>
        <UFormField label="Source URL">
          <UInput v-model="source" type="url" placeholder="https://" />
        </UFormField>
        <UAlert
          v-if="repeaterBookCount > 0"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${repeaterBookCount} RepeaterBook ${repeaterBookCount === 1 ? 'row' : 'rows'} will be left out`"
          description="Include them only with written permission from RepeaterBook."
        />
        <UCheckbox
          v-if="repeaterBookCount > 0"
          v-model="includeRepeaterBook"
          label="Include RepeaterBook rows"
        />
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton color="primary" label="Save .hpack" :loading="saving" @click="submit" />
    </template>
  </UModal>
</template>
