<script setup lang="ts">
const { progressOpen, progressKind, progress, progressError, progressStartedAt, serialLog, cancelTransfer, saveSerialLog } =
  useRadio();

const now = ref(Date.now());

let tickTimer: ReturnType<typeof setInterval> | undefined;

watch(
  progressOpen,
  (open) => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }

    if (open && !progressError.value) {
      now.value = Date.now();
      tickTimer = setInterval(() => {
        now.value = Date.now();
      }, 500);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (tickTimer) {
    clearInterval(tickTimer);
  }
});

const isWrite = computed(() => progressKind.value === 'write');
const title = computed(() => {
  if (progressError.value) {
    return isWrite.value ? 'Write failed' : 'Import failed';
  }

  return isWrite.value ? 'Writing to radio' : 'Importing from radio';
});
const description = computed(() =>
  progressError.value
    ? isWrite.value
      ? 'The radio could not be written. Check the cable connection and try again.'
      : 'The radio could not be read. Check the cable connection and try again.'
    : 'Keep the programming cable connected until this finishes.',
);
const errorTitle = computed(() => (isWrite.value ? 'Could not write radio' : 'Could not read radio'));

const percentValue = computed(() => Math.min(100, Math.max(0, Math.round(progress.value * 100))));

const remainingText = computed(() =>
  formatTimeRemaining(progress.value, progressStartedAt.value, now.value),
);

function formatTimeRemaining(fraction: number, startedAt: number | null, currentTime: number): string | null {
  if (startedAt == null || fraction < 0.02) {
    return null;
  }

  const elapsedMs = currentTime - startedAt;
  if (elapsedMs < 1000) {
    return null;
  }

  const remainingMs = (elapsedMs * (1 - fraction)) / fraction;
  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    return null;
  }

  const totalSeconds = Math.max(1, Math.round(remainingMs / 1000));
  if (totalSeconds < 60) {
    return `about ${totalSeconds}s left`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `about ${minutes}m left` : `about ${minutes}m ${seconds}s left`;
}
</script>

<template>
  <UModal
    v-model:open="progressOpen"
    :title="title"
    :description="description"
    :dismissible="Boolean(progressError)"
    :close="progressError ? { color: 'neutral', variant: 'ghost' } : false"
    class="max-w-md"
  >
    <template #body>
      <UAlert
        v-if="progressError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="errorTitle"
        :description="progressError"
      />
      <p v-if="progressError && serialLog" class="mt-3 text-sm text-muted">
        {{ serialLog.entryCount }} serial frame{{ serialLog.entryCount === 1 ? '' : 's' }} captured. Save the log to debug the protocol.
      </p>
      <div v-else class="flex flex-col gap-3">
        <UProgress
          :model-value="percentValue"
          :max="100"
          color="primary"
          :ui="{ indicator: 'bg-primary/55' }"
        />
        <p class="flex gap-2 text-sm text-muted">
          <span class="w-10 shrink-0 tabular-nums">{{ percentValue }}%</span>
          <span v-if="remainingText" class="min-w-0 tabular-nums">{{ remainingText }}</span>
        </p>
      </div>
    </template>

    <template #footer="{ close: dismiss }">
      <div class="flex w-full justify-end gap-2">
        <UButton
          v-if="progressError && serialLog"
          color="neutral"
          variant="outline"
          label="Save serial log"
          icon="i-lucide-file-text"
          @click="saveSerialLog"
        />
        <UButton
          v-if="progressError"
          color="neutral"
          variant="outline"
          label="Close"
          @click="dismiss"
        />
        <UButton v-else color="neutral" variant="outline" label="Cancel" @click="cancelTransfer" />
      </div>
    </template>
  </UModal>
</template>
