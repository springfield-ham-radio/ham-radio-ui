<script setup lang="ts">
import {
  backupKindLabel,
  defaultRadioImageBackupSettings,
  formatBackupTimestampLabel,
  parseBackupFileName,
  parseRadioImageBackupSettings,
  readRadioImageBackupSettings,
  serializeRadioImageBackupSettings,
  sortBackupsNewestFirst,
  writeRadioImageBackupSettings,
  type RadioImageBackupListing,
  type RadioImageBackupSettings,
} from '~/utils/radio-image-backup';
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { useImportExportRunner } from '~/importExport/runner';
import { listRadioImageBackups, showRadioImageBackups } from '~/utils/radio-image-backup-io';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const router = useRouter();
const toast = useToast();
const { entry, run } = useImportExportRunner();
const restoreRadioImage = entry(IMPORT_EXPORT_IDS.restoreRadioImage);

const desktop = isTauriRuntime();
const settings = ref<RadioImageBackupSettings>(readRadioImageBackupSettings());
const backups = ref<RadioImageBackupListing[]>([]);
const listError = ref('');
const loading = ref(false);
const restoring = ref<string>();
const openingFolder = ref(false);

const rows = computed(() =>
  sortBackupsNewestFirst(backups.value).map((backup) => {
    const parsed = parseBackupFileName(backup.fileName);

    return {
      fileName: backup.fileName,
      title: parsed ? `${parsed.manufacturer} ${parsed.model}` : backup.fileName,
      detail: parsed
        ? `${formatBackupTimestampLabel(parsed.timestamp)} · ${backupKindLabel(parsed.kind)}`
        : 'Radio image backup',
    };
  }),
);

function persist(next: RadioImageBackupSettings): void {
  const stored = parseRadioImageBackupSettings(serializeRadioImageBackupSettings(next));
  settings.value = stored;
  writeRadioImageBackupSettings(stored);
}

function setEnabled(enabled: boolean): void {
  persist({ ...settings.value, enabled });
}

function setMaxAgeDays(value: string | number | undefined): void {
  persist({ ...settings.value, maxAgeDays: retentionInput(value, settings.value.maxAgeDays) });
}

function setMaxCount(value: string | number | undefined): void {
  persist({ ...settings.value, maxCount: retentionInput(value, settings.value.maxCount) });
}

function retentionInput(value: string | number | undefined, current: number): number {
  if (value === '' || value === undefined) {
    return current;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return current;
  }

  return Math.trunc(parsed);
}

async function refreshBackups(): Promise<void> {
  if (!desktop) {
    backups.value = [];
    return;
  }

  loading.value = true;
  listError.value = '';

  try {
    backups.value = await listRadioImageBackups();
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : 'Could not list radio image backups';
    backups.value = [];
  } finally {
    loading.value = false;
  }
}

async function openFolder(): Promise<void> {
  openingFolder.value = true;

  try {
    await showRadioImageBackups();
  } catch (cause) {
    toast.add({
      title: 'Could not open backups',
      description: cause instanceof Error ? cause.message : 'Failed to open the backup folder',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    openingFolder.value = false;
  }
}

async function restore(fileName: string): Promise<void> {
  restoring.value = fileName;

  try {
    const restored = await run(restoreRadioImage.id, { file: { name: fileName } });

    if ((restored.count ?? 0) > 0) {
      await router.push('/');
    }
  } finally {
    restoring.value = undefined;
  }
}

onMounted(() => {
  void refreshBackups();
});

const defaults = defaultRadioImageBackupSettings();
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Automatically back up radio images</p>
          <p class="text-xs text-muted">
            Save a timestamped copy after every successful read, and of the image already on the radio before every write.
          </p>
        </div>
        <USwitch
          :model-value="settings.enabled"
          aria-label="Automatically back up radio images"
          @update:model-value="setEnabled"
        />
      </div>
    </div>

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Retention</p>
          <p class="text-xs text-muted">
            Old backups are removed after the next read or write. Use 0 for no limit. Defaults are
            {{ defaults.maxAgeDays }} days and {{ defaults.maxCount }} files.
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Keep for days" description="Delete backups older than this.">
            <UInput
              :model-value="String(settings.maxAgeDays)"
              type="number"
              min="0"
              :disabled="!settings.enabled"
              @update:model-value="setMaxAgeDays"
            />
          </UFormField>
          <UFormField label="Maximum files" description="Keep at most this many backups.">
            <UInput
              :model-value="String(settings.maxCount)"
              type="number"
              min="0"
              :disabled="!settings.enabled"
              @update:model-value="setMaxCount"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-3 px-4 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">Saved backups</p>
            <p class="text-xs text-muted">
              Restore loads an image into the open radio. Write it to the radio to put that image back.
              File → Show Backups opens this folder.
            </p>
          </div>
          <UButton
            label="Show folder"
            color="neutral"
            variant="outline"
            icon="i-lucide-folder-open"
            :loading="openingFolder"
            :disabled="!desktop"
            @click="openFolder"
          />
        </div>

        <p v-if="!desktop" class="text-sm text-muted">
          Backup files are stored in the HamBench desktop app. The switch above still applies the next time you use it.
        </p>
        <p v-else-if="listError" class="text-sm text-error">{{ listError }}</p>
        <p v-else-if="loading" class="text-sm text-muted">Loading backups…</p>
        <p v-else-if="rows.length === 0" class="text-sm text-muted">
          No backups yet. With automatic backups on, one is saved after each read and before each write.
        </p>
        <ul v-else class="flex flex-col divide-y divide-default">
          <li v-for="row in rows" :key="row.fileName" class="flex items-center justify-between gap-3 py-2">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">{{ row.title }}</p>
              <p class="truncate text-xs text-muted">{{ row.detail }}</p>
            </div>
            <UButton
              :label="restoreRadioImage.label"
              color="neutral"
              variant="outline"
              size="sm"
              :icon="restoreRadioImage.icon"
              :loading="restoring === row.fileName"
              :disabled="restoring !== undefined"
              @click="restore(row.fileName)"
            />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
