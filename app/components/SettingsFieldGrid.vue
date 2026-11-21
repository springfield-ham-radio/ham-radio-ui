<script setup lang="ts">
import type { RadioSettings, RadioSettingValue } from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { fieldHasStringChoices, settingsStringChoices, stringChoiceSelectItems } from '~/utils/settings-field-choices';
import { settingsFieldMenuNumber, type SettingsFieldHelp } from '~/utils/settings-field-help';
import {
  coordinateDegreeMax,
  partsFromCoordinate,
  type SettingsCoordinatePart,
} from '~/utils/settings-coordinate';
import {
  layoutCellPaths,
  type SettingsCoordinateCell,
  type SettingsLayoutCell,
  type SettingsRecordCell,
  type SettingsRecordTab,
} from '~/utils/settings-layout';
import { recordFieldLabel } from '~/utils/settings-record';
import { getSettingAtPath, setSettingAtPath } from '~/utils/settings-path';
import { settingsSwitchCheckboxHelp, type SettingsSwitchGroup } from '~/utils/settings-switch-groups';

const props = defineProps<{
  cells: SettingsLayoutCell[];
  settings: RadioSettings;
  changedPaths: readonly string[];
  helpByPath: ReadonlyMap<string, SettingsFieldHelp>;
}>();

const emit = defineEmits<{
  'update:settings': [settings: RadioSettings];
}>();

const EMPTY_SELECT_VALUE = '__empty__';

const { settingsFieldsGridStyle, showMenuNumbers } = useAppearanceSettings();
const changedPathSet = computed(() => new Set(props.changedPaths));
const selectedRecordTab = ref<Record<string, number>>({});
const coordinateDraft = ref<Record<string, { degrees: number | null; minutes: number | null }>>({});
const coordinateError = ref<Record<string, string | undefined>>({});

function fieldChanged(path: string): boolean {
  return changedPathSet.value.has(path);
}

function changedControlBindings(path: string): { color: 'warning'; highlight: true } | undefined {
  if (!fieldChanged(path)) {
    return undefined;
  }

  return { color: 'warning', highlight: true };
}

function changedCoordinateBindings(cell: SettingsCoordinateCell): { color: 'warning'; highlight: true } | undefined {
  if (!cell.parts.some((part) => fieldChanged(part.field.path))) {
    return undefined;
  }

  return { color: 'warning', highlight: true };
}

function fieldValue(field: RadioMemoryMapUiField): RadioSettingValue | undefined {
  return getSettingAtPath(props.settings, field.path);
}

function updateSettings(next: RadioSettings): void {
  emit('update:settings', next);
}

function updateField(field: RadioMemoryMapUiField, value: RadioSettingValue): void {
  if (Object.is(fieldValue(field), value)) {
    return;
  }

  updateSettings(setSettingAtPath(props.settings, field.path, value));
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

function selectItems(field: RadioMemoryMapUiField): { label: string; value: string }[] {
  const choices = settingsStringChoices(field.value);

  if (choices) {
    return stringChoiceSelectItems(choices, fieldValue(field), EMPTY_SELECT_VALUE);
  }

  return enumSelectItems(field);
}

function showsSelect(field: RadioMemoryMapUiField): boolean {
  return field.ui.widget === 'select' || fieldHasStringChoices(field);
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

function visibleMenuNumber(field: RadioMemoryMapUiField): number | undefined {
  if (!showMenuNumbers.value) {
    return undefined;
  }

  return settingsFieldMenuNumber(field);
}

function visibleCoordinateMenu(cell: SettingsCoordinateCell): number | undefined {
  if (!showMenuNumbers.value) {
    return undefined;
  }

  return cell.menuNumber;
}

function fieldFormUi(field: RadioMemoryMapUiField) {
  const isSwitch = field.ui.widget === 'switch';
  const hasHelp = props.helpByPath.has(field.path);

  if (!isSwitch && !hasHelp) {
    return undefined;
  }

  return {
    ...(isSwitch
      ? {
          root: 'flex items-center justify-between gap-3',
          wrapper: 'min-w-0 flex-1',
          container: 'mt-0 shrink-0',
        }
      : {}),
    ...(hasHelp ? { labelWrapper: 'justify-start' } : {}),
  };
}

function switchGroupFormUi(group: SettingsSwitchGroup) {
  if (!group.help) {
    return undefined;
  }

  return { labelWrapper: 'justify-start' };
}

function groupChanged(group: SettingsSwitchGroup): boolean {
  return group.fields.some((field) => fieldChanged(field.path));
}

function checkboxHelp(field: RadioMemoryMapUiField, group: SettingsSwitchGroup) {
  return settingsSwitchCheckboxHelp(field, group);
}

function activeRecordTab(cell: SettingsRecordCell): SettingsRecordTab | undefined {
  const selected = selectedRecordTab.value[cell.key];
  return cell.tabs.find((tab) => tab.index === selected) ?? cell.tabs[0];
}

function selectRecordTab(cell: SettingsRecordCell, index: number): void {
  selectedRecordTab.value = { ...selectedRecordTab.value, [cell.key]: index };
}

function tabChanged(tab: SettingsRecordTab): boolean {
  return tab.cells.some((cell) => layoutCellPaths(cell).some((path) => fieldChanged(path)));
}

function coordinatePartValue(cell: SettingsCoordinateCell, part: SettingsCoordinatePart): number {
  const match = cell.parts.find((entry) => entry.part === part);
  return match ? numberValue(match.field) : 0;
}

function storedCoordinateMinutes(cell: SettingsCoordinateCell): number {
  const scale = cell.fractionScale > 0 ? cell.fractionScale : 1;
  return coordinatePartValue(cell, 'minutes') + coordinatePartValue(cell, 'fraction') / scale;
}

function coordinateDegrees(cell: SettingsCoordinateCell): number | null {
  return coordinateDraft.value[cell.key]?.degrees ?? coordinatePartValue(cell, 'degrees');
}

function coordinateMinutes(cell: SettingsCoordinateCell): number | null {
  return coordinateDraft.value[cell.key]?.minutes ?? storedCoordinateMinutes(cell);
}

function editCoordinate(cell: SettingsCoordinateCell, side: 'degrees' | 'minutes', value: number | null | undefined): void {
  const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const draft = {
    degrees: side === 'degrees' ? nextValue : coordinateDegrees(cell),
    minutes: side === 'minutes' ? nextValue : coordinateMinutes(cell),
  };
  const parsed = partsFromCoordinate(draft.degrees, draft.minutes, cell.axis, cell.fractionScale);

  if ('error' in parsed) {
    coordinateDraft.value = { ...coordinateDraft.value, [cell.key]: draft };
    coordinateError.value = { ...coordinateError.value, [cell.key]: parsed.error };
    return;
  }

  const drafts = { ...coordinateDraft.value };
  const errors = { ...coordinateError.value };
  delete drafts[cell.key];
  delete errors[cell.key];
  coordinateDraft.value = drafts;
  coordinateError.value = errors;

  let next = props.settings;

  for (const part of cell.parts) {
    const stored = part.part === 'degrees' ? parsed.degrees : part.part === 'minutes' ? parsed.minutes : parsed.fraction;
    const current = getSettingAtPath(next, part.field.path);

    if (Object.is(current, stored)) {
      continue;
    }

    next = setSettingAtPath(next, part.field.path, stored);
  }

  if (next !== props.settings) {
    updateSettings(next);
  }
}

function coordinateWritable(cell: SettingsCoordinateCell): boolean {
  return cell.parts.every((part) => isWritable(part.field));
}

function coordinateHelp(cell: SettingsCoordinateCell): SettingsFieldHelp | undefined {
  for (const part of cell.parts) {
    const help = props.helpByPath.get(part.field.path);

    if (help) {
      return help;
    }
  }

  return undefined;
}

</script>

<template>
  <div class="settings-fields-grid" :style="settingsFieldsGridStyle">
    <template v-for="cell in cells" :key="cell.key">
      <UFormField v-if="cell.kind === 'field'" :label="recordFieldLabel(cell.field)" :ui="fieldFormUi(cell.field)">
        <template v-if="fieldChanged(cell.field.path) || visibleMenuNumber(cell.field) !== undefined" #label>
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <span
              v-if="visibleMenuNumber(cell.field) !== undefined"
              class="shrink-0 font-mono text-xs tabular-nums text-muted"
            >{{ visibleMenuNumber(cell.field) }}</span>
            <span>{{ recordFieldLabel(cell.field) }}</span>
            <UTooltip v-if="fieldChanged(cell.field.path)" text="Changed">
              <UBadge color="warning" variant="subtle" size="xs" class="size-1.5 rounded-full p-0" aria-label="Changed" />
            </UTooltip>
          </span>
        </template>
        <template v-if="helpByPath.get(cell.field.path)" #hint>
          <HelpTooltip
            :menu="helpByPath.get(cell.field.path)?.menuLabel"
            :text="helpByPath.get(cell.field.path)?.description"
            :constraint="helpByPath.get(cell.field.path)?.constraint"
          />
        </template>

        <UInputNumber
          v-if="cell.field.ui.widget === 'integer' || cell.field.ui.widget === 'number'"
          v-bind="changedControlBindings(cell.field.path)"
          :model-value="numberValue(cell.field)"
          :min="cell.field.value?.kind === 'integer' ? cell.field.value.min : undefined"
          :max="cell.field.value?.kind === 'integer' ? cell.field.value.max : undefined"
          :disabled="!isWritable(cell.field)"
          class="w-full"
          @update:model-value="updateNumber(cell.field, $event)"
        />

        <USelect
          v-else-if="showsSelect(cell.field)"
          v-bind="changedControlBindings(cell.field.path)"
          :model-value="selectValue(cell.field)"
          :items="selectItems(cell.field)"
          :disabled="!isWritable(cell.field)"
          class="w-full"
          @update:model-value="updateSelect(cell.field, $event)"
        />

        <USwitch
          v-else-if="cell.field.ui.widget === 'switch'"
          v-bind="changedControlBindings(cell.field.path)"
          :model-value="Boolean(fieldValue(cell.field))"
          :disabled="!isWritable(cell.field)"
          @update:model-value="updateField(cell.field, Boolean($event))"
        />

        <UInput
          v-else
          v-bind="changedControlBindings(cell.field.path)"
          :model-value="textValue(cell.field)"
          :disabled="!isWritable(cell.field)"
          class="w-full"
          @update:model-value="updateField(cell.field, String($event ?? ''))"
        />
      </UFormField>

      <UFormField v-else-if="cell.kind === 'switches'" class="min-w-0" :label="cell.group.label" :ui="switchGroupFormUi(cell.group)">
        <template #label>
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <span class="shrink-0 font-mono text-xs tabular-nums text-muted">{{ cell.group.menuNumber }}</span>
            <span v-if="cell.group.code">{{ cell.group.code }}</span>
            <UTooltip v-if="groupChanged(cell.group)" text="Changed">
              <UBadge color="warning" variant="subtle" size="xs" class="size-1.5 rounded-full p-0" aria-label="Changed" />
            </UTooltip>
          </span>
        </template>
        <template v-if="cell.group.help" #hint>
          <HelpTooltip
            :menu="cell.group.help.menuLabel"
            :text="cell.group.help.description"
            :constraint="cell.group.help.constraint"
          />
        </template>

        <div class="flex flex-col gap-2">
          <div v-for="field in cell.group.fields" :key="field.path" class="flex items-center justify-between gap-3">
            <span class="inline-flex min-w-0 items-center gap-1.5 text-sm text-default">
              <span>{{ recordFieldLabel(field) }}</span>
              <HelpTooltip
                v-if="checkboxHelp(field, cell.group)"
                :menu="checkboxHelp(field, cell.group)?.menuLabel"
                :text="checkboxHelp(field, cell.group)?.description"
                :constraint="checkboxHelp(field, cell.group)?.constraint"
              />
              <UTooltip v-if="fieldChanged(field.path)" text="Changed">
                <UBadge color="warning" variant="subtle" size="xs" class="size-1.5 rounded-full p-0" aria-label="Changed" />
              </UTooltip>
            </span>
            <USwitch
              v-bind="changedControlBindings(field.path)"
              :model-value="Boolean(fieldValue(field))"
              :disabled="!isWritable(field)"
              :aria-label="recordFieldLabel(field)"
              class="shrink-0"
              @update:model-value="updateField(field, Boolean($event))"
            />
          </div>
        </div>
      </UFormField>

      <UFormField
        v-else-if="cell.kind === 'coordinate'"
        :label="cell.label"
        :error="coordinateError[cell.key]"
        :ui="coordinateHelp(cell) ? { labelWrapper: 'justify-start' } : undefined"
      >
        <template v-if="changedCoordinateBindings(cell) || visibleCoordinateMenu(cell) !== undefined" #label>
          <span class="inline-flex min-w-0 items-center gap-1.5">
            <span
              v-if="visibleCoordinateMenu(cell) !== undefined"
              class="shrink-0 font-mono text-xs tabular-nums text-muted"
            >{{ visibleCoordinateMenu(cell) }}</span>
            <span>{{ cell.label }}</span>
            <UTooltip v-if="changedCoordinateBindings(cell)" text="Changed">
              <UBadge color="warning" variant="subtle" size="xs" class="size-1.5 rounded-full p-0" aria-label="Changed" />
            </UTooltip>
          </span>
        </template>
        <template v-if="coordinateHelp(cell)" #hint>
          <HelpTooltip
            :menu="coordinateHelp(cell)?.menuLabel"
            :text="coordinateHelp(cell)?.description"
            :constraint="coordinateHelp(cell)?.constraint"
          />
        </template>
        <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <UInputNumber
            v-bind="changedCoordinateBindings(cell)"
            :model-value="coordinateDegrees(cell)"
            :min="0"
            :max="coordinateDegreeMax(cell.axis)"
            :step="1"
            :step-snapping="false"
            :allow-invalid="true"
            :format-options="{ maximumFractionDigits: 0, useGrouping: false }"
            :increment="false"
            :decrement="false"
            disable-wheel-change
            :disabled="!coordinateWritable(cell)"
            class="w-20"
            :aria-label="`${cell.label} degrees`"
            @update:model-value="editCoordinate(cell, 'degrees', $event)"
          />
          <span class="text-base leading-none text-default" aria-hidden="true">°</span>
          <UInputNumber
            v-bind="changedCoordinateBindings(cell)"
            :model-value="coordinateMinutes(cell)"
            :min="0"
            :max="59.99"
            :step="0.01"
            :step-snapping="false"
            :allow-invalid="true"
            :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }"
            :increment="false"
            :decrement="false"
            disable-wheel-change
            :disabled="!coordinateWritable(cell)"
            class="w-24"
            :aria-label="`${cell.label} minutes`"
            @update:model-value="editCoordinate(cell, 'minutes', $event)"
          />
          <span class="text-base leading-none text-default" aria-hidden="true">′</span>
        </div>
      </UFormField>

      <div v-else class="col-span-full space-y-3">
        <div class="flex flex-wrap gap-1 border-b border-default" role="tablist" :aria-label="cell.tabs[0]?.label ?? 'Records'">
          <button
            v-for="tab in cell.tabs"
            :key="tab.index"
            type="button"
            role="tab"
            class="inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm font-medium"
            :class="
              activeRecordTab(cell)?.index === tab.index
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-highlighted'
            "
            :aria-selected="activeRecordTab(cell)?.index === tab.index"
            @click="selectRecordTab(cell, tab.index)"
          >
            <span>{{ tab.label }}</span>
            <UTooltip v-if="tabChanged(tab)" text="Changed">
              <UBadge color="warning" variant="subtle" size="xs" class="size-1.5 rounded-full p-0" aria-label="Changed" />
            </UTooltip>
          </button>
        </div>
        <SettingsFieldGrid
          v-if="activeRecordTab(cell)"
          :cells="activeRecordTab(cell)?.cells ?? []"
          :settings="settings"
          :changed-paths="changedPaths"
          :help-by-path="helpByPath"
          @update:settings="updateSettings"
        />
      </div>
    </template>
  </div>
</template>
