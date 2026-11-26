import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { settingsFieldHelp, settingsFieldMenuNumber, type SettingsFieldHelp } from './settings-field-help';
import { recordFieldLabel } from './settings-record';

export interface SettingsMemoryTableColumn {
  key: string;
  header: string;
  fieldsByIndex: Map<number, RadioMemoryMapUiField>;
}

export interface SettingsMemoryTableCell {
  kind: 'memoryTable';
  key: string;
  menuNumber: number;
  code?: string;
  /** Cell label (`163 DTMF Memory`). */
  label: string;
  columns: SettingsMemoryTableColumn[];
  channelIndices: number[];
  help?: SettingsFieldHelp;
}

function isTextWidget(field: RadioMemoryMapUiField): boolean {
  return field.ui.widget === 'text';
}

function columnKey(field: RadioMemoryMapUiField): string {
  return `${field.structId}.${field.fieldId}`;
}

function menuCode(field: RadioMemoryMapUiField): string | undefined {
  const code = field.ui.menu?.code;

  if (typeof code !== 'string') {
    return undefined;
  }

  const trimmed = code.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function groupLabel(menuNumber: number, code: string | undefined): string {
  return code === undefined ? String(menuNumber) : `${menuNumber} ${code}`;
}

function columnHeader(field: RadioMemoryMapUiField): string {
  if (field.fieldId === 'name') {
    return 'Name';
  }

  if (field.fieldId === 'code') {
    return 'Code';
  }

  return recordFieldLabel(field);
}

function fieldDescription(field: RadioMemoryMapUiField): string {
  return field.ui.description?.trim() ?? '';
}

function tableHelp(fields: readonly RadioMemoryMapUiField[]): SettingsFieldHelp | undefined {
  const first = fields[0];

  if (!first) {
    return undefined;
  }

  const shared = fieldDescription(first);

  if (!fields.every((field) => fieldDescription(field) === shared)) {
    return undefined;
  }

  return settingsFieldHelp(first);
}

function fieldUiOrder(field: RadioMemoryMapUiField): number | undefined {
  const order = field.ui.order;

  if (typeof order !== 'number' || !Number.isFinite(order)) {
    return undefined;
  }

  return order;
}

function columnSortKey(column: SettingsMemoryTableColumn): number {
  const orders = [...column.fieldsByIndex.values()]
    .map((field) => fieldUiOrder(field))
    .filter((order): order is number => order !== undefined);

  return orders.length > 0 ? Math.min(...orders) : Number.POSITIVE_INFINITY;
}

function sortColumns(columns: SettingsMemoryTableColumn[]): SettingsMemoryTableColumn[] {
  const priority = (column: SettingsMemoryTableColumn): number => {
    const sample = column.fieldsByIndex.values().next().value;

    if (!sample) {
      return 2;
    }

    if (sample.fieldId === 'name') {
      return 0;
    }

    if (sample.fieldId === 'code') {
      return 1;
    }

    return 2;
  };

  return [...columns].sort((left, right) => {
    const leftPriority = priority(left);
    const rightPriority = priority(right);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftOrder = columnSortKey(left);
    const rightOrder = columnSortKey(right);

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.key.localeCompare(right.key);
  });
}

function expectedIndexSet(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function indexSetsEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Front-panel menus whose fields in this section fold into one channel table.
 */
export function findMemoryTableMenuNumbers(fields: readonly RadioMemoryMapUiField[]): Set<number> {
  const byMenu = new Map<number, RadioMemoryMapUiField[]>();

  for (const field of fields) {
    const menuNumber = settingsFieldMenuNumber(field);

    if (menuNumber === undefined) {
      continue;
    }

    const existing = byMenu.get(menuNumber);

    if (existing) {
      existing.push(field);
    } else {
      byMenu.set(menuNumber, [field]);
    }
  }

  const tables = new Set<number>();

  for (const [menuNumber, members] of byMenu) {
    if (members.length === 0) {
      continue;
    }

    const tableMembers = members.filter(
      (field) => isTextWidget(field) && field.arrayIndex !== undefined && field.arrayIndex >= 0,
    );

    if (tableMembers.length !== members.length || tableMembers.length < 4) {
      continue;
    }

    const columns = new Map<string, Map<number, RadioMemoryMapUiField>>();

    for (const field of tableMembers) {
      const key = columnKey(field);
      const index = field.arrayIndex!;
      const column = columns.get(key);

      if (column) {
        column.set(index, field);
      } else {
        columns.set(key, new Map([[index, field]]));
      }
    }

    if (columns.size < 2) {
      continue;
    }

    const indexLists = [...columns.values()].map((column) => [...column.keys()].sort((left, right) => left - right));
    const first = indexLists[0];

    if (!first || first.length < 2) {
      continue;
    }

    const expected = expectedIndexSet(first.length);

    if (!indexLists.every((indices) => indexSetsEqual(indices, expected))) {
      continue;
    }

    tables.add(menuNumber);
  }

  return tables;
}

export function isMemoryTableMenu(fields: readonly RadioMemoryMapUiField[], menuNumber: number): boolean {
  return findMemoryTableMenuNumbers(fields).has(menuNumber);
}

export function buildMemoryTableCell(menuNumber: number, fields: readonly RadioMemoryMapUiField[]): SettingsMemoryTableCell {
  const members = fields.filter((field) => settingsFieldMenuNumber(field) === menuNumber);
  const columnsByKey = new Map<string, Map<number, RadioMemoryMapUiField>>();

  for (const field of members) {
    const key = columnKey(field);
    const index = field.arrayIndex ?? 0;
    const column = columnsByKey.get(key);

    if (column) {
      column.set(index, field);
    } else {
      columnsByKey.set(key, new Map([[index, field]]));
    }
  }

  const built = sortColumns(
    [...columnsByKey.entries()].map(([key, fieldsByIndex]) => {
      const sample = fieldsByIndex.values().next().value!;

      return {
        key,
        header: columnHeader(sample),
        fieldsByIndex,
      };
    }),
  );

  const channelIndices = [...(built[0]?.fieldsByIndex.keys() ?? [])].sort((left, right) => left - right);
  const code = members.map((field) => menuCode(field)).find((entry) => entry !== undefined);

  return {
    kind: 'memoryTable',
    key: `memory-table-${menuNumber}`,
    menuNumber,
    code,
    label: groupLabel(menuNumber, code),
    columns: built,
    channelIndices,
    help: tableHelp(members),
  };
}

export function memoryTableFieldAt(
  cell: SettingsMemoryTableCell,
  channelIndex: number,
  column: SettingsMemoryTableColumn,
): RadioMemoryMapUiField | undefined {
  return column.fieldsByIndex.get(channelIndex);
}

/** Write-review row label for a field that belongs to a folded memory table. */
export function memoryTableReviewLabel(fields: readonly RadioMemoryMapUiField[], field: RadioMemoryMapUiField): string | undefined {
  const menuNumber = settingsFieldMenuNumber(field);

  if (menuNumber === undefined || field.arrayIndex === undefined) {
    return undefined;
  }

  if (!isMemoryTableMenu(fields, menuNumber)) {
    return undefined;
  }

  return `Ch ${field.arrayIndex} · ${columnHeader(field)}`;
}