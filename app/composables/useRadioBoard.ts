import {
  readRadioBoardSettings,
  reconcileOpenRadioIds,
  writeRadioBoardSettings,
  type RadioBoardLayout,
} from '~/utils/radio-board';

export interface RadioBoardCard {
  id: string;
  savedRadioId: string;
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
  const layout = useState<RadioBoardLayout>('radio-board-layout', () => 'stack');
  const focusedCardId = useState<string | undefined>('radio-board-focus', () => undefined);
  /** Card that Import or Write was opened for, so the dialog does not follow a later click. */
  const transferCardId = useState<string | undefined>('radio-transfer-card', () => undefined);
  const hydrated = useState('radio-board-hydrated', () => false);

  const openIds = computed(() => cards.value.map((card) => card.savedRadioId));

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
        return { id: card.id, savedRadioId: card.savedRadioId };
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
    closeCard,
    setLayout,
    setCatPort,
    beginTransfer,
    clearTransfer,
  };
}
