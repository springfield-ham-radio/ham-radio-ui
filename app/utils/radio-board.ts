export const RADIO_BOARD_STORAGE_KEY = 'ham-radio-board';

export type RadioBoardLayout = 'tabs' | 'tile';

/** A clone opened from Read from Radio, not stored under Preferences → Radios. */
export interface GuestRadio {
  name: string;
  manufacturer: string;
  model: string;
  baudRate?: number;
  serialPort: string;
}

export interface RadioBoardSettings {
  layout: RadioBoardLayout;
  /** Saved-radio ids currently shown as cards, in display order. */
  openIds: string[];
  /** Card id (saved-radio id or guest clone id) that was focused last on the Radio page. */
  focusedId?: string;
}

export function defaultRadioBoardSettings(): RadioBoardSettings {
  return {
    layout: 'tabs',
    openIds: [],
    focusedId: undefined,
  };
}

/**
 * Parse the radio-page layout and which radios are open.
 * Older saves used `stack` for the column layout; that is now tabs.
 */
export function parseRadioBoardSettings(raw: string | null): RadioBoardSettings {
  if (!raw) {
    return defaultRadioBoardSettings();
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultRadioBoardSettings();
    }

    const record = parsed as Record<string, unknown>;
    const layout: RadioBoardLayout = record.layout === 'tile' ? 'tile' : 'tabs';
    const openIds: string[] = [];
    const seen = new Set<string>();

    if (Array.isArray(record.openIds)) {
      for (const id of record.openIds) {
        if (typeof id !== 'string') {
          continue;
        }

        const trimmed = id.trim();

        if (trimmed.length === 0 || seen.has(trimmed)) {
          continue;
        }

        seen.add(trimmed);
        openIds.push(trimmed);
      }
    }

    const focusedId = typeof record.focusedId === 'string' ? record.focusedId.trim() : undefined;

    return {
      layout,
      openIds,
      focusedId: focusedId && focusedId.length > 0 ? focusedId : undefined,
    };
  } catch {
    return defaultRadioBoardSettings();
  }
}

export function serializeRadioBoardSettings(settings: RadioBoardSettings): string {
  const payload: Record<string, unknown> = {
    layout: settings.layout === 'tile' ? 'tile' : 'tabs',
    openIds: settings.openIds,
  };

  if (settings.focusedId) {
    payload.focusedId = settings.focusedId;
  }

  return JSON.stringify(payload);
}

export function readRadioBoardSettings(): RadioBoardSettings {
  if (!import.meta.client) {
    return defaultRadioBoardSettings();
  }

  try {
    return parseRadioBoardSettings(localStorage.getItem(RADIO_BOARD_STORAGE_KEY));
  } catch {
    return defaultRadioBoardSettings();
  }
}

export function writeRadioBoardSettings(settings: RadioBoardSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(RADIO_BOARD_STORAGE_KEY, serializeRadioBoardSettings(settings));
}

/**
 * Drop cards whose saved radio was deleted, preserving order.
 */
export function reconcileOpenRadioIds(openIds: readonly string[], validIds: readonly string[]): string[] {
  const valid = new Set(validIds);
  return openIds.filter((id) => valid.has(id));
}

/**
 * Saved-radio ids to keep on the board. Guest clones are session-only.
 */
export function persistedBoardOpenIds(cards: readonly { savedRadioId?: string }[]): string[] {
  return cards.flatMap((card) => (card.savedRadioId ? [card.savedRadioId] : []));
}

/**
 * Restore saved radios onto the board without dropping guest clones already open.
 * Guests are created before the Radio page mounts (for example the Add to radio dev fixture).
 */
export function hydratedBoardCards<T extends { id: string; guest?: unknown }>(
  existing: readonly T[],
  openSavedIds: readonly string[],
): Array<T | { id: string; savedRadioId: string }> {
  const guests = existing.filter((card) => card.guest !== undefined);
  const guestIds = new Set(guests.map((card) => card.id));
  const saved = openSavedIds
    .filter((id) => !guestIds.has(id))
    .map((id) => ({ id, savedRadioId: id }));

  return [...guests, ...saved];
}

/** Keep the focused card when it is still on the board after hydration. */
export function focusedCardAfterHydrate(focusedId: string | undefined, cards: readonly { id: string }[]): string | undefined {
  if (focusedId && cards.some((card) => card.id === focusedId)) {
    return focusedId;
  }

  return cards[0]?.id;
}
