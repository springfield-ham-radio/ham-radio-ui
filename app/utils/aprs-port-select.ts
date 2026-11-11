export interface AprsPortMenuItem {
  label: string;
  value: string;
}

/**
 * Menu rows for the APRS COM adapter.
 *
 * Every value is a non-empty port id. A blank row is not included: Reka UI
 * rejects a ComboboxItem whose value is `''`. Clearing the field is a separate
 * control. A saved port that is unplugged stays in the list. The same id as the
 * memory port is allowed, because one adapter can be moved between jacks.
 */
export function aprsSerialPortMenuItems(
  listed: readonly AprsPortMenuItem[],
  savedPort: string | undefined,
  savedItem?: AprsPortMenuItem,
): AprsPortMenuItem[] {
  const items: AprsPortMenuItem[] = [];
  const seen = new Set<string>();

  const push = (item: AprsPortMenuItem | undefined): void => {
    const value = item?.value.trim() ?? '';

    if (!item || value.length === 0 || seen.has(value)) {
      return;
    }

    seen.add(value);
    items.push({ label: item.label, value });
  };

  const saved = savedPort?.trim() ?? '';

  if (saved.length > 0 && !listed.some((item) => item.value.trim() === saved)) {
    push(savedItem ?? { label: `${saved} (saved, not connected)`, value: saved });
  }

  for (const item of listed) {
    push(item);
  }

  return items;
}
