<script setup lang="ts">
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import { listRadioCatalogRecords } from '~/utils/radio-catalog-db';
import {
  fetchOfficialModuleCatalog,
  installOfficialModule,
  installPickedLocalModuleFile,
  isModuleInstallPath,
  pickLocalModuleFile,
} from '~/utils/radio-module-install';
import {
  buildAvailableManufacturerGroups,
  buildInstalledRadioListItems,
  groupInstalledRadiosByManufacturer,
  radioDisplayName,
  type AvailableManufacturerGroup,
  type AvailableRadioModelItem,
  type InstalledManufacturerGroup,
  type InstalledRadioListItem,
} from '~/utils/radio-module-listing';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const toast = useToast();
const { refreshCatalogState, uninstallRadio, configurations } = useRadio();

const catalogRecords = ref<RadioCatalogRecord[]>([]);
const catalogEntries = ref<RadioModuleCatalogEntry[]>([]);
const catalogError = ref<string | null>(null);
const catalogLoading = ref(false);
const busyKey = ref<string | undefined>();
const removeConfirmOpen = ref(false);
const pendingRemoveRecord = ref<RadioCatalogRecord | undefined>();
const localWarningOpen = ref(false);
const pendingLocalFile = ref<{ path: string; kind: 'zip' | 'json' } | undefined>();

const installedGroups = computed(() =>
  groupInstalledRadiosByManufacturer(buildInstalledRadioListItems(catalogRecords.value, catalogEntries.value)),
);
const availableGroups = computed(() =>
  buildAvailableManufacturerGroups(catalogRecords.value, catalogEntries.value),
);

const removeConfirmMessage = computed(() => {
  const record = pendingRemoveRecord.value;

  if (!record) {
    return '';
  }

  if (record.sourcePath && (record.source === 'installed' || isModuleInstallPath(record.sourcePath))) {
    const related = catalogRecords.value.filter((candidate) => candidate.sourcePath === record.sourcePath);
    const names = related.map((candidate) => `${candidate.manufacturer} ${candidate.name}`).join(', ');

    if (related.length > 1) {
      return `Remove the installed module and delete ${names} from your catalog? This also removes the module files from this computer.`;
    }

    return `Remove ${record.manufacturer} ${record.name} from your catalog? This also deletes the installed module files from this computer.`;
  }

  return `Remove ${record.manufacturer} ${record.name} from your catalog? The original file on disk is not deleted.`;
});

function sourceBadge(record: RadioCatalogRecord): { label: string; color: 'warning' | 'success' } {
  if (record.source === 'user') {
    return { label: 'Unverified', color: 'warning' };
  }

  if (record.source === 'installed') {
    return { label: 'Official', color: 'success' };
  }

  return { label: 'Bundled', color: 'success' };
}

function installedVersionLabel(item: InstalledRadioListItem): string {
  if (item.updateAvailable && item.catalogEntry) {
    return `v${item.record.version} → ${item.catalogEntry.version} · ${item.record.modelId}`;
  }

  return `v${item.record.version} · ${item.record.modelId}`;
}

const anyBusy = computed(() => busyKey.value !== undefined);

function isBusy(key: string): boolean {
  return busyKey.value === key;
}

async function refreshInstalledRadios(): Promise<void> {
  try {
    catalogRecords.value = await listRadioCatalogRecords();
  } catch {
    catalogRecords.value = [];
  }
}

async function loadOfficialCatalog(): Promise<void> {
  catalogLoading.value = true;
  catalogError.value = null;

  try {
    const catalog = await fetchOfficialModuleCatalog();
    catalogEntries.value = catalog.modules;
  } catch (cause) {
    catalogEntries.value = [];
    catalogError.value = cause instanceof Error ? cause.message : 'Failed to load official catalog';
  } finally {
    catalogLoading.value = false;
  }
}

async function reload(): Promise<void> {
  await Promise.all([refreshInstalledRadios(), loadOfficialCatalog()]);
}

function requireDesktopApp(): boolean {
  if (isTauriRuntime()) {
    return true;
  }

  toast.add({
    title: 'Desktop app required',
    description: 'Install radio modules from the Tauri desktop build.',
    color: 'warning',
    icon: 'i-lucide-monitor',
  });
  return false;
}

async function installRadio(group: AvailableManufacturerGroup, radio: AvailableRadioModelItem): Promise<void> {
  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = `${group.entry.id}:${radio.modelId}`;

  try {
    const result = await installOfficialModule(group.entry, {
      catalogModelId: radio.modelId,
      catalogConfig: radio.config,
    });
    await refreshCatalogState();
    await refreshInstalledRadios();
    const installedNames = result.radios
      .map((installed) => radioDisplayName(installed.id.manufacturer, installed.id.name))
      .join(', ');
    toast.add({
      title: 'Radio installed',
      description: installedNames || radio.name,
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Install failed';
    toast.add({
      title: 'Could not install radio',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

async function updateGroup(group: InstalledManufacturerGroup): Promise<void> {
  if (!group.catalogEntry) {
    return;
  }

  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = group.catalogEntry.id;

  try {
    await installOfficialModule(group.catalogEntry);
    await refreshCatalogState();
    await refreshInstalledRadios();
    toast.add({
      title: 'Radio updated',
      description: `${group.manufacturer} is now v${group.catalogEntry.version}.`,
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Update failed';
    toast.add({
      title: 'Could not update radio',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

function requestRemoveRadio(record: RadioCatalogRecord): void {
  pendingRemoveRecord.value = record;
  removeConfirmOpen.value = true;
}

function cancelRemoveRadio(): void {
  removeConfirmOpen.value = false;
  pendingRemoveRecord.value = undefined;
}

async function confirmRemoveRadio(): Promise<void> {
  const record = pendingRemoveRecord.value;

  if (!record) {
    return;
  }

  busyKey.value = record.modelId;
  removeConfirmOpen.value = false;

  try {
    await uninstallRadio(record);
    await refreshInstalledRadios();
  } finally {
    busyKey.value = undefined;
    pendingRemoveRecord.value = undefined;
  }
}

async function onInstallFromFile(): Promise<void> {
  if (!requireDesktopApp()) {
    return;
  }

  try {
    const picked = await pickLocalModuleFile();

    if (!picked) {
      return;
    }

    pendingLocalFile.value = picked;
    localWarningOpen.value = true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not open file';
    toast.add({
      title: 'Could not open file',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function confirmLocalInstall(): Promise<void> {
  const picked = pendingLocalFile.value;
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;

  if (!picked) {
    return;
  }

  busyKey.value = picked.path;

  try {
    const result = await installPickedLocalModuleFile(picked);
    await refreshCatalogState();
    await refreshInstalledRadios();
    toast.add({
      title: 'Unverified radio installed',
      description: `Added ${result.radios.map((radio) => radio.id.name).join(', ')}`,
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Install failed';
    toast.add({
      title: 'Could not install local module',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

function cancelLocalInstall(): void {
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;
}

watch(
  configurations,
  () => {
    void refreshInstalledRadios();
  },
  { deep: true },
);

onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">Installed drivers</p>
            <p class="text-xs text-muted">
              Drivers are the modules HamBench uses to talk to each model. Official modules show a marker when a newer
              catalog version is available. Local files are Unverified and are not updated from the catalog.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            size="xs"
            aria-label="Refresh radio catalog"
            :loading="catalogLoading"
            :disabled="anyBusy"
            @click="reload"
          />
        </div>

        <ul v-if="installedGroups.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li
            v-for="group in installedGroups"
            :key="group.manufacturer"
            class="px-3 py-2.5"
          >
            <div class="flex items-center gap-3">
              <div class="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
                <UIcon name="i-lucide-radio" class="size-4 text-highlighted" />
                <span
                  v-if="group.updateAvailable"
                  class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-info ring-2 ring-muted"
                  aria-label="Update available"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UTooltip
                  v-if="group.updateAvailable && !group.canUpdate"
                  :text="group.updateBlockedReason"
                >
                  <span class="inline-flex">
                    <UButton
                      label="Update"
                      color="primary"
                      variant="subtle"
                      size="xs"
                      icon="i-lucide-download"
                      disabled
                    />
                  </span>
                </UTooltip>
                <UButton
                  v-else-if="group.canUpdate && group.catalogEntry"
                  label="Update"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  icon="i-lucide-download"
                  :loading="isBusy(group.catalogEntry.id)"
                  :disabled="anyBusy"
                  @click="updateGroup(group)"
                />
              </div>
            </div>
            <ul class="mt-1">
              <li
                v-for="item in group.radios"
                :key="item.record.modelId"
                class="flex items-center gap-3 py-1.5 pl-12"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-highlighted">
                    {{ radioDisplayName(item.record.manufacturer, item.record.name) }}
                  </p>
                  <p class="truncate text-xs text-muted">{{ installedVersionLabel(item) }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <UBadge
                    :label="sourceBadge(item.record).label"
                    :color="sourceBadge(item.record).color"
                    variant="subtle"
                    size="sm"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="xs"
                    aria-label="Remove driver"
                    :disabled="anyBusy"
                    @click="requestRemoveRadio(item.record)"
                  />
                </div>
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">No drivers installed yet.</p>
      </div>
    </div>

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Available drivers</p>
          <p class="text-xs text-muted">
            Official modules grouped by manufacturer. Install only the models you own, then add each radio under
            Preferences → Radios.
          </p>
        </div>

        <div v-if="catalogLoading && catalogEntries.length === 0" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading official catalog…
        </div>

        <div v-else-if="catalogError" class="rounded-lg bg-muted px-3 py-3 text-sm">
          <p class="font-medium text-highlighted">Could not reach the official catalog</p>
          <p class="mt-1 text-muted">{{ catalogError }}</p>
          <p class="mt-2 text-muted">Connect to the internet and retry, or install a module from a local file.</p>
          <UButton class="mt-3" size="sm" color="neutral" variant="outline" label="Retry" @click="loadOfficialCatalog" />
        </div>

        <ul v-else-if="availableGroups.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li
            v-for="group in availableGroups"
            :key="group.entry.id"
            class="px-3 py-2.5"
          >
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
                <UIcon name="i-lucide-radio" class="size-4 text-highlighted" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
                <p class="truncate text-xs text-muted">v{{ group.entry.version }}</p>
              </div>
            </div>
            <ul class="mt-1">
              <li
                v-for="radio in group.radios"
                :key="radio.modelId"
                class="flex items-center gap-3 py-1.5 pl-12"
              >
                <p class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ radio.name }}</p>
                <UBadge
                  v-if="radio.installed"
                  label="Installed"
                  color="success"
                  variant="subtle"
                  size="sm"
                />
                <UTooltip v-else-if="!radio.canInstall" :text="radio.installBlockedReason">
                  <span class="inline-flex">
                    <UButton
                      label="Install"
                      color="primary"
                      size="xs"
                      icon="i-lucide-download"
                      disabled
                    />
                  </span>
                </UTooltip>
                <UButton
                  v-else
                  label="Install"
                  color="primary"
                  size="xs"
                  icon="i-lucide-download"
                  :loading="isBusy(`${group.entry.id}:${radio.modelId}`)"
                  :disabled="anyBusy"
                  @click="installRadio(group, radio)"
                />
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">All official drivers are installed.</p>

        <div>
          <UButton
            label="Install from file…"
            color="neutral"
            variant="ghost"
            icon="i-lucide-folder-open"
            :disabled="anyBusy"
            @click="onInstallFromFile"
          />
        </div>
      </div>
    </div>
  </div>

  <UModal v-model:open="removeConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Remove driver?</h2>
          <p class="mt-2 text-sm text-muted">
            {{ removeConfirmMessage }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelRemoveRadio" />
          <UButton
            label="Remove"
            color="error"
            :loading="pendingRemoveRecord !== undefined && anyBusy"
            @click="confirmRemoveRadio"
          />
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="localWarningOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Install unverified module?</h2>
          <p class="mt-2 text-sm text-muted">
            Springfield did not publish this file. Installing it is
            <span class="font-medium text-highlighted">at your own risk</span>. A bad module can fail to talk to
            the radio or write incorrect memory.
          </p>
          <p v-if="pendingLocalFile" class="mt-2 truncate text-xs text-muted">
            {{ pendingLocalFile.path }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelLocalInstall" />
          <UButton label="Install anyway" color="warning" @click="confirmLocalInstall" />
        </div>
      </div>
    </template>
  </UModal>
</template>
