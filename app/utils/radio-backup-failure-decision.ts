export type BackupFailureChoice = 'skip' | 'abort';

const pendingByCard = new Map<string, (choice: BackupFailureChoice) => void>();

/**
 * Wait until the operator chooses on this card's progress overlay.
 * A second card can be waiting on its own choice at the same time.
 */
export function waitForBackupFailureDecision(cardId: string): Promise<BackupFailureChoice> {
  const previous = pendingByCard.get(cardId);

  return new Promise((resolve) => {
    const settle = (choice: BackupFailureChoice): void => {
      if (pendingByCard.get(cardId) === settle) {
        pendingByCard.delete(cardId);
      }

      resolve(choice);
    };

    pendingByCard.set(cardId, settle);

    if (previous) {
      previous('abort');
    }
  });
}

export function hasPendingBackupFailureDecision(cardId: string): boolean {
  return pendingByCard.has(cardId);
}

/** Resolve this card's backup-failure choice. Returns false when nothing was waiting. */
export function resolveBackupFailureDecision(cardId: string, choice: BackupFailureChoice): boolean {
  const settle = pendingByCard.get(cardId);

  if (!settle) {
    return false;
  }

  pendingByCard.delete(cardId);
  settle(choice);
  return true;
}

/** @internal Test helper */
export function resetBackupFailureDecisionForTests(): void {
  pendingByCard.clear();
}
