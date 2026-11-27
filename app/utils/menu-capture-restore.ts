import type { RadioMemoryConfig } from '@springfield/ham-radio-api';
import {
  imagesMatchExceptMenuCaptureIgnore,
  type MenuCaptureIgnoreEntry,
  type MenuCaptureRestoreRecord,
  type MenuCaptureSessionState,
} from '~/utils/menu-capture';

export type MenuCaptureWizardPhase = 'intro' | 'baseline' | 'change' | 'more' | 'restore' | 'export';

/** Upper bound for menu-capture restore verification reads (wait + retries). */
export const MENU_CAPTURE_RESTORE_READ_DEADLINE_MS = 45_000;

/** Backoff between failed post-restore verification reads. */
export const MENU_CAPTURE_RESTORE_READ_BACKOFF_MS = [1_000, 2_000, 4_000] as const;

export type MenuCaptureRestoreReadResult =
  | { image: Uint8Array }
  | { error: string };

export function isRetryableMenuCaptureReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    const message = String(error).toLowerCase();
    return message.includes('timeout') || message.includes('broken pipe') || message.includes('disconnected');
  }

  const message = error.message.toLowerCase();

  if (isPortMissingMessage(message)) {
    return true;
  }

  return (
    message.includes('timeout waiting for response') ||
    message.includes('timed out') ||
    message.includes('broken pipe') ||
    message.includes('serial port disconnected') ||
    message.includes('reconnect') ||
    message.includes('could not open port') ||
    message.includes('enter programming mode')
  );
}

function isPortMissingMessage(message: string): boolean {
  return (
    message.includes('no such file or directory') ||
    message.includes('enoent') ||
    message.includes('system cannot find the file') ||
    message.includes('did not reappear')
  );
}

export function menuCaptureReadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function buildMenuCaptureRestoreRecord(input: {
  writtenAt?: string;
  writeFailed?: boolean;
  verifyImage?: Uint8Array;
  readError?: string;
  baseline: Uint8Array;
  ignore: readonly MenuCaptureIgnoreEntry[];
  memoryConfig?: RadioMemoryConfig;
}): MenuCaptureRestoreRecord {
  if (input.writeFailed) {
    return {
      ...(input.writtenAt ? { writtenAt: input.writtenAt } : {}),
      status: 'write-failed',
    };
  }

  if (input.readError || !input.verifyImage) {
    return {
      ...(input.writtenAt ? { writtenAt: input.writtenAt } : {}),
      status: 'read-failed',
      ...(input.readError ? { readError: input.readError } : {}),
    };
  }

  const verifiedAt = new Date().toISOString();
  const { matches } = imagesMatchExceptMenuCaptureIgnore(
    input.baseline,
    input.verifyImage,
    input.ignore,
    input.memoryConfig,
  );

  if (matches) {
    return {
      ...(input.writtenAt ? { writtenAt: input.writtenAt } : {}),
      verifiedAt,
      status: 'verified',
      matchesBaseline: true,
    };
  }

  return {
    ...(input.writtenAt ? { writtenAt: input.writtenAt } : {}),
    verifiedAt,
    status: 'mismatch',
    matchesBaseline: false,
  };
}

export function menuCaptureRestoreIsVerified(restore: MenuCaptureRestoreRecord | undefined): boolean {
  return restore?.status === 'verified' || restore?.matchesBaseline === true;
}

export function menuCaptureRestoreAllowsExport(session: MenuCaptureSessionState): boolean {
  return session.baselineByteLength > 0;
}

export function patchMenuCaptureSessionRestore(
  session: MenuCaptureSessionState,
  restore: MenuCaptureRestoreRecord,
): MenuCaptureSessionState {
  return {
    ...session,
    updatedAt: new Date().toISOString(),
    restore,
  };
}

/**
 * On load, pick the wizard step so failed restore is recoverable (Verify again, export, Discard).
 */
export function menuCaptureWizardResumePhase(session: MenuCaptureSessionState): MenuCaptureWizardPhase {
  if (session.completedAt) {
    return 'export';
  }

  if (!session.baselineByteLength) {
    return 'baseline';
  }

  if (menuCaptureRestoreIsVerified(session.restore)) {
    return 'export';
  }

  const status = session.restore?.status;

  if (status === 'read-failed' || status === 'mismatch' || status === 'write-failed') {
    return 'restore';
  }

  if (session.restore?.matchesBaseline === false && !status) {
    return 'restore';
  }

  if (session.steps.length > 0) {
    return 'more';
  }

  return 'change';
}

export interface RetryMenuCaptureRestoreReadOptions {
  deadlineMs?: number;
  backoffMs?: readonly number[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  shouldAbort?: () => boolean;
}

/**
 * Attempt a restore verification read with bounded backoff. Does not retry a successful image read.
 */
export async function retryMenuCaptureRestoreRead(
  readAttempt: (attemptIndex: number) => Promise<Uint8Array | undefined>,
  lastErrorFromRead: () => string | undefined,
  options: RetryMenuCaptureRestoreReadOptions & {
    beforeFirstRead?: () => Promise<void>;
  } = {},
): Promise<MenuCaptureRestoreReadResult> {
  const deadlineMs = options.deadlineMs ?? MENU_CAPTURE_RESTORE_READ_DEADLINE_MS;
  const backoff = options.backoffMs ?? MENU_CAPTURE_RESTORE_READ_BACKOFF_MS;
  const delay = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + deadlineMs;

  let attempt = 0;
  let lastError: string | undefined;

  if (options.beforeFirstRead) {
    try {
      await options.beforeFirstRead();
    } catch (cause) {
      return { error: menuCaptureReadErrorMessage(cause) };
    }
  }

  while (now() < deadline) {
    if (options.shouldAbort?.()) {
      return { error: lastError ?? 'Menu capture read canceled' };
    }

    try {
      const image = await readAttempt(attempt);

      if (image && image.length > 0) {
        return { image };
      }

      lastError = lastErrorFromRead() ?? 'Menu capture read returned no data';

      if (!isRetryableMenuCaptureReadError(new Error(lastError))) {
        return { error: lastError };
      }
    } catch (cause) {
      lastError = menuCaptureReadErrorMessage(cause);

      if (!isRetryableMenuCaptureReadError(cause)) {
        return { error: lastError };
      }
    }

    const backoffMs = backoff[Math.min(attempt, backoff.length - 1)] ?? backoff.at(-1)!;
    attempt += 1;

    if (now() + backoffMs >= deadline) {
      break;
    }

    await delay(backoffMs);
  }

  return { error: lastError ?? 'Menu capture verification read timed out' };
}