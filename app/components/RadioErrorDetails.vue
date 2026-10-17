<script setup lang="ts">
import { computed } from 'vue';
import type { RadioErrorReport } from '~/utils/radio-error-report';
import { copyRadioErrorReport, formatRadioErrorReportText } from '~/utils/radio-error-report';

const props = defineProps<{
  report: RadioErrorReport;
  /** UAlert title; defaults to the step label. */
  alertTitle?: string;
}>();

const toast = useToast();

const title = computed(() => props.alertTitle ?? props.report.context.step);
const detailText = computed(() => formatRadioErrorReportText(props.report));

async function onCopy(): Promise<void> {
  try {
    await copyRadioErrorReport(props.report);
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
  <UAlert color="error" variant="subtle" icon="i-lucide-circle-alert" :title="title" class="mb-4">
    <template #description>
      <p class="text-sm">{{ report.summary }}</p>
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
