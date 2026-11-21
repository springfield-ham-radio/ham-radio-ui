<script setup lang="ts">
import type { RadioMemoryMap, RadioSettings } from '@springfield/ham-radio-api';
import { type RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { resolveModuleIcon } from '~/utils/module-icons';
import { collectMemoryMapUiGroups, fieldSubgroup } from '~/utils/settings-groups';
import { settingsFieldHelp } from '~/utils/settings-field-help';
import { layoutSettingsSection } from '~/utils/settings-layout';

const props = withDefaults(
  defineProps<{
    memoryMap: RadioMemoryMap;
    settings: RadioSettings;
    /** Setting paths that differ from the radio or loaded memory. */
    changedPaths?: readonly string[];
  }>(),
  {
    changedPaths: () => [],
  },
);

const emit = defineEmits<{
  'update:settings': [settings: RadioSettings];
}>();

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

const helpByPath = computed(() => {
  const help = new Map<string, NonNullable<ReturnType<typeof settingsFieldHelp>>>();

  for (const entry of groupEntries.value) {
    for (const field of entry.fields) {
      const fieldHelp = settingsFieldHelp(field);

      if (fieldHelp) {
        help.set(field.path, fieldHelp);
      }
    }
  }

  return help;
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

const changedPathSet = computed(() => new Set(props.changedPaths));

function groupHasChanges(entry: { fields: { path: string }[] }): boolean {
  return entry.fields.some((field) => changedPathSet.value.has(field.path));
}

const groupSelectItems = computed(() => {
  return groupEntries.value.map((entry) => ({
    label: groupHasChanges(entry) ? `${entry.label} · Changed` : entry.label,
    value: entry.id,
  }));
});

function groupIcon(entry: { icon?: string }): string {
  return resolveModuleIcon(entry.icon);
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
        <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
        <UTooltip v-if="groupHasChanges(entry)" text="Changed">
          <UBadge
            color="warning"
            variant="solid"
            class="size-1.5 shrink-0 rounded-full p-0"
            aria-label="Changed"
          />
        </UTooltip>
      </button>
    </nav>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col md:pl-6">
      <header class="mb-3 flex shrink-0 items-center gap-1">
        <div class="flex items-center gap-2">
          <UIcon v-if="selectedEntry" :name="groupIcon(selectedEntry)" class="size-4 text-muted" />
          <h2 class="text-sm font-semibold text-highlighted">{{ selectedEntry?.label }}</h2>
        </div>
        <HelpTooltip v-if="selectedEntry?.description" :text="selectedEntry.description" />
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
            <header v-if="section.label" class="flex items-center gap-1">
              <h3 class="text-sm font-semibold text-highlighted">{{ section.label }}</h3>
              <HelpTooltip v-if="section.description" :text="section.description" />
            </header>

            <SettingsFieldGrid
              :cells="layoutSettingsSection(section.fields)"
              :settings="settings"
              :changed-paths="changedPaths"
              :help-by-path="helpByPath"
              @update:settings="emit('update:settings', $event)"
            />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
