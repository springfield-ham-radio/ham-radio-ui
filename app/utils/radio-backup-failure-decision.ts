export type BackupFailureChoice = 'skip' | 'abort';

let pendingSettle: ((choice: BackupFailureChoice) => void) | undefined;

/** Wait until the operator chooses on the shared progress dialog. */
export function waitForBackupFailureDecision(): Promise<BackupFailureChoice> {
  return new Promise((resolve) => {
    pendingSettle = (choice) => {
      pendingSettle = undefined;
      resolve(choice);
    };
  });
}

export function hasPendingBackupFailureDecision(): boolean {
  return pendingSettle !== undefined;
}

/** Resolve the pending backup-failure choice. Returns false when nothing was waiting. */
export function resolveBackupFailureDecision(choice: BackupFailureChoice): boolean {
  const settle = pendingSettle;

  if (!settle) {
    return false;
  }

  pendingSettle = undefined;
  settle(choice);
  return true;
}

/** @internal Test helper */
export function resetBackupFailureDecisionForTests(): void {
  pendingSettle = undefined;
}
