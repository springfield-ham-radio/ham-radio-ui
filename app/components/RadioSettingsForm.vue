<script setup lang="ts">
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

const EMPTY_SELECT_VALUE = '__empty__';

const GROUP_LABELS: Record<string, string> = {
  basic: 'Basic Settings',
  display: 'Display',
  audio: 'Audio',
  aux: 'Auxiliary',
  transmit: 'Transmit / Receive',
  dtmf: 'DTMF Settings',
  memory: 'Memory',
  repeater: 'Repeater',
  keys: 'PF Keys',
  bands: 'Band Masks',
  vfo: 'VFO',
  aprs: 'APRS',
  sky: 'Sky Command',
  save: 'Power Save',
  main: 'Main',
  advanced: 'Advanced Settings',
  workmode: 'Work Mode Settings',
  other: 'Other Settings',
  service: 'Service Settings',
};

const GROUP_ICONS: Record<string, string> = {
  basic: 'i-lucide-sliders-horizontal',
  display: 'i-lucide-monitor',
  audio: 'i-lucide-volume-2',
  aux: 'i-lucide-unplug',
  transmit: 'i-lucide-radio-tower',
  dtmf: 'i-lucide-hash',
  memory: 'i-lucide-database',
  repeater: 'i-lucide-repeat-2',
  keys: 'i-lucide-keyboard',
  bands: 'i-lucide-layers',
  vfo: 'i-lucide-gauge',
  aprs: 'i-lucide-map-pinned',
  sky: 'i-lucide-cloud',
  save: 'i-lucide-battery-medium',
  main: 'i-lucide-layout-dashboard',
  advanced: 'i-lucide-settings-2',
  workmode: 'i-lucide-waypoints',
  other: 'i-lucide-ellipsis',
  service: 'i-lucide-wrench',
};

const GROUP_ORDER = Object.keys(GROUP_LABELS);

const contentPane = useTemplateRef<HTMLElement>('contentPane');

const uiFields = computed(() => collectMemoryMapUiFields(props.memoryMap));
const groupedFields = computed(() => groupMemoryMapUiFields(uiFields.value));

const groupEntries = computed(() => {
  return [...groupedFields.value.entries()]
    .map(([group, fields]) => ({
      group,
      label: GROUP_LABELS[group] ?? group,
      icon: GROUP_ICONS[group] ?? 'i-lucide-sliders-horizontal',
      fields,
    }))
    .sort((left, right) => {
      const leftIndex = GROUP_ORDER.indexOf(left.group);
      const rightIndex = GROUP_ORDER.indexOf(right.group);
      return (leftIndex === -1 ? GROUP_ORDER.length : leftIndex) - (rightIndex === -1 ? GROUP_ORDER.length : rightIndex);
    });
});

const selectedGroup = ref<string | undefined>('basic');

watch(
  groupEntries,
  (entries) => {
    const values = entries.map((entry) => entry.group);

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
  return groupEntries.value.find((entry) => entry.group === selectedGroup.value) ?? groupEntries.value[0];
});

const selectedFields = computed<RadioMemoryMapUiField[]>(() => selectedEntry.value?.fields ?? []);

const groupSelectItems = computed(() => {
  return groupEntries.value.map((entry) => ({
    label: entry.label,
    value: entry.group,
  }));
});

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
        :key="entry.group"
        type="button"
        class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium transition-colors"
        :class="
          selectedGroup === entry.group
            ? 'bg-primary text-inverted'
            : 'text-highlighted hover:bg-elevated/80'
        "
        :aria-current="selectedGroup === entry.group ? 'true' : undefined"
        @click="selectGroup(entry.group)"
      >
        <UIcon :name="entry.icon" class="size-4 shrink-0" />
        {{ entry.label }}
      </button>
    </nav>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col md:pl-6">
      <header class="mb-3 flex shrink-0 items-center gap-2">
        <UIcon v-if="selectedEntry" :name="selectedEntry.icon" class="size-4 text-muted" />
        <h2 class="text-sm font-semibold text-highlighted">{{ selectedEntry?.label }}</h2>
      </header>

      <div ref="contentPane" class="min-h-0 flex-1 overflow-y-auto pb-8">
        <div :key="selectedGroup" class="space-y-3">
          <UAlert
            v-if="selectedGroup === 'service'"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Service calibration values"
            description="Change only with appropriate test equipment."
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              v-for="field in selectedFields"
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
        </div>
      </div>
    </div>
  </div>
</template>
