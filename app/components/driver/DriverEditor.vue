<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { openDriverJsonFile, saveDriverJsonFile } from '~/utils/driver-file-io';
import { importDriverModule } from '~/utils/driver-import';
import { createDriverDraft, exampleDriverDraft, type DriverEditorSection } from '~/utils/driver-draft';

const { draft, compiled, section, replaceDraft } = useDriverDraft();
const { configurations } = useRadio();
const toast = useToast();

const sectionItems: TabsItem[] = [
  { label: 'Identity', value: 'identity', icon: 'i-lucide-tag' },
  { label: 'Serial', value: 'serial', icon: 'i-lucide-cable' },
  { label: 'Memory', value: 'memory', icon: 'i-lucide-database' },
  { label: 'Read', value: 'read', icon: 'i-lucide-download' },
  { label: 'Write', value: 'write', icon: 'i-lucide-upload' },
];

const activeSection = computed({
  get: () => section.value,
  set: (value: string | number) => {
    if (value === 'identity' || value === 'serial' || value === 'memory' || value === 'read' || value === 'write') {
      section.value = value satisfies DriverEditorSection;
    }
  },
});

const installedItems = computed(() => {
  return configurations.value.map((config) => ({
    label: `${config.id.manufacturer} ${config.id.name}`,
    value: String(config.id.model),
  }));
});

const copying = shallowRef(false);
const installedModel = shallowRef<string | undefined>();
const cautionDismissed = useState('driver-caution-dismissed', () => false);

function dismissCaution(): void {
  cautionDismissed.value = true;
}

function confirmReplace(): boolean {
  const dirty =
    draft.value.model.trim().length > 0 ||
    draft.value.readSteps.length > 0 ||
    draft.value.writeSteps.length > 0 ||
    draft.value.segments.length > 0;

  if (!dirty) {
    return true;
  }

  return window.confirm('Replace the current driver draft?');
}

function applyImport(value: unknown, title: string): void {
  const result = importDriverModule(value);

  if (result.error || !result.draft) {
    toast.add({
      title: 'Could not load driver',
      description: result.error ?? 'The file was not a driver.',
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
    return;
  }

  replaceDraft(result.draft);
  toast.add({
    title,
    description: result.warnings.length > 0 ? result.warnings.join(' ') : undefined,
    color: result.warnings.length > 0 ? 'warning' : 'success',
    icon: result.warnings.length > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-check',
  });
}

function startBlank(): void {
  if (!confirmReplace()) {
    return;
  }

  replaceDraft(createDriverDraft());
}

function startExample(): void {
  if (!confirmReplace()) {
    return;
  }

  replaceDraft(exampleDriverDraft());
  section.value = 'read';
}

function loadInstalled(modelId: unknown): void {
  installedModel.value = undefined;

  if (typeof modelId !== 'string' || !confirmReplace()) {
    return;
  }

  const config = configurations.value.find((item) => String(item.id.model) === modelId);

  if (!config) {
    return;
  }

  applyImport(config, `Loaded ${config.id.name}`);
}

async function importFile(): Promise<void> {
  if (!confirmReplace()) {
    return;
  }

  try {
    const text = await openDriverJsonFile();

    if (text === undefined) {
      return;
    }

    applyImport(JSON.parse(text) as unknown, 'Imported driver');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not read that file';
    toast.add({
      title: 'Import failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function exportFile(): Promise<void> {
  const model = draft.value.model.trim() || 'driver';

  try {
    const path = await saveDriverJsonFile(compiled.value.json, `${model}.json`);

    if (!path) {
      return;
    }

    toast.add({
      title: compiled.value.errorCount > 0 ? 'Saved with errors still to fix' : 'Saved driver',
      description: path,
      color: compiled.value.errorCount > 0 ? 'warning' : 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not save the driver';
    toast.add({
      title: 'Save failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  }
}

async function copyJson(): Promise<void> {
  copying.value = true;

  try {
    await navigator.clipboard.writeText(compiled.value.json);
    toast.add({
      title: compiled.value.errorCount > 0 ? 'Copied JSON that still has errors' : 'Copied driver JSON',
      color: compiled.value.errorCount > 0 ? 'warning' : 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not copy to the clipboard';
    toast.add({
      title: 'Copy failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 p-3">
    <UAlert
      v-if="!cautionDismissed"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This is an advanced tool"
      description="You are editing the protocol a radio uses to read and write memory. A wrong step can produce a module that will not program the radio. Proceed with caution."
      close
      :ui="{ root: 'items-center', icon: 'size-12' }"
      @update:open="dismissCaution"
    />
    <div class="flex flex-wrap items-center gap-2">
      <UTabs
        v-model="activeSection"
        :items="sectionItems"
        :content="false"
        color="neutral"
        variant="pill"
        size="sm"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
      <div class="ml-auto flex flex-wrap items-center gap-1.5">
        <UButton label="New" color="neutral" variant="ghost" size="xs" @click="startBlank" />
        <UButton label="Example" color="neutral" variant="ghost" size="xs" @click="startExample" />
        <USelectMenu
          v-model="installedModel"
          :items="installedItems"
          value-key="value"
          placeholder="Load installed"
          :disabled="installedItems.length === 0"
          class="w-44"
          @update:model-value="loadInstalled"
        />
        <UButton label="Import" color="neutral" variant="outline" size="xs" icon="i-lucide-folder-open" @click="importFile" />
        <UButton label="Export" color="neutral" variant="outline" size="xs" icon="i-lucide-save" @click="exportFile" />
        <UButton
          label="Copy JSON"
          color="neutral"
          variant="outline"
          size="xs"
          icon="i-lucide-copy"
          :loading="copying"
          @click="copyJson"
        />
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
      <div class="min-h-0 flex-1 overflow-auto">
        <DriverIdentityForm v-if="section === 'identity'" />
        <DriverSerialForm v-else-if="section === 'serial'" />
        <DriverMemoryForm v-else-if="section === 'memory'" />
        <DriverProtocolEditor v-else />
      </div>
      <DriverInspector />
    </div>
  </div>
</template>
