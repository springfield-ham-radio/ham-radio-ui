import { describe, expect, it } from 'vitest';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { settingsFieldHelp } from '../../app/utils/settings-field-help.ts';

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
