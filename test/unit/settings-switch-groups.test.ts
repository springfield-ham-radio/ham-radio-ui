import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RadioMemoryMap, RadioMemoryMapField, RadioSettings } from '@springfield/ham-radio-api';
import { collectMemoryMapUiGroups } from '../../app/utils/settings-groups.ts';
import { setSettingAtPath } from '../../app/utils/settings-path.ts';
import {
  layoutSettingsFields,
  settingsSwitchCheckboxHelp,
  type SettingsFieldCell,
} from '../../app/utils/settings-switch-groups.ts';

/**
 * Kenwood TH-D74 settings memory map from radio-module-kenwood
 * branch cursor/th-d74-aprs-505-509-8d50 (PR 52). Channel record structs are omitted;
 * they are not radio-wide settings. The APRS group's `i-lucide-notebook-pen` icon is
 * omitted because HamBench does not bundle it; section grouping does not use it.
 */
const thD74Settings = JSON.parse(
  readFileSync(new URL('../fixtures/kenwood/th-d74-settings.json', import.meta.url), 'utf8'),
) as RadioMemoryMap;

function aprsCells(): SettingsFieldCell[] {
  const aprs = collectMemoryMapUiGroups(thD74Settings).find((group) => group.label === 'APRS');

  expect(aprs).toBeDefined();
  return layoutSettingsFields(aprs?.fields ?? []);
}

function cellMenu(cell: SettingsFieldCell): number | undefined {
  return cell.kind === 'switches' ? cell.group.menuNumber : cell.field.ui.menu?.number;
}

function switchField(
  id: string,
  label: string,
  menuNumber: number,
  options: { order?: number; description?: string; widget?: 'switch' | 'text'; kind?: 'boolean' | 'ascii' } = {},
): RadioMemoryMapField {
  const widget = options.widget ?? 'switch';
  const kind = options.kind ?? 'boolean';

  return {
    id,
    type: widget === 'text' ? 'u8' : 'bits',
    width: widget === 'text' ? undefined : 1,
    value: kind === 'ascii' ? { kind: 'ascii', length: 6 } : { kind: 'boolean' },
    ui: {
      group: 'aprs',
      label,
      widget,
      menu: { number: menuNumber, code: 'Sample' },
      section: 'APRS',
      ...(options.order === undefined ? {} : { order: options.order }),
      ...(options.description === undefined ? {} : { description: options.description }),
    },
  } as RadioMemoryMapField;
}

describe('layoutSettingsFields', () => {
  it('should group TH-D74 menu 509 into one cell ordered by ui.order', () => {
    const cells = aprsCells();
    const lock = cells.find((cell) => cell.kind === 'switches' && cell.group.menuNumber === 509);

    expect(lock?.kind).toBe('switches');

    if (lock?.kind !== 'switches') {
      return;
    }

    expect(lock.group.label).toBe('509 APRS Lock');
    expect(lock.group.code).toBe('APRS Lock');
    expect(lock.group.fields.map((field) => field.ui.label)).toEqual(['Frequency', 'PTT', 'APRS Key']);
    expect(lock.group.fields.map((field) => field.path)).toEqual([
      'aprsLock.frequency',
      'aprsLock.ptt',
      'aprsLock.aprsKey',
    ]);
    expect(cells.filter((cell) => cellMenu(cell) === 509)).toHaveLength(1);

    const menus = cells.map((cell) => cellMenu(cell));
    const lockIndex = menus.indexOf(509);

    expect(menus[lockIndex - 1]).toBe(508);
    expect(menus[lockIndex + 1]).toBe(522);
  });

  it('should group TH-D74 menu 551 by ui.order and leave menu 500 as separate text fields', () => {
    const cells = aprsCells();
    const filter = cells.find((cell) => cell.kind === 'switches' && cell.group.menuNumber === 551);

    expect(filter?.kind).toBe('switches');

    if (filter?.kind !== 'switches') {
      return;
    }

    expect(filter.group.label).toBe('551 Filter Type');
    expect(filter.group.fields.map((field) => field.ui.label)).toEqual([
      'Weather',
      'Digipeater',
      'Mobile',
      'Object',
      'NAVITRA',
      '1-WAY',
      'Others',
    ]);
    expect(cells.filter((cell) => cellMenu(cell) === 551)).toHaveLength(1);

    const callsign = cells.filter((cell) => cellMenu(cell) === 500);

    expect(callsign).toHaveLength(2);
    expect(callsign.every((cell) => cell.kind === 'field')).toBe(true);
    expect(callsign.map((cell) => (cell.kind === 'field' ? cell.field.ui.label : ''))).toEqual([
      'My Callsign',
      'SSID',
    ]);
    expect(callsign.map((cell) => (cell.kind === 'field' ? cell.field.path : ''))).toEqual([
      'aprsMyCall.callsign',
      'aprsMyCall.ssid',
    ]);
  });

  it('should leave a single boolean switch as its own cell', () => {
    const cells = aprsCells();
    const shift = cells.find((cell) => cellMenu(cell) === 522);

    expect(shift?.kind).toBe('field');

    if (shift?.kind !== 'field') {
      return;
    }

    expect(shift.field.ui.widget).toBe('switch');
    expect(shift.field.ui.label).toBe('Shift/Offset');
    expect(shift.field.path).toBe('aprsShiftOffset.enabled');
  });

  it('should keep per-checkbox help when bit descriptions differ', () => {
    const cells = aprsCells();
    const lock = cells.find((cell) => cell.kind === 'switches' && cell.group.menuNumber === 509);

    expect(lock?.kind).toBe('switches');

    if (lock?.kind !== 'switches') {
      return;
    }

    expect(lock.group.help).toBeUndefined();

    const frequency = lock.group.fields[0];

    expect(frequency).toBeDefined();

    if (!frequency) {
      return;
    }

    expect(settingsSwitchCheckboxHelp(frequency, lock.group)?.description).toContain('Locks the APRS frequency');
    expect(settingsSwitchCheckboxHelp(frequency, lock.group)?.menuLabel).toBe('Menu 509 · APRS Lock');
  });

  it('should show one group help tooltip when every switch has the same description', () => {
    const map: RadioMemoryMap = {
      version: '1.0.0',
      structs: [
        {
          id: 'flags',
          seek: 0,
          fields: [
            switchField('a', 'A', 10, { order: 2, description: 'Shared lock.' }),
            switchField('b', 'B', 10, { order: 1, description: 'Shared lock.' }),
          ],
        },
      ],
    };
    const cells = layoutSettingsFields(collectMemoryMapUiGroups(map)[0]?.fields ?? []);
    const group = cells[0];

    expect(group?.kind).toBe('switches');

    if (group?.kind !== 'switches') {
      return;
    }

    expect(group.group.help?.description).toBe('Shared lock.');
    expect(group.group.help?.menuLabel).toBe('Menu 10 · Sample');
    const first = group.group.fields[0];

    expect(first).toBeDefined();

    if (!first) {
      return;
    }

    expect(settingsSwitchCheckboxHelp(first, group.group)).toBeUndefined();
  });

  it('should not group a menu that mixes switches with text fields', () => {
    const map: RadioMemoryMap = {
      version: '1.0.0',
      structs: [
        {
          id: 'aprsMyCall',
          seek: 0,
          fields: [
            switchField('callsign', 'My Callsign', 500, { widget: 'text', kind: 'ascii' }),
            switchField('ssid', 'SSID', 500, { widget: 'text', kind: 'ascii' }),
            switchField('frequency', 'Frequency', 509, { order: 1 }),
            switchField('note', 'Note', 509, { widget: 'text', kind: 'ascii' }),
          ],
        },
      ],
    };
    const cells = layoutSettingsFields(collectMemoryMapUiGroups(map)[0]?.fields ?? []);

    expect(cells.every((cell) => cell.kind === 'field')).toBe(true);
    expect(cells.map((cell) => (cell.kind === 'field' ? cell.field.ui.label : ''))).toEqual([
      'My Callsign',
      'SSID',
      'Frequency',
      'Note',
    ]);
  });

  it('should change only the toggled checkbox path', () => {
    const cells = aprsCells();
    const lock = cells.find((cell) => cell.kind === 'switches' && cell.group.menuNumber === 509);

    expect(lock?.kind).toBe('switches');

    if (lock?.kind !== 'switches') {
      return;
    }

    const frequency = lock.group.fields.find((field) => field.fieldId === 'frequency');

    expect(frequency?.path).toBe('aprsLock.frequency');

    if (!frequency) {
      return;
    }

    const settings: RadioSettings = {
      aprsLock: { frequency: false, ptt: true, aprsKey: false },
      aprsMyCall: { callsign: 'N0CALL', ssid: '-7' },
      aprsShiftOffset: { enabled: true },
    };
    const next = setSettingAtPath(settings, frequency.path, true);

    expect(next.aprsLock).toEqual({ frequency: true, ptt: true, aprsKey: false });
    expect(next.aprsMyCall).toEqual(settings.aprsMyCall);
    expect(next.aprsShiftOffset).toEqual(settings.aprsShiftOffset);
    expect(settings.aprsLock).toEqual({ frequency: false, ptt: true, aprsKey: false });
  });
});
