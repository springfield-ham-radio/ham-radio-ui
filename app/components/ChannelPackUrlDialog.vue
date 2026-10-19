<script setup lang="ts">
import { ChannelPackFetchError, fetchChannelPack } from '~/utils/channel-pack-fetch';
import type { ChannelPackDocument } from '~/utils/channel-pack';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  initialUrl?: string;
  fetching?: boolean;
}>();

const emit = defineEmits<{
  fetched: [payload: { pack: ChannelPackDocument; requestedUrl: string }];
}>();

const url = ref('');
const failure = shallowRef<import('~/utils/channel-pack-fetch').ChannelPackFetchFailure | null>(null);
const loading = ref(false);

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  url.value = props.initialUrl ?? '';
  failure.value = null;
});

async function submit(): Promise<void> {
  if (loading.value || props.fetching) {
    return;
  }

  loading.value = true;
  failure.value = null;

  try {
    const result = await fetchChannelPack(url.value);
    open.value = false;
    emit('fetched', { pack: result.pack, requestedUrl: result.requestedUrl });
  } catch (cause) {
    if (cause instanceof ChannelPackFetchError) {
      failure.value = cause.details;
    } else {
      const message = cause instanceof Error ? cause.message : 'Channel pack download failed';
      failure.value = {
        summary: message,
        requestedUrl: url.value.trim(),
        cause,
      };
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import channel pack from URL"
    description="Download a .hpack file on demand. HamBench does not check for updates in the background."
    modal
    dismissible
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Pack URL" required class="w-full">
          <UInput
            v-model="url"
            type="url"
            class="w-full"
            placeholder="https://"
            :disabled="loading || fetching"
            @keyup.enter="submit"
          />
        </UFormField>
        <ChannelPackFetchAlert v-if="failure" :failure="failure" />
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" :disabled="loading" @click="close" />
      <UButton color="primary" label="Fetch pack" :loading="loading || fetching" @click="submit" />
    </template>
  </UModal>
</template>
