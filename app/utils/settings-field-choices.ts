import type { RadioMemoryMapValueKind, RadioSettingValue } from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

/**
 * Named option on a string memory-map field (`value.choices`).
 *
 * `@springfield/ham-radio-api` 18.3.0 (and current main) types `kind: "ascii"` as
 * `{ length, pad? }` only. `@springfield/ham-radio-utils` 4.16.1 marks that object
 * `additionalProperties: false`, so the published schema rejects `choices`.
 * Kenwood TH-D74 menu 501 sends `{ label, value }` here anyway. `value` is the
 * stored character string (Radio is `\Y`, RV is `/R`), not an enum index.
 */
export interface SettingsStringChoice {
  label: string;
  value: string;
}

const STRING_VALUE_KINDS = new Set(['ascii', 'dtmf']);

type ValueWithChoices = RadioMemoryMapValueKind & {
  choices?: unknown;
};

export interface SettingsSelectItem {
  label: string;
  value: string;
}

/**
 * Valid `{ label, value }` options on an ascii or dtmf field.
 * Returns undefined when the field has no usable list, so enum selects stay on `values`.
 */
export function settingsStringChoices(value: RadioMemoryMapValueKind | undefined): SettingsStringChoice[] | undefined {
  if (!value || !STRING_VALUE_KINDS.has(value.kind)) {
    return undefined;
  }

  const raw = (value as ValueWithChoices).choices;

  if (!Array.isArray(raw)) {
    return undefined;
  }

  const choices: SettingsStringChoice[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;

    if (typeof record.label !== 'string' || typeof record.value !== 'string') {
      continue;
    }

    const label = record.label.trim();

    if (label.length === 0 || seen.has(record.value)) {
      continue;
    }

    seen.add(record.value);
    choices.push({ label, value: record.value });
  }

  return choices.length > 0 ? choices : undefined;
}

export function fieldHasStringChoices(field: RadioMemoryMapUiField): boolean {
  return settingsStringChoices(field.value) !== undefined;
}

function storedText(current: RadioSettingValue | undefined): string | undefined {
  if (typeof current === 'string') {
    return current;
  }

  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }

  return undefined;
}

function selectItemValue(stored: string, emptyValue: string): string {
  return stored === '' ? emptyValue : stored;
}

/**
 * Select rows for a string field with `choices`.
 * A stored string that is not in the list is appended with that raw text as its label
 * so the control can show it and write the same characters back.
 */
export function stringChoiceSelectItems(
  choices: readonly SettingsStringChoice[],
  current: RadioSettingValue | undefined,
  emptyValue: string,
): SettingsSelectItem[] {
  const items = choices.map((choice) => ({
    label: choice.label,
    value: selectItemValue(choice.value, emptyValue),
  }));
  const currentText = storedText(current);

  if (currentText === undefined) {
    return items;
  }

  const currentItem = selectItemValue(currentText, emptyValue);

  if (items.some((item) => item.value === currentItem)) {
    return items;
  }

  items.push({
    label: currentText,
    value: currentItem,
  });

  return items;
}
