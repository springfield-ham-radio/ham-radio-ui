import type { RadioMemoryMap } from '@springfield/ham-radio-api';
import {
  collectMemoryMapUiFields,
  groupMemoryMapUiFields,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';

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
      fields: subgroupFields,
    });
  }

  for (const [id, subgroupFields] of grouped) {
    if (seen.has(id)) {
      continue;
    }

    result.push({
      id,
      label: fallbackGroupLabel(id),
      fields: subgroupFields,
    });
  }

  return result;
}

function toUiGroup(id: string, label: string, fields: RadioMemoryMapUiField[], declared?: SettingsGroup): SettingsUiGroup {
  return {
    id,
    label,
    description: declared?.description,
    icon: declared?.icon,
    warning: declared?.warning,
    fields,
    groups: collectUiSubgroups(declared, fields),
  };
}

/**
 * Collect radio-wide UI fields grouped for the Settings tab.
 * Top-level `memoryMap.groups` become the left nav. Nested `groups` plus
 * field `ui.subgroup` become headed sections in the panel.
 */
export function collectMemoryMapUiGroups(memoryMap: RadioMemoryMap): SettingsUiGroup[] {
  const grouped = groupMemoryMapUiFields(collectMemoryMapUiFields(memoryMap));
  const result: SettingsUiGroup[] = [];
  const seen = new Set<string>();

  for (const group of declaredGroups(memoryMap)) {
    const fields = grouped.get(group.id);

    if (!fields || fields.length === 0) {
      continue;
    }

    seen.add(group.id);
    result.push(toUiGroup(group.id, group.label, fields, group));
  }

  for (const [id, fields] of grouped) {
    if (seen.has(id)) {
      continue;
    }

    result.push(toUiGroup(id, fallbackGroupLabel(id), fields));
  }

  return result;
}
