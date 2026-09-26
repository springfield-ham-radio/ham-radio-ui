export const RADIO_BOARD_STORAGE_KEY = 'ham-radio-board';

export type RadioBoardLayout = 'tabs' | 'tile';

/** A clone opened from Import, not stored under Preferences → Radios. */
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
}

export function defaultRadioBoardSettings(): RadioBoardSettings {
  return {
    layout: 'tabs',
    openIds: [],
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

    return { layout, openIds };
  } catch {
    return defaultRadioBoardSettings();
  }
}

export function serializeRadioBoardSettings(settings: RadioBoardSettings): string {
  return JSON.stringify({
    layout: settings.layout === 'tile' ? 'tile' : 'tabs',
    openIds: settings.openIds,
  });
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
