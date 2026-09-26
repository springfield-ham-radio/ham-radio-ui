<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';

const { draft, compiled, patch } = useDriverDraft();

const manufacturer = computed({
  get: () => draft.value.manufacturer,
  set: (value: string) => patch({ manufacturer: value }),
});
const model = computed({
  get: () => draft.value.model,
  set: (value: string) => patch({ model: value }),
});
const name = computed({
  get: () => draft.value.name,
  set: (value: string) => patch({ name: value }),
});
const version = computed({
  get: () => draft.value.version,
  set: (value: string) => patch({ version: value }),
});
const description = computed({
  get: () => draft.value.description,
  set: (value: string) => patch({ description: value }),
});
const settingsSchemaPath = computed({
  get: () => draft.value.settingsSchemaPath,
  set: (value: string) => patch({ settingsSchemaPath: value }),
});
const channelSchemaPath = computed({
  get: () => draft.value.channelSchemaPath,
  set: (value: string) => patch({ channelSchemaPath: value }),
});
const memoryMapPath = computed({
  get: () => draft.value.memoryMapPath,
  set: (value: string) => patch({ memoryMapPath: value }),
});

function errorAt(path: string): string | undefined {
  return driverFieldError(compiled.value.issues, path);
}

function setFlag(
  field: 'memoryRead' | 'memoryWrite' | 'channelProgramming' | 'settingsProgramming' | 'liveControl',
  value: boolean | 'indeterminate',
): void {
  if (value !== 'indeterminate') {
    patch({ [field]: value });
  }
}
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Manufacturer" required :error="errorAt('id.manufacturer')">
        <UInput v-model="manufacturer" class="w-full" placeholder="Example" />
      </UFormField>
      <UFormField label="Model id" required :error="errorAt('id.model')">
        <template #hint>
          <HelpTooltip text="Lowercase, used as the catalog key." />
        </template>
        <UInput v-model="model" class="w-full font-mono" placeholder="example-radio" />
      </UFormField>
      <UFormField label="Name" required :error="errorAt('id.name')">
        <template #hint>
          <HelpTooltip text="Shown in the radio list." />
        </template>
        <UInput v-model="name" class="w-full" placeholder="Example Radio" />
      </UFormField>
      <UFormField label="Version" required :error="errorAt('version')">
        <UInput v-model="version" class="w-full font-mono" placeholder="0.1.0" />
      </UFormField>
    </div>
    <UFormField label="Description">
      <UTextarea v-model="description" class="w-full" :rows="3" autoresize />
    </UFormField>
    <div class="grid gap-2 sm:grid-cols-2">
      <UCheckbox
        :model-value="draft.memoryRead"
        label="Memory read"
        @update:model-value="setFlag('memoryRead', $event)"
      />
      <UCheckbox
        :model-value="draft.memoryWrite"
        label="Memory write"
        @update:model-value="setFlag('memoryWrite', $event)"
      />
      <UCheckbox
        :model-value="draft.channelProgramming"
        label="Channel programming"
        @update:model-value="setFlag('channelProgramming', $event)"
      />
      <UCheckbox
        :model-value="draft.settingsProgramming"
        label="Settings programming"
        @update:model-value="setFlag('settingsProgramming', $event)"
      />
      <div class="flex items-center gap-1">
        <UCheckbox
          :model-value="draft.liveControl"
          label="Live control"
          @update:model-value="setFlag('liveControl', $event)"
        />
        <HelpTooltip text="Separate from CAT memory steps." />
      </div>
    </div>
    <div class="grid gap-3">
      <UFormField label="Settings schema path" :error="errorAt('schemas.settings')">
        <template #hint>
          <span class="inline-flex items-center gap-1.5">
            Optional
            <HelpTooltip text="Relative path inside the module, for example ../src/shared/schemas/settings-schema.json" />
          </span>
        </template>
        <UInput v-model="settingsSchemaPath" class="w-full font-mono" />
      </UFormField>
      <UFormField label="Channel schema path" :error="errorAt('schemas.channel')">
        <template #hint>
          <span class="inline-flex items-center gap-1.5">
            Optional
            <HelpTooltip text="Path to the file edited on the Channel tab, for example ../src/shared/schemas/channel-schema.json" />
          </span>
        </template>
        <UInput v-model="channelSchemaPath" class="w-full font-mono" />
      </UFormField>
      <UFormField label="Memory map path" :error="errorAt('schemas.memoryMap')">
        <template #hint>
          <span class="inline-flex items-center gap-1.5">
            Optional
            <HelpTooltip text="Path to the file edited on the Memory tab, for example ../src/shared/memory-maps/uv5r-settings.json" />
          </span>
        </template>
        <UInput v-model="memoryMapPath" class="w-full font-mono" />
      </UFormField>
    </div>
  </div>
</template>
