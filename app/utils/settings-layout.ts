import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { fieldComposite, type SettingsCoordinateAxis, type SettingsCoordinatePart } from './settings-coordinate';
import { fieldRecord } from './settings-record';
import { settingsFieldMenuNumber } from './settings-field-help';
import { layoutSettingsFields, type SettingsFieldCell } from './settings-switch-groups';

export interface SettingsCoordinateCell {
  kind: 'coordinate';
  key: string;
  id: string;
  label: string;
  axis: SettingsCoordinateAxis;
  fractionScale: number;
  menuNumber?: number;
  parts: { part: SettingsCoordinatePart; field: RadioMemoryMapUiField }[];
}

export interface SettingsRecordTab {
  index: number;
  label: string;
  cells: SettingsLayoutCell[];
}

export interface SettingsRecordCell {
  kind: 'records';
  key: string;
  id: string;
  tabs: SettingsRecordTab[];
}

/** One grid cell after record tabs, coordinate inputs, and switch groups are folded. */
export type SettingsLayoutCell = SettingsFieldCell | SettingsCoordinateCell | SettingsRecordCell;

function fieldUiOrder(field: RadioMemoryMapUiField): number | undefined {
  const order = field.ui.order;

  if (typeof order !== 'number' || !Number.isFinite(order)) {
    return undefined;
  }

  return order;
}

function layoutPlain(fields: readonly RadioMemoryMapUiField[]): Array<SettingsFieldCell | SettingsCoordinateCell> {
  const groups = new Map<string, { firstIndex: number; fields: RadioMemoryMapUiField[] }>();

  fields.forEach((field, index) => {
    const composite = fieldComposite(field);

    if (!composite) {
      return;
    }

    const existing = groups.get(composite.id);

    if (existing) {
      existing.fields.push(field);
    } else {
      groups.set(composite.id, { firstIndex: index, fields: [field] });
    }
  });

  const cellByFirst = new Map<number, SettingsCoordinateCell>();
  const consumed = new Set<string>();

  for (const group of groups.values()) {
    const first = fieldComposite(group.fields[0]);

    if (!first) {
      continue;
    }

    const seen = new Set<SettingsCoordinatePart>();
    const parts: SettingsCoordinateCell['parts'] = [];

    for (const field of group.fields) {
      consumed.add(field.path);
      const composite = fieldComposite(field);

      if (!composite || seen.has(composite.part)) {
        continue;
      }

      seen.add(composite.part);
      parts.push({ part: composite.part, field });
    }

    const menuNumber = parts.map((part) => settingsFieldMenuNumber(part.field)).find((number) => number !== undefined);

    cellByFirst.set(group.firstIndex, {
      kind: 'coordinate',
      key: `coordinate:${first.id}:${group.fields[0].path}`,
      id: first.id,
      label: first.label,
      axis: first.axis,
      fractionScale: first.fractionScale,
      ...(menuNumber === undefined ? {} : { menuNumber }),
      parts,
    });
  }

  const cells: Array<SettingsFieldCell | SettingsCoordinateCell> = [];
  let plain: RadioMemoryMapUiField[] = [];

  function flush(): void {
    if (plain.length === 0) {
      return;
    }

    cells.push(...layoutSettingsFields(plain));
    plain = [];
  }

  fields.forEach((field, index) => {
    const coordinate = cellByFirst.get(index);

    if (coordinate) {
      flush();
      cells.push(coordinate);
      return;
    }

    if (consumed.has(field.path)) {
      return;
    }

    plain.push(field);
  });

  flush();
  return cells;
}

function buildRecordCell(id: string, fields: readonly RadioMemoryMapUiField[]): SettingsRecordCell {
  const byIndex = new Map<number, { label: string; entries: { field: RadioMemoryMapUiField; index: number }[] }>();

  fields.forEach((field, index) => {
    const record = fieldRecord(field);

    if (!record) {
      return;
    }

    const tab = byIndex.get(record.index);

    if (tab) {
      tab.entries.push({ field, index });
    } else {
      byIndex.set(record.index, { label: record.label, entries: [{ field, index }] });
    }
  });

  const tabs = [...byIndex.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([index, tab]) => {
      const sorted = [...tab.entries]
        .sort((left, right) => {
          const leftOrder = fieldUiOrder(left.field) ?? Number.POSITIVE_INFINITY;
          const rightOrder = fieldUiOrder(right.field) ?? Number.POSITIVE_INFINITY;

          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }

          return left.index - right.index;
        })
        .map((entry) => entry.field);

      return {
        index,
        label: tab.label,
        cells: layoutPlain(sorted),
      };
    });

  return {
    kind: 'records',
    key: `record:${id}:${fields[0]?.path ?? id}`,
    id,
    tabs,
  };
}

/**
 * Lay out one settings section or subgroup.
 *
 * Fields that share `ui.record.id` become one tabbed block at the first field.
 * Tabs follow `ui.record.index`. Inside a tab, fields follow `ui.order`, then
 * memory-map order. Fields that share `ui.composite.id` become one coordinate
 * input at the first part. Boolean switches that share a menu number still fold
 * into one cell. Fields without those keys stay in memory-map order.
 */
export function layoutSettingsSection(fields: readonly RadioMemoryMapUiField[]): SettingsLayoutCell[] {
  const byRecord = new Map<string, RadioMemoryMapUiField[]>();

  for (const field of fields) {
    const record = fieldRecord(field);

    if (!record) {
      continue;
    }

    const existing = byRecord.get(record.id);

    if (existing) {
      existing.push(field);
    } else {
      byRecord.set(record.id, [field]);
    }
  }

  const emitted = new Set<string>();
  const cells: SettingsLayoutCell[] = [];
  let plain: RadioMemoryMapUiField[] = [];

  function flush(): void {
    if (plain.length === 0) {
      return;
    }

    cells.push(...layoutPlain(plain));
    plain = [];
  }

  for (const field of fields) {
    const record = fieldRecord(field);

    if (!record) {
      plain.push(field);
      continue;
    }

    if (emitted.has(record.id)) {
      continue;
    }

    emitted.add(record.id);
    flush();
    cells.push(buildRecordCell(record.id, byRecord.get(record.id) ?? []));
  }

  flush();
  return cells;
}

/** Setting paths drawn by one cell, including every record tab and coordinate part. */
export function layoutCellPaths(cell: SettingsLayoutCell): string[] {
  if (cell.kind === 'field') {
    return [cell.field.path];
  }

  if (cell.kind === 'switches') {
    return cell.group.fields.map((field) => field.path);
  }

  if (cell.kind === 'coordinate') {
    return cell.parts.map((part) => part.field.path);
  }

  return cell.tabs.flatMap((tab) => tab.cells.flatMap((entry) => layoutCellPaths(entry)));
}
