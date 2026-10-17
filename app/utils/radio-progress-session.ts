import type { BackupFailureChoice } from '~/utils/radio-backup-failure-decision';
import type { CapturedSerialLogSnapshot } from '~/utils/serial-log-session';
import { serialLogForProgressSave } from '~/utils/serial-log-session';

/**
 * When the progress modal closes while a backup-failure choice is pending, treat it as cancel.
 */
export function settleBackupFailureOnProgressClose(
  hasPendingDecision: boolean,
  settle: (choice: BackupFailureChoice) => void,
): boolean {
  if (!hasPendingDecision) {
    return false;
  }

  settle('abort');
  return true;
}

/** Session that owns the serial log shown on the progress dialog (pinned for the whole transfer). */
export function progressTransferSessionId(
  pinnedTransferCardId: string | undefined,
  actingCardId: string | undefined,
): string | undefined {
  return pinnedTransferCardId ?? actingCardId;
}

export function readProgressSerialLog(
  sessions: Record<string, { serialLog?: CapturedSerialLogSnapshot }>,
  pinnedTransferCardId: string | undefined,
  actingCardId: string | undefined,
  progressError: string | null,
  progressKind: 'import' | 'write' | 'backup',
): CapturedSerialLogSnapshot | undefined {
  const sessionId = progressTransferSessionId(pinnedTransferCardId, actingCardId);
  const log = sessionId ? sessions[sessionId]?.serialLog : undefined;

  if (!log || !progressError) {
    return log;
  }

  return serialLogForProgressSave(log, progressKind);
}
