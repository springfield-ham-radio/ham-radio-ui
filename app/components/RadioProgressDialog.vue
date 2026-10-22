<script setup lang="ts">
const {
  progressOpen,
  progressKind,
  progress,
  progressError,
  progressStartedAt,
  progressSerialLog,
  cancelTransfer,
  saveProgressSerialLog,
  continueWriteWithoutBackupFromDialog,
  dismissBackupFailureProgress,
  onProgressDialogClosed,
} = useRadio();

const waitingForRadioReconnect = useState('serial-port-reconnect-waiting', () => false);

const now = ref(Date.now());

let tickTimer: ReturnType<typeof setInterval> | undefined;

watch(
  progressOpen,
  (open, wasOpen) => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }

    if (!open && wasOpen) {
      onProgressDialogClosed();
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

const progressCopy = computed(() => {
  if (progressKind.value === 'write') {
    return {
      title: progressError.value ? 'Write failed' : 'Writing to radio',
      description: progressError.value
        ? 'The radio could not be written. Check the cable connection and try again.'
        : 'Keep the programming cable connected until this finishes.',
      errorTitle: 'Could not write radio',
    };
  }

  if (progressKind.value === 'backup') {
    return {
      title: progressError.value ? 'Backup failed' : 'Backing up radio',
      description: progressError.value
        ? 'The radio could not be read for a backup. Check the cable connection and try again.'
        : 'Reading the image currently stored in the radio before writing.',
      errorTitle: 'Could not back up radio',
    };
  }

  return {
    title: progressError.value ? 'Read failed' : 'Reading from radio',
    description: progressError.value
      ? 'The radio could not be read. Check the cable connection and try again.'
      : 'Keep the programming cable connected until this finishes.',
    errorTitle: 'Could not read radio',
  };
});
const title = computed(() => progressCopy.value.title);
const description = computed(() => progressCopy.value.description);
const errorTitle = computed(() => progressCopy.value.errorTitle);

const showBackupWithoutSaving = computed(
  () => progressKind.value === 'backup' && Boolean(progressError.value),
);

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

function closeProgress(): void {
  if (showBackupWithoutSaving.value) {
    dismissBackupFailureProgress();
    return;
  }

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
      <RadioErrorDetails v-if="progressError" :report="progressError" :alert-title="errorTitle" />
      <p v-if="progressError && progressSerialLog" class="mt-3 text-sm text-muted">
        {{ progressSerialLog.entryCount }} serial frame{{ progressSerialLog.entryCount === 1 ? '' : 's' }} captured. Save the log here, or inspect it on the Debug tab.
      </p>
      <div v-else-if="!progressError" class="flex flex-col gap-3">
        <UAlert
          v-if="waitingForRadioReconnect"
          color="info"
          variant="soft"
          icon="i-lucide-usb"
          title="Waiting for radio to reconnect…"
          description="The programming port disappeared while the radio restarted. HamBench will continue when it comes back."
        />
        <div
          class="h-2 w-full overflow-hidden rounded-full bg-accented"
          role="progressbar"
          :aria-valuenow="percentValue"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${percentValue}%`"
        >
          <div class="h-full rounded-full bg-primary/55" :style="{ width: `${percentValue}%` }" />
        </div>
        <p class="flex gap-2 text-sm text-muted">
          <span class="w-10 shrink-0 tabular-nums">{{ percentValue }}%</span>
          <span v-if="remainingText" class="min-w-0 tabular-nums">{{ remainingText }}</span>
        </p>
      </div>
    </template>

    <template #footer="{ close: dismiss }">
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          v-if="progressError && progressSerialLog"
          color="neutral"
          variant="outline"
          label="Save serial log"
          icon="i-lucide-file-text"
          @click="saveProgressSerialLog"
        />
        <UButton
          v-if="showBackupWithoutSaving"
          color="warning"
          variant="outline"
          label="Write without backup"
          icon="i-lucide-triangle-alert"
          @click="continueWriteWithoutBackupFromDialog"
        />
        <UButton
          v-if="progressError"
          color="neutral"
          variant="outline"
          label="Close"
          @click="
            () => {
              closeProgress();
              dismiss();
            }
          "
        />
        <UButton v-else color="neutral" variant="outline" label="Cancel" @click="cancelTransfer" />
      </div>
    </template>
  </UModal>
</template>
