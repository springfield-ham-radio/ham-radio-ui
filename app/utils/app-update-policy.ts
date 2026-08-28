export type UpdateCheckReason = 'startup' | 'interval' | 'manual';

export interface UpdateCheckDecisionInput {
  reason: UpdateCheckReason;
  autoUpdateEnabled: boolean;
  lastCheckAt: string | undefined;
  now: Date;
  intervalMs: number;
  inFlight: boolean;
  readyToRestart: boolean;
}

/**
 * Decide whether a startup, interval, or manual update check should run.
 *
 * Manual checks are allowed even when auto-update is off. Background checks
 * wait out the interval and never interrupt a download or a pending restart.
 */
export function shouldCheckForAppUpdate(input: UpdateCheckDecisionInput): boolean {
  if (input.inFlight || input.readyToRestart) {
    return false;
  }

  if (input.reason === 'manual') {
    return true;
  }

  if (!input.autoUpdateEnabled) {
    return false;
  }

  if (input.reason === 'startup') {
    return true;
  }

  if (!input.lastCheckAt) {
    return true;
  }

  const lastCheckMs = Date.parse(input.lastCheckAt);

  if (Number.isNaN(lastCheckMs)) {
    return true;
  }

  return input.now.getTime() - lastCheckMs >= input.intervalMs;
}

/**
 * Map downloaded bytes to a 0–100 percent, or 0 when the size is unknown.
 */
export function updateDownloadPercent(progress: { downloaded: number; contentLength: number }): number {
  if (progress.contentLength <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100));
}
