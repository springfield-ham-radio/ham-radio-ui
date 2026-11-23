import { computed, type WritableComputedRef } from 'vue';

type ToggleGroupValue = string | number | bigint | Record<string, unknown> | boolean | null | undefined;

export function commitRequiredToggleGroupValue<T extends string>(
  value: ToggleGroupValue,
  commit: (next: T) => void,
): void {
  if (value === null || value === undefined || value === '') {
    return;
  }

  commit(String(value) as T);
}

export function requiredToggleGroupModel<T extends string>(
  get: () => T,
  set: (value: T) => void,
): WritableComputedRef<T> {
  return computed({
    get,
    set: (value: ToggleGroupValue) => commitRequiredToggleGroupValue(value, set),
  });
}