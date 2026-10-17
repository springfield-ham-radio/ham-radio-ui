<script setup lang="ts">
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import { radioDisplayName } from '~/utils/radio-module-listing';
import {
  fetchOfficialModuleCatalog,
  officialCatalogFailureFromCause,
  type OfficialModuleCatalogFailure,
  installOfficialModule,
  installPickedLocalModuleFile,
  pickLocalModuleFile,
  sha256HexForLocalFile,
} from '~/utils/radio-module-install';
import { isBetaZipFileName, versionFromZipName } from '~/utils/radio-module-semver';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const props = defineProps<{
  open: boolean;
  /** When true, dismiss requires at least one radio installed. */
  required?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  installed: [];
}>();

const toast = useToast();
const { refreshCatalogState, configurations } = useRadio();

const catalogEntries = ref<RadioModuleCatalogEntry[]>([]);
const selectedIds = ref<string[]>([]);
const catalogFailure = ref<OfficialModuleCatalogFailure | null>(null);
const catalogLoading = ref(false);
const installing = ref(false);
const localWarningOpen = ref(false);
const betaInstallOpen = ref(false);
const pendingLocalFile = ref<{ path: string; kind: 'zip' | 'json' } | undefined>();
const pendingBetaSha256 = ref<string | undefined>();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const canDismiss = computed(() => !props.required || configurations.value.length > 0);

const selectableItems = computed(() =>
  catalogEntries.value.map((entry) => ({
    id: entry.id,
    label: radioDisplayName(entry.manufacturer, entry.name),
    description: `v${entry.version} · ${entry.id}`,
    entry,
  })),
);

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true;
  catalogFailure.value = null;

  try {
    const catalog = await fetchOfficialModuleCatalog();
    catalogEntries.value = catalog.modules;
    selectedIds.value = catalog.modules.map((entry) => entry.id);
  } catch (cause) {
    catalogEntries.value = [];
    selectedIds.value = [];
    catalogFailure.value = officialCatalogFailureFromCause(cause);
  } finally {
    catalogLoading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadCatalog();
    }
  },
);

async function installSelected(): Promise<void> {
  if (!isTauriRuntime()) {
    toast.add({
      title: 'Desktop app required',
      description: 'Install radio modules from the Tauri desktop build.',
      color: 'warning',
      icon: 'i-lucide-monitor',
    });
    return;
  }

  const selected = catalogEntries.value.filter((entry) => selectedIds.value.includes(entry.id));

  if (selected.length === 0) {
    toast.add({
      title: 'Select at least one radio',
      color: 'warning',
      icon: 'i-lucide-circle-alert',
    });
    return;
  }

  installing.value = true;

  try {
    for (const entry of selected) {
      await installOfficialModule(entry);
    }

    await refreshCatalogState();
    emit('installed');
    toast.add({
      title: 'Radios installed',
      description: `Installed ${selected.length} module${selected.length === 1 ? '' : 's'}.`,
      color: 'success',
      icon: 'i-lucide-check',
    });

    if (canDismiss.value) {
      isOpen.value = false;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Install failed';
    toast.add({
      title: 'Could not install modules',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    installing.value = false;
  }
}

function localZipFileName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/');
  return segments[segments.length - 1] ?? path;
}

async function onInstallFromFile(): Promise<void> {
  if (!isTauriRuntime()) {
    toast.add({
      title: 'Desktop app required',
      description: 'Install radio modules from the Tauri desktop build.',
      color: 'warning',
      icon: 'i-lucide-monitor',
    });
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

async function confirmLocalInstall(): Promise<void> {
  const picked = pendingLocalFile.value;
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;

  if (!picked) {
    return;
  }

  installing.value = true;

  try {
    const result = await installPickedLocalModuleFile(picked);
    await refreshCatalogState();
    emit('installed');
    const isBeta = picked.kind === 'zip' && isBetaZipFileName(localZipFileName(picked.path));
    toast.add({
      title: isBeta ? 'Beta driver installed' : 'Unverified radio installed',
      description: `Added ${result.radios.map((radio) => radio.id.name).join(', ')}`,
      color: 'success',
      icon: 'i-lucide-check',
    });

    if (canDismiss.value) {
      isOpen.value = false;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Install failed';
    toast.add({
      title: 'Could not install local module',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    installing.value = false;
  }
}

function cancelLocalInstall(): void {
  localWarningOpen.value = false;
  pendingLocalFile.value = undefined;
}

async function confirmBetaInstall(): Promise<void> {
  betaInstallOpen.value = false;
  pendingBetaSha256.value = undefined;
  await confirmLocalInstall();
}

function cancelBetaInstall(): void {
  betaInstallOpen.value = false;
  pendingLocalFile.value = undefined;
  pendingBetaSha256.value = undefined;
}

const pendingBetaVersion = computed(() => {
  const picked = pendingLocalFile.value;

  if (!picked || picked.kind !== 'zip') {
    return undefined;
  }

  return versionFromZipName(localZipFileName(picked.path));
});

function toggleModule(id: string, checked: boolean): void {
  if (checked) {
    selectedIds.value = [...new Set([...selectedIds.value, id])];
    return;
  }

  selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id);
}

function onOpenChange(value: boolean): void {
  if (!value && !canDismiss.value) {
    return;
  }

  isOpen.value = value;
}
</script>

<template>
  <UModal
    :open="isOpen"
    :dismissible="canDismiss"
    :ui="{ content: 'sm:max-w-lg' }"
    @update:open="onOpenChange"
  >
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Install radios</h2>
          <p class="mt-1 text-sm text-muted">
            Choose official modules for the radios you own. The generic driver ships with the app; only radio
            configurations are downloaded.
          </p>
        </div>

        <div v-if="catalogLoading" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading official catalog…
        </div>

        <div v-else-if="catalogFailure" class="rounded-lg bg-muted px-3 py-3 text-sm">
          <p class="font-medium text-highlighted">{{ catalogFailure.title }}</p>
          <p class="mt-1 text-muted">{{ catalogFailure.detail }}</p>
          <p class="mt-2 text-muted">{{ catalogFailure.guidance }}</p>
          <UButton class="mt-3" size="sm" color="neutral" variant="outline" label="Retry" @click="loadCatalog" />
        </div>

        <div v-else class="flex flex-col gap-2">
          <label
            v-for="item in selectableItems"
            :key="item.id"
            class="flex cursor-pointer items-start gap-3 rounded-lg bg-muted px-3 py-3"
          >
            <UCheckbox
              :model-value="selectedIds.includes(item.id)"
              @update:model-value="(checked: boolean | 'indeterminate') => toggleModule(item.id, checked === true)"
            />
            <span class="min-w-0">
              <span class="block text-sm font-medium text-highlighted">{{ item.label }}</span>
              <span class="block text-xs text-muted">{{ item.description }}</span>
            </span>
          </label>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-4">
          <UButton
            label="Install from file…"
            color="neutral"
            variant="ghost"
            icon="i-lucide-folder-open"
            :disabled="installing"
            @click="onInstallFromFile"
          />
          <div class="flex gap-2">
            <UButton
              v-if="canDismiss"
              label="Close"
              color="neutral"
              variant="ghost"
              :disabled="installing"
              @click="isOpen = false"
            />
            <UButton
              label="Install"
              color="primary"
              :loading="installing"
              :disabled="installing || catalogLoading || selectedIds.length === 0"
              @click="installSelected"
            />
          </div>
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
