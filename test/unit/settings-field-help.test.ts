import { describe, expect, it } from 'vitest';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { settingsFieldHelp, settingsFieldLabel, settingsFieldMenuNumber } from '../../app/utils/settings-field-help.ts';

function field(partial: Partial<RadioMemoryMapUiField> & Pick<RadioMemoryMapUiField, 'ui'>): RadioMemoryMapUiField {
  return {
    path: 'settings.squelch',
    structId: 'settings',
    fieldId: 'squelch',
    ...partial,
  };
}

describe('settingsFieldHelp', () => {
  it('should include the menu number, description, and integer range', () => {
    const help = settingsFieldHelp(
      field({
        ui: {
          group: 'basic',
          label: 'Carrier Squelch Level',
          widget: 'integer',
          description: 'How strong a received signal must be before the speaker unmutes.',
          menu: { number: 0, code: 'SQL' },
        } as RadioMemoryMapUiField['ui'],
        value: { kind: 'integer', min: 0, max: 9 },
      }),
    );

    expect(help).toEqual({
      menuLabel: 'Menu 0 · SQL',
      description: 'How strong a received signal must be before the speaker unmutes.',
      constraint: 'Range 0–9',
      ariaLabel:
        'Menu 0 · SQL. How strong a received signal must be before the speaker unmutes. Range 0–9',
    });
  });

  it('should list short enum choices and skip long lists', () => {
    const save = settingsFieldHelp(
      field({
        ui: {
          group: 'basic',
          label: 'Battery Saver',
          widget: 'select',
          description: 'Sleep ratio.',
        },
        value: { kind: 'enum', values: ['Off', '1:1', '1:2', '1:3', '1:4'] },
      }),
    );

    expect(save?.constraint).toBe('Choices: Off, 1:1, 1:2, 1:3, 1:4');

    const timeout = settingsFieldHelp(
      field({
        ui: {
          group: 'basic',
          label: 'Timeout Timer',
          widget: 'select',
          description: 'Maximum transmit time.',
        },
        value: { kind: 'enum', values: Array.from({ length: 9 }, (_, index) => `${index} sec`) },
      }),
    );

    expect(timeout?.constraint).toBeUndefined();
  });

  it('should stay hidden when a field has no description and no menu', () => {
    const help = settingsFieldHelp(
      field({
        ui: { group: 'basic', label: 'Beep', widget: 'switch' },
        value: { kind: 'boolean' },
      }),
    );

    expect(help).toBeUndefined();
  });
});

describe('settingsFieldLabel', () => {
  it('should leave labels unchanged when menu numbers are hidden', () => {
    const labeled = field({
      ui: {
        group: 'aprs',
        label: 'My Callsign',
        widget: 'text',
        menu: { number: 500, code: 'My Callsign' },
      } as RadioMemoryMapUiField['ui'],
    });

    expect(settingsFieldMenuNumber(labeled)).toBe(500);
    expect(settingsFieldLabel(labeled, false)).toBe('My Callsign');
  });

  it('should prefix the menu number when the preference is on', () => {
    const labeled = field({
      ui: {
        group: 'aprs',
        label: 'My Callsign',
        widget: 'text',
        menu: { number: 500, code: 'My Callsign' },
      } as RadioMemoryMapUiField['ui'],
    });

    expect(settingsFieldLabel(labeled, true)).toBe('500 My Callsign');
  });

  it('should keep the label when a field has no menu number', () => {
    const labeled = field({
      ui: { group: 'basic', label: 'Beep', widget: 'switch' },
    });

    expect(settingsFieldMenuNumber(labeled)).toBeUndefined();
    expect(settingsFieldLabel(labeled, true)).toBe('Beep');
  });

  it('should ignore a menu number that is not a whole number of 0 or more', () => {
    const negative = field({
      ui: {
        group: 'basic',
        label: 'Squelch',
        widget: 'integer',
        menu: { number: -1 },
      } as RadioMemoryMapUiField['ui'],
    });
    const fractional = field({
      ui: {
        group: 'basic',
        label: 'Squelch',
        widget: 'integer',
        menu: { number: 1.5 },
      } as RadioMemoryMapUiField['ui'],
    });

    expect(settingsFieldLabel(negative, true)).toBe('Squelch');
    expect(settingsFieldLabel(fractional, true)).toBe('Squelch');
    expect(
      settingsFieldLabel(
        field({
          ui: { group: 'basic', label: 'SQL', widget: 'integer', menu: { number: 0, code: 'SQL' } } as RadioMemoryMapUiField['ui'],
        }),
        true,
      ),
    ).toBe('0 SQL');
  });
});
