import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { settingsFieldHelp, settingsFieldMenuNumber, type SettingsFieldHelp } from './settings-field-help';
import {
  buildMemoryTableCell,
  findMemoryTableMenuNumbers,
  type SettingsMemoryTableCell,
} from './settings-memory-table';

/**
 * One front-panel menu drawn as a single settings cell.
 * The checkboxes are the boolean switches that share `ui.menu.number`.
 */
export interface SettingsSwitchGroup {
  menuNumber: number;
  code?: string;
  /** Cell label, menu number plus `ui.menu.code` (`509 APRS Lock`). */
  label: string;
  /** Boolean switches sorted by `ui.order`. */
  fields: RadioMemoryMapUiField[];
  /**
   * Help for the cell when every switch describes the same thing.
   * Absent when the switches have different descriptions; those stay on each checkbox.
   */
  help?: SettingsFieldHelp;
}

/** One grid cell: an ordinary setting, or a menu of boolean switches. */
export type SettingsFieldCell =
  | { kind: 'field'; key: string; field: RadioMemoryMapUiField }
  | { kind: 'switches'; key: string; group: SettingsSwitchGroup };

function fieldUiOrder(field: RadioMemoryMapUiField): number | undefined {
  const order = field.ui.order;

  if (typeof order !== 'number' || !Number.isFinite(order)) {
    return undefined;
  }

  return order;
}

function sortByUiOrder(fields: readonly RadioMemoryMapUiField[]): RadioMemoryMapUiField[] {
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

function isBooleanSwitch(field: RadioMemoryMapUiField): boolean {
  return field.ui.widget === 'switch' && (field.value === undefined || field.value.kind === 'boolean');
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

function fieldDescription(field: RadioMemoryMapUiField): string {
  return field.ui.description?.trim() ?? '';
}

/**
 * Help shown on the group cell when every switch has the same description.
 * Different descriptions return undefined so each checkbox keeps its own help.
 */
function switchGroupHelp(fields: readonly RadioMemoryMapUiField[]): SettingsFieldHelp | undefined {
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

/**
 * Help for one checkbox inside a group.
 * Omitted when the group already shows that help, and when the checkbox has no description of its own.
 */
export function settingsSwitchCheckboxHelp(
  field: RadioMemoryMapUiField,
  group: SettingsSwitchGroup,
): SettingsFieldHelp | undefined {
  if (group.help || fieldDescription(field).length === 0) {
    return undefined;
  }

  return settingsFieldHelp(field);
}

function buildSwitchGroup(menuNumber: number, fields: readonly RadioMemoryMapUiField[]): SettingsSwitchGroup {
  const ordered = sortByUiOrder(fields);
  const code = fields.map((field) => menuCode(field)).find((entry) => entry !== undefined);

  return {
    menuNumber,
    code,
    label: groupLabel(menuNumber, code),
    fields: ordered,
    help: switchGroupHelp(ordered),
  };
}

/**
 * Lay out one settings section.
 *
 * Two or more boolean `switch` fields that share `ui.menu.number` become one cell,
 * emitted where that menu number already sits among the other settings (the first
 * field of the menu). Later bits of the same menu fold into that cell. Checkboxes
 * inside the cell follow `ui.order` even when the section itself does not.
 *
 * A menu that also has a text, select, or other non-boolean field stays as separate
 * cells. A single switch stays a single cell. Each checkbox still uses its own field path.
 */

export type SettingsPlainFieldCell = SettingsFieldCell | SettingsMemoryTableCell;

export function layoutSettingsFields(fields: readonly RadioMemoryMapUiField[]): SettingsFieldCell[] {
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

  const groupedMenus = new Set<number>();

  for (const [menuNumber, members] of byMenu) {
    if (members.length >= 2 && members.every(isBooleanSwitch)) {
      groupedMenus.add(menuNumber);
    }
  }

  const emitted = new Set<number>();
  const cells: SettingsFieldCell[] = [];

  for (const field of fields) {
    const menuNumber = settingsFieldMenuNumber(field);

    if (menuNumber !== undefined && groupedMenus.has(menuNumber)) {
      if (emitted.has(menuNumber)) {
        continue;
      }

      emitted.add(menuNumber);
      cells.push({
        kind: 'switches',
        key: `menu-${menuNumber}`,
        group: buildSwitchGroup(menuNumber, byMenu.get(menuNumber) ?? []),
      });
      continue;
    }

    cells.push({ kind: 'field', key: field.path, field });
  }

  return cells;
}

/**
 * Lay out plain settings fields, folding repeated text lists into channel tables
 * before boolean switch groups and ordinary fields.
 */
export function layoutPlainSettingsFields(fields: readonly RadioMemoryMapUiField[]): SettingsPlainFieldCell[] {
  const tableMenus = findMemoryTableMenuNumbers(fields);
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

  const switchMenus = new Set<number>();

  for (const [menuNumber, members] of byMenu) {
    if (tableMenus.has(menuNumber)) {
      continue;
    }

    if (members.length >= 2 && members.every(isBooleanSwitch)) {
      switchMenus.add(menuNumber);
    }
  }

  const emittedTables = new Set<number>();
  const emittedSwitches = new Set<number>();
  const cells: SettingsPlainFieldCell[] = [];

  for (const field of fields) {
    const menuNumber = settingsFieldMenuNumber(field);

    if (menuNumber !== undefined && tableMenus.has(menuNumber)) {
      if (emittedTables.has(menuNumber)) {
        continue;
      }

      emittedTables.add(menuNumber);
      cells.push(buildMemoryTableCell(menuNumber, fields));
      continue;
    }

    if (menuNumber !== undefined && switchMenus.has(menuNumber)) {
      if (emittedSwitches.has(menuNumber)) {
        continue;
      }

      emittedSwitches.add(menuNumber);
      cells.push({
        kind: 'switches',
        key: `menu-${menuNumber}`,
        group: buildSwitchGroup(menuNumber, byMenu.get(menuNumber) ?? []),
      });
      continue;
    }

    cells.push({ kind: 'field', key: field.path, field });
  }

  return cells;
}
