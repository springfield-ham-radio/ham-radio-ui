<script setup lang="ts">
import { computed } from 'vue';
import { formatChannelPackFetchDetails, type ChannelPackFetchFailure } from '~/utils/channel-pack-fetch';

const props = defineProps<{
  failure: ChannelPackFetchFailure;
  title?: string;
}>();

const toast = useToast();

const detailText = computed(() => formatChannelPackFetchDetails(props.failure));
const alertTitle = computed(() => props.title ?? 'Could not download channel pack');

async function onCopy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(detailText.value);
    toast.add({
      title: 'Copied error details',
      color: 'success',
      icon: 'i-lucide-clipboard-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not copy to the clipboard';
    toast.add({
      title: 'Could not copy',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}
</script>

<template>
  <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" :title="alertTitle">
    <template #description>
      <p class="text-sm">{{ failure.summary }}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          label="Copy details"
          icon="i-lucide-clipboard"
          @click="onCopy"
        />
        <UCollapsible :unmount-on-hide="false">
          <UButton color="neutral" variant="ghost" size="sm" label="Details" trailing-icon="i-lucide-chevron-down" />
          <template #content>
            <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-default">{{
              detailText
            }}</pre>
          </template>
        </UCollapsible>
      </div>
    </template>
  </UAlert>
</template>
