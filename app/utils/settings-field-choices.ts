import type { RadioMemoryMapStringChoice, RadioMemoryMapValueKind, RadioSettingValue } from '@springfield/ham-radio-api';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

export interface SettingsSelectItem {
  label: string;
  value: string;
}

/**
 * Valid `{ label, value }` options on an ascii or dtmf field.
 * `RadioMemoryMapStringChoice.value` is the stored character string.
 * Returns undefined when the field has no usable list, so enum selects stay on `values`.
 */
export function settingsStringChoices(value: RadioMemoryMapValueKind | undefined): RadioMemoryMapStringChoice[] | undefined {
  if (!value || (value.kind !== 'ascii' && value.kind !== 'dtmf')) {
    return undefined;
  }

  const raw = value.choices;

  if (!raw || raw.length === 0) {
    return undefined;
  }

  const choices: RadioMemoryMapStringChoice[] = [];
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
  choices: readonly RadioMemoryMapStringChoice[],
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
