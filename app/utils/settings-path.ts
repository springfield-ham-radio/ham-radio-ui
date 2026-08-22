import type { RadioSettingValue } from '@springfield/ham-radio-api';

/**
 * Read a nested setting by dot path (e.g. settings.squelch or pttid.0.code).
 */
export function getSettingAtPath(root: Record<string, RadioSettingValue>, path: string): RadioSettingValue | undefined {
  const parts = path.split('.');
  let current: RadioSettingValue | undefined = root;

  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      current = current[index];
    } else {
      current = (current as Record<string, RadioSettingValue>)[part];
    }
  }

  return current;
}

/**
 * Write a nested setting by dot path, creating intermediate objects/arrays as needed.
 */
export function setSettingAtPath(
  root: Record<string, RadioSettingValue>,
  path: string,
  value: RadioSettingValue,
): Record<string, RadioSettingValue> {
  const parts = path.split('.');
  const clone = structuredClone(root) as Record<string, RadioSettingValue>;
  let current: RadioSettingValue = clone;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    const nextIsIndex = /^\d+$/.test(nextPart);

    if (Array.isArray(current)) {
      const arrayIndex = Number.parseInt(part, 10);

      if (current[arrayIndex] === undefined || typeof current[arrayIndex] !== 'object') {
        current[arrayIndex] = nextIsIndex ? [] : {};
      }

      current = current[arrayIndex];
    } else {
      const record = current as Record<string, RadioSettingValue>;

      if (record[part] === undefined || typeof record[part] !== 'object') {
        record[part] = nextIsIndex ? [] : {};
      }

      current = record[part];
    }
  }

  const last = parts[parts.length - 1];

  if (Array.isArray(current)) {
    current[Number.parseInt(last, 10)] = value;
  } else {
    (current as Record<string, RadioSettingValue>)[last] = value;
  }

  return clone;
}
