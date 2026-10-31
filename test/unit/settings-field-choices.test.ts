import { describe, expect, it } from 'vitest';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import {
  fieldHasStringChoices,
  settingsStringChoices,
  stringChoiceSelectItems,
} from '../../app/utils/settings-field-choices.ts';

const EMPTY = '__empty__';

function asciiField(
  choices: unknown,
  extra?: Partial<RadioMemoryMapUiField>,
): RadioMemoryMapUiField {
  return {
    path: 'aprs.symbol',
    structId: 'aprs',
    fieldId: 'symbol',
    ui: {
      group: 'aprs',
      label: 'Icon',
      widget: 'select',
    },
    value: {
      kind: 'ascii',
      length: 2,
      pad: 0,
      choices,
    } as RadioMemoryMapUiField['value'],
    ...extra,
  };
}

const iconChoices = [
  { label: 'Radio', value: '\\Y' },
  { label: 'RV', value: '/R' },
  { label: '  ', value: '/x' },
  { label: 'Car', value: '/>' },
  { label: 'Duplicate', value: '\\Y' },
  { label: 'Skipped', value: 1 },
];

describe('settingsStringChoices', () => {
  it('should read label and stored characters from an ascii field', () => {
    expect(settingsStringChoices(asciiField(iconChoices).value)).toEqual([
      { label: 'Radio', value: '\\Y' },
      { label: 'RV', value: '/R' },
      { label: 'Car', value: '/>' },
    ]);
    expect(fieldHasStringChoices(asciiField(iconChoices))).toBe(true);
  });

  it('should ignore choices on enum fields and empty lists', () => {
    expect(
      settingsStringChoices({
        kind: 'enum',
        values: ['Off', 'On'],
        choices: [{ label: 'Radio', value: '\\Y' }],
      } as RadioMemoryMapUiField['value']),
    ).toBeUndefined();
    expect(settingsStringChoices(asciiField([]).value)).toBeUndefined();
    expect(fieldHasStringChoices(asciiField(undefined))).toBe(false);
  });
});

describe('stringChoiceSelectItems', () => {
  const choices = settingsStringChoices(asciiField(iconChoices).value) ?? [];

  it('should show the manual name and keep the stored symbol', () => {
    const items = stringChoiceSelectItems(choices, '\\Y', EMPTY);

    expect(items).toEqual([
      { label: 'Radio', value: '\\Y' },
      { label: 'RV', value: '/R' },
      { label: 'Car', value: '/>' },
    ]);
    expect(items.find((item) => item.label === 'RV')?.value).toBe('/R');
  });

  it('should append an unknown stored value as raw text', () => {
    const items = stringChoiceSelectItems(choices, '??', EMPTY);

    expect(items.at(-1)).toEqual({ label: '??', value: '??' });
    expect(items.filter((item) => item.value === '??')).toHaveLength(1);
  });

  it('should keep an empty unknown value distinct from named options', () => {
    const items = stringChoiceSelectItems(choices, '', EMPTY);

    expect(items.at(-1)).toEqual({ label: '', value: EMPTY });
    expect(items.some((item) => item.value === '/R')).toBe(true);
  });

  it('should not add a second row when the stored value is already a choice', () => {
    const items = stringChoiceSelectItems(choices, '/R', EMPTY);

    expect(items.filter((item) => item.value === '/R')).toEqual([{ label: 'RV', value: '/R' }]);
  });
});
