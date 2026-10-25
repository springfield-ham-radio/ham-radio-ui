export interface ShownFormFieldError {
  name?: string;
  message: string;
}

export interface ShownFormApi {
  getErrors: () => readonly ShownFormFieldError[];
  validate: (opts: { name: string[]; silent: true }) => Promise<unknown>;
}

/**
 * Re-check fields that were filled in code.
 * UForm only validates a select or input after its own change event, so a parent
 * assignment leaves the previous error in place. Skip this when nothing is shown yet.
 */
export async function revalidateShownFields(
  form: ShownFormApi | null,
  names: readonly string[],
): Promise<void> {
  if (!form || names.length === 0 || form.getErrors().length === 0) {
    return;
  }

  await form.validate({ name: [...names], silent: true });
}

/**
 * Same replacement UForm uses when `validate({ name })` returns: errors for those
 * names are dropped, then any that are still invalid are put back.
 */
export function shownFormErrorsAfterRevalidate(
  current: readonly ShownFormFieldError[],
  next: readonly ShownFormFieldError[],
  names: readonly string[],
): ShownFormFieldError[] {
  const targeted = new Set(names);

  return [
    ...current.filter((error) => !error.name || !targeted.has(error.name)),
    ...next.filter((error) => error.name !== undefined && targeted.has(error.name)),
  ];
}
