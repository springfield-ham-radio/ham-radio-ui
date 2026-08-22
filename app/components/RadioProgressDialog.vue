<script setup lang="ts">
const { progressOpen, progress, progressError, progressStartedAt, cancelImport } = useRadio();

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

const title = computed(() => (progressError.value ? 'Import failed' : 'Importing from radio'));
const description = computed(() =>
  progressError.value
    ? 'The radio could not be read. Check the cable connection and try again.'
    : 'Keep the programming cable connected until this finishes.',
);

const statusText = computed(() => {
  const percent = Math.round(progress.value * 100);
  const remaining = formatTimeRemaining(progress.value, progressStartedAt.value, now.value);
  return remaining ? `${percent}% · ${remaining}` : `${percent}%`;
});

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

function close(): void {
  progressOpen.value = false;
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
        title="Could not read radio"
        :description="progressError"
      />
      <div v-else class="flex flex-col gap-3">
        <UProgress :value="progress * 100" color="neutral" />
        <p class="text-sm text-muted">{{ statusText }}</p>
      </div>
    </template>

    <template #footer="{ close: dismiss }">
      <div class="flex w-full justify-end">
        <UButton
          v-if="progressError"
          color="neutral"
          variant="outline"
          label="Close"
          @click="dismiss"
        />
        <UButton v-else color="neutral" variant="outline" label="Cancel" @click="cancelImport" />
      </div>
    </template>
  </UModal>
</template>
