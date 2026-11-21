import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';

/** One repeated record, such as APRS object 1 of 3. */
export interface SettingsRecordRef {
  id: string;
  index: number;
  label: string;
}

/**
 * `ui.record` when the driver marked this field as one entry in a repeated record.
 * Missing or incomplete records stay ordinary fields.
 */
export function fieldRecord(field: RadioMemoryMapUiField): SettingsRecordRef | undefined {
  const raw = (field.ui as { record?: unknown }).record;

  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const record = raw as { id?: unknown; index?: unknown; label?: unknown };

  if (typeof record.id !== 'string' || record.id.trim().length === 0) {
    return undefined;
  }

  if (typeof record.index !== 'number' || !Number.isFinite(record.index)) {
    return undefined;
  }

  const label = typeof record.label === 'string' ? record.label.trim() : '';

  return {
    id: record.id.trim(),
    index: record.index,
    label: label.length > 0 ? label : `Record ${record.index}`,
  };
}

/**
 * Label drawn inside a record tab.
 * Repeated structs arrive as "Name 1"; the tab already says "Object 1", so the suffix is dropped.
 * A driver label that does not end with the record index is kept.
 */
export function recordFieldLabel(field: RadioMemoryMapUiField): string {
  const record = fieldRecord(field);
  const label = field.ui.label;

  if (!record) {
    return label;
  }

  const suffix = ` ${record.index}`;

  if (label.endsWith(suffix)) {
    return label.slice(0, -suffix.length);
  }

  return label;
}
