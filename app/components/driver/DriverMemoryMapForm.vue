<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { driverFieldError } from '~/utils/driver-compile';
import { createMemoryGroup, createMemoryStruct, type DriverMemoryMapDraft } from '~/utils/driver-draft';

const { draft, memoryMap, patch } = useDriverDraft();

function errorAt(path: string): string | undefined {
  return driverFieldError(memoryMap.value.issues, path);
}

function patchMap(partial: Partial<DriverMemoryMapDraft>): void {
  const current = draft.value.memoryMap;

  if (Object.entries(partial).every(([key, value]) => current[key as keyof DriverMemoryMapDraft] === value)) {
    return;
  }

  patch({ memoryMap: { ...current, ...partial } });
}

const version = computed({
  get: () => draft.value.memoryMap.version,
  set: (value: string) => patchMap({ version: value }),
});
const description = computed({
  get: () => draft.value.memoryMap.description,
  set: (value: string) => patchMap({ description: value }),
});
const records = computed({
  get: () => draft.value.memoryMap.records,
  set: (value: string) => patchMap({ records: value }),
});
const names = computed({
  get: () => draft.value.memoryMap.names,
  set: (value: string) => patchMap({ names: value }),
});
const nameField = computed({
  get: () => draft.value.memoryMap.nameField,
  set: (value: string) => patchMap({ nameField: value }),
});
const receiveFrequency = computed({
  get: () => draft.value.memoryMap.receiveFrequency,
  set: (value: string) => patchMap({ receiveFrequency: value }),
});
const transmitFrequency = computed({
  get: () => draft.value.memoryMap.transmitFrequency,
  set: (value: string) => patchMap({ transmitFrequency: value }),
});
const receiveTone = computed({
  get: () => draft.value.memoryMap.receiveTone,
  set: (value: string) => patchMap({ receiveTone: value }),
});
const transmitTone = computed({
  get: () => draft.value.memoryMap.transmitTone,
  set: (value: string) => patchMap({ transmitTone: value }),
});
const extras = computed({
  get: () => draft.value.memoryMap.extras,
  set: (value: string) => patchMap({ extras: value }),
});

function addStruct(): void {
  patchMap({ structs: [...draft.value.memoryMap.structs, createMemoryStruct()] });
}

function addGroup(): void {
  const group = createMemoryGroup();
  patchMap({ groups: [...draft.value.memoryMap.groups, group] });
  openGroupId.value = group.id;
}

const groupItems = computed<TabsItem[]>(() => {
  return draft.value.memoryMap.groups.map((group) => ({
    label: group.label.trim() || group.groupId.trim() || 'Group',
    value: group.id,
    icon: group.icon.trim() || undefined,
  }));
});

const openGroupId = shallowRef(draft.value.memoryMap.groups[0]?.id);

watch(
  () => draft.value.memoryMap.groups.map((group) => group.id).join('\0'),
  () => {
    const ids = draft.value.memoryMap.groups.map((group) => group.id);

    if (!ids.includes(openGroupId.value ?? '')) {
      openGroupId.value = ids[0];
    }
  },
);
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <DriverFormSection title="Map" help="This file places channel fields and radio-wide settings into the image.">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Version">
          <UInput v-model="version" class="w-full font-mono" />
        </UFormField>
        <UFormField label="Description">
          <UInput v-model="description" class="w-full" />
        </UFormField>
      </div>
    </DriverFormSection>

    <DriverFormSection
      title="Channel bindings"
      help="Names the struct and the fields that become the channel name, frequencies, and tones."
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Records struct" required :error="errorAt('memory.records')">
          <template #hint>
            <HelpTooltip text="Struct id of the channel records." />
          </template>
          <UInput v-model="records" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Names struct" :error="errorAt('memory.names')">
          <template #hint>
            <span class="inline-flex items-center gap-1.5">
              Optional
              <HelpTooltip text="A separate struct for channel names. Leave blank when the name is on the record." />
            </span>
          </template>
          <UInput v-model="names" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Name field" :error="errorAt('memory.nameField')">
          <UInput v-model="nameField" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Receive frequency" required :error="errorAt('memory.receiveFrequency')">
          <UInput v-model="receiveFrequency" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Transmit frequency" required :error="errorAt('memory.transmitFrequency')">
          <UInput v-model="transmitFrequency" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Receive tone" required :error="errorAt('memory.receiveTone')">
          <UInput v-model="receiveTone" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Transmit tone" required :error="errorAt('memory.transmitTone')">
          <UInput v-model="transmitTone" class="w-full font-mono" spellcheck="false" />
        </UFormField>
        <UFormField label="Extras struct" :error="errorAt('memory.extras')">
          <template #hint>
            <span class="inline-flex items-center gap-1.5">
              Optional
              <HelpTooltip text="A parallel struct merged into each channel, such as lockout flags." />
            </span>
          </template>
          <UInput v-model="extras" class="w-full font-mono" spellcheck="false" />
        </UFormField>
      </div>
    </DriverFormSection>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <p class="text-sm font-medium text-highlighted">Settings groups</p>
        <HelpTooltip text="Each tab is one entry in the Settings list. The selected tab edits that group's fields." />
      </div>
      <UButton label="Add group" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addGroup" />
    </div>
    <UTabs
      v-if="groupItems.length > 0"
      v-model="openGroupId"
      :items="groupItems"
      :content="false"
      color="primary"
      variant="link"
      size="sm"
      class="w-full min-w-0"
      :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
    />
    <DriverMemoryGroupForm v-if="openGroupId" :group-id="openGroupId" />

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <p class="text-sm font-medium text-highlighted">Structs</p>
        <HelpTooltip text="Each struct starts at a radio address. The channel records and the name table are usually two structs." />
      </div>
      <UButton label="Add struct" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addStruct" />
    </div>
    <p v-if="errorAt('memory.structs')" class="text-sm text-error">{{ errorAt('memory.structs') }}</p>
    <DriverMemoryStructForm v-for="struct in draft.memoryMap.structs" :key="struct.id" :struct-id="struct.id" />
  </div>
</template>
