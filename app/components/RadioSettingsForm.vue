<script setup lang="ts">
import type { RadioMemoryMap, RadioSettings, RadioSettingValue } from '@springfield/ham-radio-api';
import { type RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { collectMemoryMapUiGroups, fieldSubgroup } from '~/utils/settings-groups';
import { getSettingAtPath, setSettingAtPath } from '~/utils/settings-path';

const props = defineProps<{
  memoryMap: RadioMemoryMap;
  settings: RadioSettings;
}>();

const emit = defineEmits<{
  'update:settings': [settings: RadioSettings];
}>();

const EMPTY_SELECT_VALUE = '__empty__';
const FALLBACK_GROUP_ICON = 'i-lucide-sliders-horizontal';

const contentPane = useTemplateRef<HTMLElement>('contentPane');

const groupEntries = computed(() => collectMemoryMapUiGroups(props.memoryMap));

const selectedGroup = ref<string | undefined>();

watch(
  groupEntries,
  (entries) => {
    const values = entries.map((entry) => entry.id);

    if (values.length === 0) {
      selectedGroup.value = undefined;
      return;
    }

    if (!selectedGroup.value || !values.includes(selectedGroup.value)) {
      selectedGroup.value = values[0];
    }
  },
  { immediate: true },
);

watch(selectedGroup, () => {
  contentPane.value?.scrollTo({ top: 0 });
});

const selectedEntry = computed(() => {
  return groupEntries.value.find((entry) => entry.id === selectedGroup.value) ?? groupEntries.value[0];
});

const selectedSections = computed(() => {
  const entry = selectedEntry.value;

  if (!entry) {
    return [];
  }

  if (entry.groups.length === 0) {
    return [{ id: entry.id, fields: entry.fields }];
  }

  const sections: { id: string; label?: string; description?: string; fields: RadioMemoryMapUiField[] }[] = [];
  const ungrouped = entry.fields.filter((field) => !fieldSubgroup(field));

  if (ungrouped.length > 0) {
    sections.push({ id: `${entry.id}-ungrouped`, fields: ungrouped });
  }

  for (const subgroup of entry.groups) {
    sections.push(subgroup);
  }

  return sections;
});

const groupSelectItems = computed(() => {
  return groupEntries.value.map((entry) => ({
    label: entry.label,
    value: entry.id,
  }));
});

function groupIcon(entry: { icon?: string }): string {
  return entry.icon || FALLBACK_GROUP_ICON;
}

function fieldValue(field: RadioMemoryMapUiField): RadioSettingValue | undefined {
  return getSettingAtPath(props.settings, field.path);
}

function updateField(field: RadioMemoryMapUiField, value: RadioSettingValue): void {
  if (Object.is(fieldValue(field), value)) {
    return;
  }

  emit('update:settings', setSettingAtPath(props.settings, field.path, value));
}

function selectValue(field: RadioMemoryMapUiField): string {
  const value = fieldValue(field);

  if (value === undefined || value === null || value === '') {
    return EMPTY_SELECT_VALUE;
  }

  return String(value);
}

function enumSelectItems(field: RadioMemoryMapUiField): { label: string; value: string }[] {
  if (field.value?.kind !== 'enum') {
    return [];
  }

  const items: { label: string; value: string }[] = [];
  const seen = new Set<string>();

  for (const entry of field.value.values) {
    const value = entry === '' ? EMPTY_SELECT_VALUE : entry;

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    items.push({
      label: entry === '' ? 'None' : entry,
      value,
    });
  }

  return items;
}

function updateSelect(field: RadioMemoryMapUiField, value: unknown): void {
  const next = value === EMPTY_SELECT_VALUE || value === undefined || value === null ? '' : String(value);
  updateField(field, next);
}

function numberValue(field: RadioMemoryMapUiField): number {
  const value = fieldValue(field);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function updateNumber(field: RadioMemoryMapUiField, value: number | null | undefined): void {
  const next = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  updateField(field, next);
}

function textValue(field: RadioMemoryMapUiField): string {
  const value = fieldValue(field);

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function isWritable(field: RadioMemoryMapUiField): boolean {
  return field.ui.writable !== false;
}

function selectGroup(group: string): void {
  selectedGroup.value = group;
}
</script>

<template>
  <p v-if="groupEntries.length === 0" class="text-sm text-muted">No settings are defined for this radio.</p>

  <div v-else class="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
    <USelect
      v-model="selectedGroup"
      :items="groupSelectItems"
      value-key="value"
      class="mb-3 w-full shrink-0 md:hidden"
    />

    <nav
      class="mb-3 hidden min-h-0 w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-default md:mb-0 md:flex md:border-r md:pr-3"
      aria-label="Settings sections"
    >
      <button
        v-for="entry in groupEntries"
        :key="entry.id"
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
        :class="
          selectedGroup === entry.id
            ? 'bg-primary text-inverted'
            : 'text-highlighted hover:bg-elevated/80'
        "
        :aria-current="selectedGroup === entry.id ? 'true' : undefined"
        @click="selectGroup(entry.id)"
      >
        <UIcon :name="groupIcon(entry)" class="size-4 shrink-0" />
        {{ entry.label }}
      </button>
    </nav>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col md:pl-6">
      <header class="mb-3 flex shrink-0 flex-col gap-1">
        <div class="flex items-center gap-2">
          <UIcon v-if="selectedEntry" :name="groupIcon(selectedEntry)" class="size-4 text-muted" />
          <h2 class="text-sm font-semibold text-highlighted">{{ selectedEntry?.label }}</h2>
        </div>
        <p v-if="selectedEntry?.description" class="text-xs text-muted">{{ selectedEntry.description }}</p>
      </header>

      <div ref="contentPane" class="min-h-0 flex-1 overflow-y-auto pb-8">
        <div :key="selectedGroup" class="space-y-5">
          <UAlert
            v-if="selectedEntry?.warning"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="selectedEntry.warning.title"
            :description="selectedEntry.warning.description"
          />

          <section
            v-for="(section, index) in selectedSections"
            :key="section.id"
            class="space-y-3"
            :class="index > 0 ? 'border-t border-default pt-5' : undefined"
          >
            <header v-if="section.label" class="space-y-0.5">
              <h3 class="text-sm font-semibold text-highlighted">{{ section.label }}</h3>
              <p v-if="section.description" class="text-xs text-muted">{{ section.description }}</p>
            </header>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField
                v-for="field in section.fields"
                :key="field.path"
                :label="field.ui.label"
                :description="field.ui.description"
              >
                <UInputNumber
                  v-if="field.ui.widget === 'integer' || field.ui.widget === 'number'"
                  :model-value="numberValue(field)"
                  :min="field.value?.kind === 'integer' ? field.value.min : undefined"
                  :max="field.value?.kind === 'integer' ? field.value.max : undefined"
                  :disabled="!isWritable(field)"
                  class="w-full"
                  @update:model-value="updateNumber(field, $event)"
                />

                <USelect
                  v-else-if="field.ui.widget === 'select'"
                  :model-value="selectValue(field)"
                  :items="enumSelectItems(field)"
                  :disabled="!isWritable(field)"
                  class="w-full"
                  @update:model-value="updateSelect(field, $event)"
                />

                <USwitch
                  v-else-if="field.ui.widget === 'switch'"
                  :model-value="Boolean(fieldValue(field))"
                  :disabled="!isWritable(field)"
                  @update:model-value="updateField(field, Boolean($event))"
                />

                <UInput
                  v-else
                  :model-value="textValue(field)"
                  :disabled="!isWritable(field)"
                  class="w-full"
                  @update:model-value="updateField(field, String($event ?? ''))"
                />
              </UFormField>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
