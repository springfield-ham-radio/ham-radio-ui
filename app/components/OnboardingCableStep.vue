<script setup lang="ts">
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

defineProps<{
  fieldError?: string;
}>();

const emit = defineEmits<{
  selection: [selection: { port: string | undefined; livePorts: string[]; loading: boolean }];
}>();

const desktop = isTauriRuntime();
const selection = ref({ port: undefined as string | undefined, livePorts: [] as string[], loading: false });

function onSelection(next: { port: string | undefined; livePorts: string[]; loading: boolean }): void {
  selection.value = next;
  emit('selection', next);
}
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
      <p class="text-sm font-medium text-highlighted">Programming cable</p>
      <p class="mt-1 text-xs text-muted">
        Plug in the programming cable and choose the port HamBench just listed. A port remembered from an earlier
        session does not count. Continue saves a radio for each model you picked that already has a driver.
      </p>
    </div>

    <UAlert
      v-if="!desktop"
      color="warning"
      variant="subtle"
      icon="i-lucide-monitor"
      title="Desktop app required"
      description="Serial ports need the HamBench desktop app. You can skip this step."
    />
    <template v-else>
      <UAlert
        v-if="!selection.loading && selection.livePorts.length === 0"
        color="warning"
        variant="subtle"
        icon="i-lucide-usb"
        title="No programming port listed"
        description="Plug in the programming cable, then press Refresh. Filtered system ports are hidden. Skip does not create a radio."
      />
      <RadioPortDialog embedded @selection="onSelection" />
      <p v-if="fieldError" class="text-sm text-error">{{ fieldError }}</p>
    </template>
  </div>
</template>
