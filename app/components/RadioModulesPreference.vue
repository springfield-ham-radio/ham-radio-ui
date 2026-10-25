<script setup lang="ts">
import type { RadioCatalogRecord } from '~/utils/radio-catalog-db';
import {
  installOfficialModule,
  switchAllToVerifiedModules,
  switchToVerifiedModule,
  replaceWithOfficialModule,
  installPickedLocalModuleFile,
  updateInstalledModule,
  isModuleInstallPath,
  pickLocalModuleFile,
  sha256HexForLocalFile,
} from '~/utils/radio-module-install';
import {
  availableDriverGroupsForPicker,
  buildAvailableManufacturerGroups,
  groupInstalledRadiosByManufacturer,
  installedDriverVersionLabel,
  installedRadiosEligibleForVerifiedSwitch,
  radioDisplayName,
  type AvailableRadioModelItem,
  type InstalledRadioListItem,
} from '~/utils/radio-module-listing';
import { isBetaDriverRecord, isBetaZipFileName, versionFromZipName } from '~/utils/radio-module-semver';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const props = defineProps<{
  /** Catalog entry ids from the Radios step. Omit this on Preferences to keep the full list. */
  entryIds?: string[];
}>();

const toast = useToast();
const { refreshCatalogState, uninstallRadio } = useRadio();
const {
  catalogRecords,
  catalogEntries,
  catalogFailure,
  catalogLoading,
  installedListItems,
  refreshInstalledRadios,
  loadOfficialCatalog,
  reload,
} = useRadioModuleCatalog();
const busyKey = ref<string | undefined>();
const removeConfirmOpen = ref(false);
const pendingRemoveRecord = ref<RadioCatalogRecord | undefined>();
const localWarningOpen = ref(false);
const betaInstallOpen = ref(false);
const pendingLocalFile = ref<{ path: string; kind: 'zip' | 'json' } | undefined>();
const pendingBetaSha256 = ref<string | undefined>();
const replaceOfficialOpen = ref(false);
const pendingReplaceItem = ref<InstalledRadioListItem | undefined>();

const installedGroups = computed(() => groupInstalledRadiosByManufacturer(installedListItems.value));
const availableGroups = computed(() =>
  availableDriverGroupsForPicker(
    buildAvailableManufacturerGroups(catalogRecords.value, catalogEntries.value),
    props.entryIds,
  ),
);
const unmatchedEntryIds = computed(() => {
  if (!props.entryIds || catalogLoading.value || catalogFailure.value) {
    return [];
  }

  const known = new Set(catalogEntries.value.map((entry) => entry.id));
  return props.entryIds.filter((id) => !known.has(id));
});
const pickedDriversInstalled = computed(
  () =>
    props.entryIds !== undefined &&
    props.entryIds.length > 0 &&
    !catalogLoading.value &&
    !catalogFailure.value &&
    availableGroups.value.length === 0 &&
    unmatchedEntryIds.value.length === 0,
);
const switchToVerifiedTargets = computed(() => installedRadiosEligibleForVerifiedSwitch(installedListItems.value));

const removeConfirmMessage = computed(() => {
  const record = pendingRemoveRecord.value;

  if (!record) {
    return '';
  }

  if (record.sourcePath && (record.source === 'installed' || isModuleInstallPath(record.sourcePath))) {
    return `Remove ${record.manufacturer} ${record.name} from your catalog? This also deletes the installed module files from this computer.`;
  }

  return `Remove ${record.manufacturer} ${record.name} from your catalog? The original file on disk is not deleted.`;
});

function sourceBadge(record: RadioCatalogRecord): {
  label: string;
  color: 'warning' | 'success' | 'info';
} {
  if (isBetaDriverRecord(record)) {
    return { label: 'Beta', color: 'info' };
  }

  if (record.source === 'user') {
    return { label: 'Unverified', color: 'warning' };
  }

  if (record.source === 'installed') {
    return { label: 'Official', color: 'success' };
  }

  return { label: 'Bundled', color: 'success' };
}

const pendingBetaVersion = computed(() => {
  const picked = pendingLocalFile.value;

  if (!picked || picked.kind !== 'zip') {
    return undefined;
  }

  const segments = picked.path.replace(/\\/g, '/').split('/');
  const fileName = segments[segments.length - 1] ?? picked.path;
  return versionFromZipName(fileName);
});

const replaceOfficialMessage = computed(() => {
  const item = pendingReplaceItem.value;

  if (!item?.catalogEntry) {
    return '';
  }

  return `Replace beta v${item.record.version} with official v${item.catalogEntry.version}? The beta files on this computer will be removed.`;
});

const anyBusy = computed(() => busyKey.value !== undefined);

function isBusy(key: string): boolean {
  return busyKey.value === key;
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

async function installRadio(radio: AvailableRadioModelItem): Promise<void> {
  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = radio.entry.id;

  try {
    const result = await installOfficialModule(radio.entry);
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

async function switchCatalogEntryToVerified(entry: RadioModuleCatalogEntry): Promise<void> {
  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = `switch:${entry.id}`;

  try {
    await switchToVerifiedModule(entry);
    await refreshCatalogState();
    await refreshInstalledRadios();
    const record = catalogRecords.value.find((row) => row.modelId === entry.id);
    toast.add({
      title: 'Switched to verified driver',
      description: record
        ? radioDisplayName(record.manufacturer, record.name)
        : entry.name,
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Switch failed';
    toast.add({
      title: 'Could not switch to verified driver',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

async function switchRadioToVerified(item: InstalledRadioListItem): Promise<void> {
  if (!item.catalogEntry) {
    return;
  }

  await switchCatalogEntryToVerified(item.catalogEntry);
}

async function switchAllToVerified(): Promise<void> {
  if (!requireDesktopApp()) {
    return;
  }

  const targets = switchToVerifiedTargets.value;

  if (targets.length < 2) {
    return;
  }

  busyKey.value = 'switch-all';

  try {
    const entries = targets.flatMap((item) => (item.catalogEntry ? [item.catalogEntry] : []));
    const result = await switchAllToVerifiedModules(entries);
    await refreshCatalogState();
    await refreshInstalledRadios();

    if (result.failures.length === 0) {
      toast.add({
        title: 'Switched to verified drivers',
        description: `${result.switchedIds.length} radios now use the official catalog.`,
        color: 'success',
        icon: 'i-lucide-check',
      });
      return;
    }

    const failedNames = result.failures.map((failure) => failure.id).join(', ');
    const detail = result.failures[0]?.message ?? 'Switch failed';

    if (result.switchedIds.length === 0) {
      toast.add({
        title: 'Could not switch to verified drivers',
        description: detail,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
      return;
    }

    toast.add({
      title: 'Some drivers stayed on the local file',
      description: `Switched ${result.switchedIds.length}. ${failedNames} stayed unverified: ${detail}`,
      color: 'warning',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

async function updateRadio(item: InstalledRadioListItem): Promise<void> {
  if (!item.catalogEntry) {
    return;
  }

  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = item.catalogEntry.id;

  try {
    await updateInstalledModule(item.catalogEntry, item.record);

    await refreshCatalogState();
    await refreshInstalledRadios();
    toast.add({
      title: 'Radio updated',
      description: radioDisplayName(item.record.manufacturer, item.record.name),
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

function localZipFileName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] ?? path;
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
    pendingBetaSha256.value = undefined;

    if (picked.kind === 'zip' && isBetaZipFileName(localZipFileName(picked.path))) {
      try {
        pendingBetaSha256.value = await sha256HexForLocalFile(picked.path);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not hash file';
        toast.add({
          title: 'Could not read beta zip',
          description: message,
          color: 'error',
          icon: 'i-lucide-circle-alert',
        });
        pendingLocalFile.value = undefined;
        return;
      }

      betaInstallOpen.value = true;
      return;
    }

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

async function runLocalInstall(picked: { path: string; kind: 'zip' | 'json' }): Promise<void> {
  busyKey.value = picked.path;

  try {
    const result = await installPickedLocalModuleFile(picked);
    await refreshCatalogState();
    await refreshInstalledRadios();
    const isBeta =
      picked.kind === 'zip' && isBetaZipFileName(localZipFileName(picked.path));
    toast.add({
      title: isBeta ? 'Beta driver installed' : 'Unverified radio installed',
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

async function confirmLocalInstall(): Promise<void> {
  const picked = pendingLocalFile.value;
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;

  if (!picked) {
    return;
  }

  await runLocalInstall(picked);
}

async function confirmBetaInstall(): Promise<void> {
  const picked = pendingLocalFile.value;
  betaInstallOpen.value = false;
  pendingLocalFile.value = undefined;
  pendingBetaSha256.value = undefined;

  if (!picked) {
    return;
  }

  await runLocalInstall(picked);
}

function cancelLocalInstall(): void {
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;
}

function cancelBetaInstall(): void {
  betaInstallOpen.value = false;
  pendingLocalFile.value = undefined;
  pendingBetaSha256.value = undefined;
}

function requestReplaceWithOfficial(item: InstalledRadioListItem): void {
  pendingReplaceItem.value = item;
  replaceOfficialOpen.value = true;
}

function cancelReplaceWithOfficial(): void {
  replaceOfficialOpen.value = false;
  pendingReplaceItem.value = undefined;
}

async function confirmReplaceWithOfficial(): Promise<void> {
  const item = pendingReplaceItem.value;
  replaceOfficialOpen.value = false;
  pendingReplaceItem.value = undefined;

  if (!item?.catalogEntry) {
    return;
  }

  if (!requireDesktopApp()) {
    return;
  }

  busyKey.value = `replace:${item.catalogEntry.id}`;

  try {
    await replaceWithOfficialModule(item.catalogEntry);
    await refreshCatalogState();
    await refreshInstalledRadios();
    toast.add({
      title: 'Replaced with official driver',
      description: radioDisplayName(item.record.manufacturer, item.record.name),
      color: 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Replace failed';
    toast.add({
      title: 'Could not replace with official driver',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    busyKey.value = undefined;
  }
}

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
              catalog version is available. Beta and other local zips follow semver rules against the catalog.
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UButton
              v-if="switchToVerifiedTargets.length >= 2"
              label="Switch all to verified"
              color="primary"
              variant="outline"
              size="xs"
              icon="i-lucide-shield-check"
              :loading="busyKey === 'switch-all'"
              :disabled="anyBusy"
              @click="switchAllToVerified"
            />
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
                  v-if="group.radios.some((radio) => radio.updateAvailable)"
                  class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-info ring-2 ring-muted"
                  aria-label="Update available"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
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
                  <p class="truncate text-xs text-muted">{{ installedDriverVersionLabel(item.record) }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <UTooltip
                    v-if="item.updateAvailable && !item.canUpdate"
                    :text="item.updateBlockedReason"
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
                    v-else-if="item.canUpdate && item.catalogEntry"
                    label="Update"
                    color="primary"
                    variant="subtle"
                    size="xs"
                    icon="i-lucide-download"
                    :loading="isBusy(item.catalogEntry.id)"
                    :disabled="anyBusy"
                    @click="updateRadio(item)"
                  />
                  <UButton
                    v-if="item.canSwitchToVerified && item.catalogEntry"
                    label="Switch to verified"
                    color="primary"
                    variant="subtle"
                    size="xs"
                    icon="i-lucide-shield-check"
                    :loading="isBusy(`switch:${item.catalogEntry.id}`)"
                    :disabled="anyBusy"
                    @click="switchRadioToVerified(item)"
                  />
                  <UButton
                    v-if="item.canReplaceWithOfficial && item.catalogEntry"
                    :label="`Replace with official v${item.catalogEntry.version}`"
                    color="primary"
                    variant="subtle"
                    size="xs"
                    icon="i-lucide-shield-check"
                    :loading="isBusy(`replace:${item.catalogEntry.id}`)"
                    :disabled="anyBusy"
                    @click="requestReplaceWithOfficial(item)"
                  />
                  <UTooltip
                    v-else-if="item.record.source === 'user' && !isBetaDriverRecord(item.record) && item.catalogEntry && !item.canSwitchToVerified"
                    :text="item.switchBlockedReason"
                  >
                    <span class="inline-flex">
                      <UButton
                        label="Switch to verified"
                        color="primary"
                        variant="subtle"
                        size="xs"
                        icon="i-lucide-shield-check"
                        disabled
                      />
                    </span>
                  </UTooltip>
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

    <p v-if="pickedDriversInstalled" class="text-sm text-muted">All drivers for your radios are installed.</p>
    <div v-else class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Available drivers</p>
          <p v-if="entryIds" class="text-xs text-muted">
            Drivers for the radios you picked. Install uses the same catalog as Preferences. Install from file still
            works for a module that is not in this list.
          </p>
          <p v-else class="text-xs text-muted">
            Official modules grouped by manufacturer. Install only the models you own, then add each radio under
            Preferences → Radios.
          </p>
        </div>

        <div v-if="catalogLoading && catalogEntries.length === 0" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading official catalog…
        </div>

        <div v-else-if="catalogFailure" class="rounded-lg bg-muted px-3 py-3 text-sm">
          <p class="font-medium text-highlighted">{{ catalogFailure.title }}</p>
          <p class="mt-1 text-muted">{{ catalogFailure.detail }}</p>
          <p class="mt-2 text-muted">{{ catalogFailure.guidance }}</p>
          <UButton class="mt-3" size="sm" color="neutral" variant="outline" label="Retry" @click="loadOfficialCatalog" />
        </div>

        <ul v-else-if="availableGroups.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li
            v-for="group in availableGroups"
            :key="group.manufacturer"
            class="px-3 py-2.5"
          >
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
                <UIcon name="i-lucide-radio" class="size-4 text-highlighted" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
              </div>
            </div>
            <ul class="mt-1">
              <li
                v-for="radio in group.radios"
                :key="radio.modelId"
                class="flex items-center gap-3 py-1.5 pl-12"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-highlighted">{{ radio.name }}</p>
                  <p class="truncate text-xs text-muted">v{{ radio.entry.version }}</p>
                </div>
                <UBadge
                  v-if="radio.installedOfficially"
                  label="Installed"
                  color="success"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-else-if="radio.installedBeta"
                  label="Beta installed"
                  color="info"
                  variant="subtle"
                  size="sm"
                />
                <div
                  v-else-if="radio.installedUnverified && radio.canSwitchToVerified"
                  class="flex items-center gap-2"
                >
                  <UBadge
                    label="Local file installed"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  />
                  <UButton
                    label="Switch to verified"
                    color="primary"
                    size="xs"
                    icon="i-lucide-shield-check"
                    :loading="isBusy(`switch:${radio.entry.id}`)"
                    :disabled="anyBusy"
                    @click="switchCatalogEntryToVerified(radio.entry)"
                  />
                </div>
                <UBadge
                  v-else-if="radio.installedUnverified"
                  label="Local file installed"
                  color="warning"
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
                  :loading="isBusy(radio.entry.id)"
                  :disabled="anyBusy"
                  @click="installRadio(radio)"
                />
              </li>
            </ul>
          </li>
        </ul>
        <p v-else-if="unmatchedEntryIds.length > 0" class="text-sm text-muted">
          {{ unmatchedEntryIds.join(', ') }}
          {{ unmatchedEntryIds.length === 1 ? 'is' : 'are' }} not in the official catalog. Install from a file, or go back and pick another radio.
        </p>
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

  <UModal v-model:open="betaInstallOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Install beta driver?</h2>
          <p class="mt-2 text-sm text-muted">
            Compare the SHA-256 below with the value from the author before installing. Beta drivers are not published
            on the official catalog.
          </p>
          <p v-if="pendingLocalFile" class="mt-2 truncate text-xs text-muted">
            {{ pendingLocalFile.path }}
          </p>
          <p v-if="pendingBetaVersion" class="mt-2 text-sm text-highlighted">
            Version {{ pendingBetaVersion }}
          </p>
          <p v-if="pendingBetaSha256" class="mt-2 break-all font-mono text-xs text-muted">
            sha256:{{ pendingBetaSha256 }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelBetaInstall" />
          <UButton label="Install beta" color="primary" @click="confirmBetaInstall" />
        </div>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="replaceOfficialOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Replace with official driver?</h2>
          <p class="mt-2 text-sm text-muted">
            {{ replaceOfficialMessage }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelReplaceWithOfficial" />
          <UButton label="Replace" color="primary" @click="confirmReplaceWithOfficial" />
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
