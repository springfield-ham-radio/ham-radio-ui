import {
  persistedBoardOpenIds,
  readRadioBoardSettings,
  reconcileOpenRadioIds,
  writeRadioBoardSettings,
  type GuestRadio,
  type RadioBoardLayout,
} from '~/utils/radio-board';

export interface RadioBoardCard {
  id: string;
  /** Preferences radio. Absent when this card is a guest clone. */
  savedRadioId?: string;
  /** Clone that was not added under Preferences. */
  guest?: GuestRadio;
  /** Serial port used the last time CAT connected for this card. */
  catPort?: string;
}

/**
 * Which saved radios are open on the Radio page, and how their cards are laid out.
 *
 * Memory for each card lives with `useRadio`. This store only tracks the board.
 */
export function useRadioBoard() {
  const cards = useState<RadioBoardCard[]>('radio-board-cards', () => []);
  const layout = useState<RadioBoardLayout>('radio-board-layout', () => 'tabs');
  const focusedCardId = useState<string | undefined>('radio-board-focus', () => undefined);
  /** Card that Import or Write was opened for, so the dialog does not follow a later click. */
  const transferCardId = useState<string | undefined>('radio-transfer-card', () => undefined);
  const hydrated = useState('radio-board-hydrated', () => false);

  const openIds = computed(() => persistedBoardOpenIds(cards.value));

  function persist(): void {
    writeRadioBoardSettings({
      layout: layout.value,
      openIds: openIds.value,
    });
  }

  /**
   * Restore layout and open cards once saved-radio ids are known.
   */
  function hydrate(validIds: readonly string[]): void {
    if (!import.meta.client || hydrated.value) {
      return;
    }

    const stored = readRadioBoardSettings();
    const open = reconcileOpenRadioIds(stored.openIds, validIds);
    layout.value = stored.layout;
    cards.value = open.map((id) => ({ id, savedRadioId: id }));
    focusedCardId.value = open[0];
    hydrated.value = true;
  }

  function cardById(id: string | undefined): RadioBoardCard | undefined {
    if (!id) {
      return undefined;
    }

    return cards.value.find((card) => card.id === id);
  }

  function focusCard(id: string): void {
    if (cards.value.some((card) => card.id === id)) {
      focusedCardId.value = id;
    }
  }

  function openCard(savedRadioId: string): void {
    const existing = cards.value.find((card) => card.savedRadioId === savedRadioId);

    if (existing) {
      focusedCardId.value = existing.id;
      return;
    }

    cards.value = [...cards.value, { id: savedRadioId, savedRadioId }];
    focusedCardId.value = savedRadioId;
    persist();
  }

  /**
   * Open a card for a clone that is not saved under Preferences.
   * The card lasts until it is closed or the app reloads.
   */
  function openGuestCard(guest: GuestRadio): string {
    const id = crypto.randomUUID();
    cards.value = [...cards.value, { id, guest }];
    focusedCardId.value = id;
    return id;
  }

  function closeCard(id: string): void {
    cards.value = cards.value.filter((card) => card.id !== id);

    if (focusedCardId.value === id) {
      focusedCardId.value = cards.value[0]?.id;
    }

    if (transferCardId.value === id) {
      transferCardId.value = undefined;
    }

    persist();
  }

  function setLayout(next: RadioBoardLayout): void {
    layout.value = next;
    persist();
  }

  function setCatPort(id: string, port: string | undefined): void {
    cards.value = cards.value.map((card) => {
      if (card.id !== id) {
        return card;
      }

      if (port === undefined) {
        const rest = { ...card };
        delete rest.catPort;
        return rest;
      }

      return { ...card, catPort: port };
    });
  }

  function beginTransfer(id: string | undefined): void {
    transferCardId.value = id;
  }

  function clearTransfer(): void {
    transferCardId.value = undefined;
  }

  return {
    cards,
    layout,
    focusedCardId,
    transferCardId,
    openIds,
    hydrate,
    cardById,
    focusCard,
    openCard,
    openGuestCard,
    closeCard,
    setLayout,
    setCatPort,
    beginTransfer,
    clearTransfer,
  };
}
