<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import {
  createMemoryField,
  createMemoryStruct,
  createMemorySubgroup,
  memoryFieldInSettingsGroup,
  type DriverMemoryFieldDraft,
  type DriverMemoryGroupDraft,
  type DriverMemorySubgroupDraft,
} from '~/utils/driver-draft';

const props = defineProps<{
  groupId: string;
}>();

const { draft, memoryMap, patch } = useDriverDraft();

const group = computed(() => draft.value.memoryMap.groups.find((item) => item.id === props.groupId));

interface PlacedSetting {
  structId: string;
  structName: string;
  field: DriverMemoryFieldDraft;
}

const placed = computed((): PlacedSetting[] => {
  const groupId = group.value?.groupId.trim() ?? '';

  if (!groupId) {
    return [];
  }

  const groups = new Set([groupId]);
  const rows: PlacedSetting[] = [];

  for (const struct of draft.value.memoryMap.structs) {
    for (const field of struct.fields) {
      if (memoryFieldInSettingsGroup(field, groups)) {
        rows.push({
          structId: struct.id,
          structName: struct.structId.trim() || 'Struct',
          field,
        });
      }
    }
  }

  return rows;
});

const sectionBuckets = computed(() => {
  const known = new Set((group.value?.subgroups ?? []).map((section) => section.subgroupId.trim()).filter((id) => id.length > 0));

  return {
    top: placed.value.filter((row) => !known.has(row.field.uiSubgroup.trim())),
    sections: (group.value?.subgroups ?? []).map((section) => ({
      id: section.id,
      label: section.label.trim() || section.subgroupId.trim() || 'Section',
      subgroupId: section.subgroupId.trim(),
      fields: placed.value.filter((row) => section.subgroupId.trim().length > 0 && row.field.uiSubgroup.trim() === section.subgroupId.trim()),
    })),
  };
});

function errorAt(suffix: string): string | undefined {
  return driverFieldError(memoryMap.value.issues, `memory.groups.${props.groupId}.${suffix}`);
}

function patchGroup(partial: Partial<DriverMemoryGroupDraft>): void {
  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      groups: draft.value.memoryMap.groups.map((item) => (item.id === props.groupId ? { ...item, ...partial } : item)),
    },
  });
}

function patchSubgroup(id: string, partial: Partial<DriverMemorySubgroupDraft>): void {
  if (!group.value) {
    return;
  }

  patchGroup({
    subgroups: group.value.subgroups.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  });
}

function addSubgroup(): void {
  if (!group.value) {
    return;
  }

  patchGroup({ subgroups: [...group.value.subgroups, createMemorySubgroup()] });
}

function removeSubgroup(id: string): void {
  if (!group.value) {
    return;
  }

  patchGroup({ subgroups: group.value.subgroups.filter((item) => item.id !== id) });
}

function removeGroup(): void {
  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      groups: draft.value.memoryMap.groups.filter((item) => item.id !== props.groupId),
    },
  });
}

function addSetting(subgroupId: string): void {
  const groupId = group.value?.groupId.trim() ?? '';
  const field = createMemoryField({
    showUi: true,
    uiGroup: groupId,
    uiSubgroup: subgroupId,
    uiWidget: 'integer',
  });
  const structs = draft.value.memoryMap.structs;
  const target = structs.find((item) => item.structId.trim() === 'settings') ?? structs[structs.length - 1];

  if (!target) {
    patch({
      memoryMap: {
        ...draft.value.memoryMap,
        structs: [createMemoryStruct({ structId: 'settings', seek: '0x0000', fields: [field] })],
      },
    });
    return;
  }

  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      structs: structs.map((item) => (item.id === target.id ? { ...item, fields: [...item.fields, field] } : item)),
    },
  });
}
</script>

<template>
  <DriverFormSection
    v-if="group"
    :title="group.label.trim() || group.groupId.trim() || 'Settings group'"
    help="A group is one entry in the Settings list. Sections are the headings inside that panel."
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-muted">
        {{ placed.length }} {{ placed.length === 1 ? 'field' : 'fields' }}
      </p>
      <UButton label="Remove group" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="removeGroup" />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Group id" required :error="errorAt('groupId')">
        <UInput
          :model-value="group.groupId"
          class="w-full font-mono"
          placeholder="basic"
          spellcheck="false"
          @update:model-value="patchGroup({ groupId: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Label" required :error="errorAt('label')">
        <UInput :model-value="group.label" class="w-full" placeholder="Basic" @update:model-value="patchGroup({ label: String($event ?? '') })" />
      </UFormField>
      <UFormField label="Icon" :error="errorAt('icon')">
        <template #hint>
          <HelpTooltip text="Iconify name, such as i-lucide-sliders-horizontal." />
        </template>
        <UInput
          :model-value="group.icon"
          class="w-full font-mono"
          placeholder="i-lucide-sliders-horizontal"
          spellcheck="false"
          @update:model-value="patchGroup({ icon: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Description">
        <UInput
          :model-value="group.description"
          class="w-full"
          @update:model-value="patchGroup({ description: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Warning title" :error="errorAt('warningTitle')">
        <template #hint>
          <HelpTooltip text="Optional banner at the top of this group. A service group can warn that the values are calibration." />
        </template>
        <UInput
          :model-value="group.warningTitle"
          class="w-full"
          @update:model-value="patchGroup({ warningTitle: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Warning description" :error="errorAt('warningDescription')">
        <UInput
          :model-value="group.warningDescription"
          class="w-full"
          @update:model-value="patchGroup({ warningDescription: String($event ?? '') })"
        />
      </UFormField>
    </div>
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium text-highlighted">Sections</p>
      <UButton label="Add section" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addSubgroup" />
    </div>
    <div v-for="section in group.subgroups" :key="section.id" class="grid items-end gap-2 rounded-lg bg-default p-3 ring-1 ring-default sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
      <UFormField label="Section id" required :error="errorAt(`subgroups.${section.id}.subgroupId`)">
        <UInput
          :model-value="section.subgroupId"
          class="w-full font-mono"
          placeholder="receive"
          spellcheck="false"
          @update:model-value="patchSubgroup(section.id, { subgroupId: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Label" required :error="errorAt(`subgroups.${section.id}.label`)">
        <UInput
          :model-value="section.label"
          class="w-full"
          placeholder="Receive"
          @update:model-value="patchSubgroup(section.id, { label: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Description">
        <UInput
          :model-value="section.description"
          class="w-full"
          @update:model-value="patchSubgroup(section.id, { description: String($event ?? '') })"
        />
      </UFormField>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove section" @click="removeSubgroup(section.id)" />
    </div>
    <div v-if="sectionBuckets.sections.length === 0" class="flex flex-col gap-3">
      <div v-for="row in sectionBuckets.top" :key="row.field.id" class="flex flex-col gap-2">
        <p class="text-xs text-muted">{{ row.structName }}</p>
        <DriverMemoryFieldForm :struct-id="row.structId" :field-id="row.field.id" />
      </div>
      <UButton label="Add field" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" class="self-start" @click="addSetting('')" />
    </div>
    <template v-else>
      <div v-if="sectionBuckets.top.length > 0" class="flex flex-col gap-3">
        <p class="text-sm font-medium text-highlighted">Top of the panel</p>
        <div v-for="row in sectionBuckets.top" :key="row.field.id" class="flex flex-col gap-2">
          <p class="text-xs text-muted">{{ row.structName }}</p>
          <DriverMemoryFieldForm :struct-id="row.structId" :field-id="row.field.id" />
        </div>
      </div>
      <div v-for="section in sectionBuckets.sections" :key="section.id" class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">{{ section.label }}</p>
          <UButton label="Add field" color="neutral" variant="ghost" size="xs" icon="i-lucide-plus" @click="addSetting(section.subgroupId)" />
        </div>
        <p v-if="section.fields.length === 0" class="text-sm text-muted">No fields in this section.</p>
        <div v-for="row in section.fields" :key="row.field.id" class="flex flex-col gap-2">
          <p class="text-xs text-muted">{{ row.structName }}</p>
          <DriverMemoryFieldForm :struct-id="row.structId" :field-id="row.field.id" />
        </div>
      </div>
    </template>
  </DriverFormSection>
</template>
