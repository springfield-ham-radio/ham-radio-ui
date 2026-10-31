import type { RadioMemoryMap, RadioMemoryMapField } from '@springfield/ham-radio-api';
import {
  collectMemoryMapUiFields,
  groupMemoryMapUiFields,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import { resolveModuleIcon } from './module-icons';

/**
 * Menu-group name on a setting.
 * Kenwood config 1.16.0 sends this as `ui.section`. A top-level `section` is
 * accepted when `ui.section` is absent. `@springfield/ham-radio-api` does not
 * type either field yet. Both stay valid after `section?: string` is added to
 * `RadioMemoryMapFieldUi`.
 */
type RadioSettingUi = NonNullable<RadioMemoryMapField['ui']> & {
  section?: string;
};

type RadioSettingDefinition = RadioMemoryMapField & {
  section?: string;
  ui?: RadioSettingUi;
};

const OTHER_SECTION_LABEL = 'Other';
const OTHER_SECTION_ID = 'other';

export interface SettingsGroupWarning {
  title: string;
  description: string;
}

export interface SettingsSubgroup {
  id: string;
  label: string;
  description?: string;
}

export interface SettingsGroup {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  warning?: SettingsGroupWarning;
  groups?: SettingsSubgroup[];
}

export interface SettingsUiSubgroup {
  id: string;
  label: string;
  description?: string;
  fields: RadioMemoryMapUiField[];
}

export interface SettingsUiGroup {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  warning?: SettingsGroupWarning;
  fields: RadioMemoryMapUiField[];
  groups: SettingsUiSubgroup[];
}

function fallbackGroupLabel(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fieldUiOrder(field: RadioMemoryMapUiField): number | undefined {
  const extra = field.ui as RadioMemoryMapUiField['ui'] & { order?: number };
  return typeof extra.order === 'number' && Number.isFinite(extra.order) ? extra.order : undefined;
}

function sortUiFields(fields: RadioMemoryMapUiField[]): RadioMemoryMapUiField[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftOrder = fieldUiOrder(left.field) ?? Number.POSITIVE_INFINITY;
      const rightOrder = fieldUiOrder(right.field) ?? Number.POSITIVE_INFINITY;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.field);
}

function declaredGroups(memoryMap: RadioMemoryMap): SettingsGroup[] {
  const extra = memoryMap as RadioMemoryMap & { groups?: SettingsGroup[] };
  return extra.groups ?? [];
}

export function fieldSubgroup(field: RadioMemoryMapUiField): string | undefined {
  const extra = field.ui as RadioMemoryMapUiField['ui'] & { subgroup?: string };
  return extra.subgroup;
}

function collectUiSubgroups(declared: SettingsGroup | undefined, fields: RadioMemoryMapUiField[]): SettingsUiSubgroup[] {
  const grouped = new Map<string, RadioMemoryMapUiField[]>();

  for (const field of fields) {
    const subgroupId = fieldSubgroup(field);

    if (!subgroupId) {
      continue;
    }

    const existing = grouped.get(subgroupId);

    if (existing) {
      existing.push(field);
    } else {
      grouped.set(subgroupId, [field]);
    }
  }

  if (grouped.size === 0) {
    return [];
  }

  const result: SettingsUiSubgroup[] = [];
  const seen = new Set<string>();

  for (const subgroup of declared?.groups ?? []) {
    const subgroupFields = grouped.get(subgroup.id);

    if (!subgroupFields || subgroupFields.length === 0) {
      continue;
    }

    seen.add(subgroup.id);
    result.push({
      id: subgroup.id,
      label: subgroup.label,
      description: subgroup.description,
      fields: sortUiFields(subgroupFields),
    });
  }

  for (const [id, subgroupFields] of grouped) {
    if (seen.has(id)) {
      continue;
    }

    result.push({
      id,
      label: fallbackGroupLabel(id),
      fields: sortUiFields(subgroupFields),
    });
  }

  return result;
}

function toUiGroup(id: string, label: string, fields: RadioMemoryMapUiField[], declared?: SettingsGroup): SettingsUiGroup {
  return {
    id,
    label,
    description: declared?.description,
    icon: resolveModuleIcon(declared?.icon),
    warning: declared?.warning,
    fields: sortUiFields(fields),
    groups: collectUiSubgroups(declared, fields),
  };
}

function namedSection(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function settingSection(field: RadioMemoryMapField): string | undefined {
  const definition = field as RadioSettingDefinition;
  return namedSection(definition.ui?.section) ?? namedSection(definition.section);
}

function sectionNameByField(memoryMap: RadioMemoryMap): Map<string, string> {
  const names = new Map<string, string>();

  for (const struct of memoryMap.structs) {
    for (const field of struct.fields) {
      const section = settingSection(field);

      if (section) {
        names.set(`${struct.id}\0${field.id}`, section);
      }
    }
  }

  return names;
}

function sectionGroupId(label: string, used: Set<string>): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let id = slug.length > 0 ? slug : 'section';
  let suffix = 2;

  while (used.has(id)) {
    id = `${slug.length > 0 ? slug : 'section'}-${suffix}`;
    suffix += 1;
  }

  used.add(id);
  return id;
}

function toSectionGroup(id: string, label: string, fields: RadioMemoryMapUiField[]): SettingsUiGroup {
  return {
    id,
    label,
    icon: resolveModuleIcon(undefined),
    fields,
    groups: [],
  };
}

/**
 * Group settings by the driver's `section` name.
 * Returns undefined when no visible setting has a section, so the caller keeps
 * the legacy group layout. Sections follow first-seen order. Fields stay in
 * memory-map order. Menu numbers are not consulted. Settings with no section
 * share a final Other group with any section explicitly named Other.
 */
function collectSectionGroups(memoryMap: RadioMemoryMap, fields: RadioMemoryMapUiField[]): SettingsUiGroup[] | undefined {
  const sectionNames = sectionNameByField(memoryMap);
  const buckets = new Map<string, RadioMemoryMapUiField[]>();
  const order: string[] = [];
  const otherFields: RadioMemoryMapUiField[] = [];
  let sawSection = false;

  for (const field of fields) {
    const section = sectionNames.get(`${field.structId}\0${field.fieldId}`);

    if (!section) {
      otherFields.push(field);
      continue;
    }

    sawSection = true;

    if (section === OTHER_SECTION_LABEL) {
      otherFields.push(field);
      continue;
    }

    const existing = buckets.get(section);

    if (existing) {
      existing.push(field);
    } else {
      buckets.set(section, [field]);
      order.push(section);
    }
  }

  if (!sawSection) {
    return undefined;
  }

  const usedIds = new Set<string>();
  const groups = order.map((name) => toSectionGroup(sectionGroupId(name, usedIds), name, buckets.get(name) ?? []));

  if (otherFields.length > 0) {
    groups.push(toSectionGroup(sectionGroupId(OTHER_SECTION_ID, usedIds), OTHER_SECTION_LABEL, otherFields));
  }

  return groups;
}

function collectLegacyUiGroups(memoryMap: RadioMemoryMap, fields: RadioMemoryMapUiField[]): SettingsUiGroup[] {
  const grouped = groupMemoryMapUiFields(fields);
  const result: SettingsUiGroup[] = [];
  const seen = new Set<string>();

  for (const group of declaredGroups(memoryMap)) {
    const groupFields = grouped.get(group.id);

    if (!groupFields || groupFields.length === 0) {
      continue;
    }

    seen.add(group.id);
    result.push(toUiGroup(group.id, group.label, groupFields, group));
  }

  for (const [id, groupFields] of grouped) {
    if (seen.has(id)) {
      continue;
    }

    result.push(toUiGroup(id, fallbackGroupLabel(id), groupFields));
  }

  return result;
}

/**
 * Collect radio-wide UI fields grouped for the Settings tab.
 *
 * When any visible setting defines `ui.section` (or a top-level `section`),
 * those names become the left-nav groups and the panel heading. Order is the
 * driver's field order, and sections follow the first name seen. Settings with
 * no section land in a final Other group. Menu numbers are never used as headings.
 *
 * When no setting defines a section, top-level `memoryMap.groups` stay the left
 * nav. Nested `groups` plus field `ui.subgroup` stay headed sections in the
 * panel, and `ui.order` still sorts fields.
 */
export function collectMemoryMapUiGroups(memoryMap: RadioMemoryMap): SettingsUiGroup[] {
  const fields = collectMemoryMapUiFields(memoryMap);
  return collectSectionGroups(memoryMap, fields) ?? collectLegacyUiGroups(memoryMap, fields);
}
