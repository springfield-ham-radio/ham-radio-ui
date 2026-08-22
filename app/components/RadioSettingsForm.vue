<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui';
import type { RadioMemoryMap, RadioSettings, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  collectMemoryMapUiFields,
  groupMemoryMapUiFields,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { getSettingAtPath, setSettingAtPath } from '~/utils/settings-path';

const props = defineProps<{
  memoryMap: RadioMemoryMap;
  settings: RadioSettings;
}>();

const emit = defineEmits<{
  'update:settings': [settings: RadioSettings];
}>();

const GROUP_LABELS: Record<string, string> = {
  basic: 'Basic Settings',
  advanced: 'Advanced Settings',
  workmode: 'Work Mode Settings',
  dtmf: 'DTMF Settings',
  other: 'Other Settings',
  service: 'Service Settings',
};

const uiFields = computed(() => collectMemoryMapUiFields(props.memoryMap));
const groupedFields = computed(() => groupMemoryMapUiFields(uiFields.value));

const groupEntries = computed(() => {
  return [...groupedFields.value.entries()].map(([group, fields]) => ({
    group,
    label: GROUP_LABELS[group] ?? group,
    fields,
  }));
});

const accordionItems = computed<AccordionItem[]>(() => {
  return groupEntries.value.map((entry) => ({
    label: entry.label,
    value: entry.group,
  }));
});

const openGroups = ref<string[]>(['basic']);

const fieldsByGroup = computed(() => {
  return new Map(groupEntries.value.map((entry) => [entry.group, entry.fields]));
});

function fieldsForItem(item: AccordionItem): RadioMemoryMapUiField[] {
  const group = String(item.value ?? '');
  return fieldsByGroup.value.get(group) ?? [];
}

function fieldValue(field: RadioMemoryMapUiField): RadioSettingValue | undefined {
  return getSettingAtPath(props.settings, field.path);
}

function updateField(field: RadioMemoryMapUiField, value: RadioSettingValue): void {
  emit('update:settings', setSettingAtPath(props.settings, field.path, value));
}

function selectItems(field: RadioMemoryMapUiField): { label: string; value: string }[] {
  if (field.value?.kind !== 'enum') {
    return [];
  }

  return field.value.values.map((entry) => ({ label: entry, value: entry }));
}

function isWritable(field: RadioMemoryMapUiField): boolean {
  return field.ui.writable !== false;
}
</script>

<template>
  <div class="pb-8">
    <p v-if="accordionItems.length === 0" class="text-sm text-muted">No settings are defined for this radio.</p>

    <UAccordion
      v-else
      v-model="openGroups"
      type="multiple"
      :items="accordionItems"
      :unmount-on-hide="false"
      :ui="{
        root: 'w-full',
        item: 'border-b border-default last:border-b-0',
        trigger: 'text-highlighted',
        body: 'pb-4',
      }"
    >
      <template #body="{ item }">
        <div class="space-y-3">
          <p v-if="item.value === 'service'" class="text-xs text-warning">
            Service calibration values. Change only with appropriate test equipment.
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              v-for="field in fieldsForItem(item)"
              :key="field.path"
              :label="field.ui.label"
              :description="field.ui.description"
            >
              <UInputNumber
                v-if="field.ui.widget === 'integer' || field.ui.widget === 'number'"
                :model-value="(fieldValue(field) as number | undefined) ?? 0"
                :min="field.value?.kind === 'integer' ? field.value.min : undefined"
                :max="field.value?.kind === 'integer' ? field.value.max : undefined"
                :disabled="!isWritable(field)"
                class="w-full"
                @update:model-value="updateField(field, $event ?? 0)"
              />

              <USelect
                v-else-if="field.ui.widget === 'select'"
                :model-value="String(fieldValue(field) ?? '')"
                :items="selectItems(field)"
                :disabled="!isWritable(field)"
                class="w-full"
                @update:model-value="updateField(field, String($event))"
              />

              <USwitch
                v-else-if="field.ui.widget === 'switch'"
                :model-value="Boolean(fieldValue(field))"
                :disabled="!isWritable(field)"
                @update:model-value="updateField(field, Boolean($event))"
              />

              <UInput
                v-else
                :model-value="String(fieldValue(field) ?? '')"
                :disabled="!isWritable(field)"
                class="w-full"
                @update:model-value="updateField(field, String($event))"
              />
            </UFormField>
          </div>
        </div>
      </template>
    </UAccordion>
  </div>
</template>
