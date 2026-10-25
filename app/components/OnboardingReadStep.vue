<script setup lang="ts">
import { listRadioImageBackups } from '~/utils/radio-image-backup-io';
import { readRadioImageBackupSettings } from '~/utils/radio-image-backup';
import { onboardingReadIsDone } from '~/utils/onboarding';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const props = defineProps<{
  models: Array<{ manufacturer: string; model: string; name: string; id: string; serialPort: string; hasConfig: boolean }>;
}>();

const emit = defineEmits<{
  status: [status: { hasBackup: boolean; readableId?: string; backupsEnabled: boolean; desktop: boolean }];
}>();

const fileNames = ref<string[]>([]);
const desktop = isTauriRuntime();
const { progressOpen } = useRadio();

const backupsEnabled = computed(() => readRadioImageBackupSettings().enabled);
const missingDriver = computed(() => props.models.find((model) => !model.hasConfig));
const readable = computed(() => props.models.find((model) => model.hasConfig && model.serialPort.trim().length > 0));
const hasBackup = computed(() =>
  onboardingReadIsDone({
    fileNames: fileNames.value,
    models: props.models.map((model) => ({ manufacturer: model.manufacturer, model: model.model })),
  }),
);

function publish(): void {
  emit('status', {
    hasBackup: hasBackup.value,
    readableId: readable.value?.id,
    backupsEnabled: backupsEnabled.value,
    desktop,
  });
}

async function refresh(): Promise<void> {
  if (!desktop) {
    fileNames.value = [];
    publish();
    return;
  }

  try {
    const listed = await listRadioImageBackups();
    fileNames.value = listed.map((entry) => entry.fileName);
  } catch {
    fileNames.value = [];
  }

  publish();
}

watch([hasBackup, readable, backupsEnabled], publish);
watch(progressOpen, (open) => {
  if (!open) {
    void refresh();
  }
});

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
      <p class="text-sm font-medium text-highlighted">First read</p>
      <p class="mt-1 text-xs text-muted">
        Continue reads the radio and saves a backup before anything is edited. A read that only fills the editor does
        not finish this step. If a backup is already saved, Continue moves on.
      </p>
    </div>

    <UAlert
      v-if="!desktop"
      color="warning"
      variant="subtle"
      icon="i-lucide-monitor"
      title="Desktop app required"
      description="Reading a radio and saving a backup need the HamBench desktop app. You can skip this step."
    />
    <UAlert
      v-else-if="!backupsEnabled && !hasBackup"
      color="warning"
      variant="subtle"
      icon="i-lucide-archive"
      title="Backups are off"
      description="Turn backups on under Preferences → Backups before this step can be finished. Skip stays available."
    />
    <UAlert
      v-else-if="!readable && !hasBackup"
      color="warning"
      variant="subtle"
      icon="i-lucide-radio"
      title="No radio is ready to read"
      :description="missingDriver ? `Install the ${missingDriver.name} driver under Preferences → Drivers.` : 'Choose a programming port first. You can skip this step.'"
    />
    <UAlert
      v-else-if="hasBackup"
      color="success"
      variant="subtle"
      icon="i-lucide-archive"
      title="A backup is already saved"
      description="Continue moves on. The backup was made before edits."
    />
    <p v-else-if="readable" class="text-sm text-muted">
      Continue reads {{ readable.name }} on {{ readable.serialPort }}. Progress, cancel, and errors stay in the read dialog.
    </p>
  </div>
</template>
