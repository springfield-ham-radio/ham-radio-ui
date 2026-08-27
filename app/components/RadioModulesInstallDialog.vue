<script setup lang="ts">
import type { RadioModuleCatalogEntry } from '@springfield/ham-radio-registry';
import {
  fetchOfficialModuleCatalog,
  installOfficialModule,
  installPickedLocalModuleFile,
  pickLocalModuleFile,
} from '~/utils/radio-module-install';
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
const catalogError = ref<string | null>(null);
const catalogLoading = ref(false);
const installing = ref(false);
const localWarningOpen = ref(false);
const pendingLocalFile = ref<{ path: string; kind: 'zip' | 'json' } | undefined>();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const canDismiss = computed(() => !props.required || configurations.value.length > 0);

const selectableItems = computed(() =>
  catalogEntries.value.map((entry) => ({
    id: entry.id,
    label: `${entry.manufacturer} — ${entry.description || entry.package}`,
    description: `v${entry.version} · ${entry.supportedRadios.join(', ')}`,
    entry,
  })),
);

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true;
  catalogError.value = null;

  try {
    const catalog = await fetchOfficialModuleCatalog();
    catalogEntries.value = catalog.modules;
    selectedIds.value = catalog.modules.map((entry) => entry.id);
  } catch (cause) {
    catalogEntries.value = [];
    selectedIds.value = [];
    catalogError.value = cause instanceof Error ? cause.message : 'Failed to load official catalog';
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

async function onInstallFromFile(): Promise<void> {
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

  installing.value = true;

  try {
    const result = await installPickedLocalModuleFile(picked);
    await refreshCatalogState();
    emit('installed');
    toast.add({
      title: 'Unverified radio installed',
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

        <div v-else-if="catalogError" class="rounded-lg bg-muted px-3 py-3 text-sm">
          <p class="font-medium text-highlighted">Could not reach the official catalog</p>
          <p class="mt-1 text-muted">{{ catalogError }}</p>
          <p class="mt-2 text-muted">
            Connect to the internet and retry, or install a module from a local file.
          </p>
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
