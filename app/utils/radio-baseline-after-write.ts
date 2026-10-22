import type { RadioProgram } from '@springfield/ham-radio-api';
import { cloneRadioProgram } from '~/utils/radio-memory-history';

/**
 * How a write attempt ended.
 *
 * `aborted` covers leaving the port picker or the review dialog, and stopping
 * because a pre-write backup could not be made. Those paths never reach the radio.
 */
export type WriteAttemptTerminal = 'success' | 'canceled' | 'failed' | 'aborted';

/** Session snapshot of the last image known to be on the radio. */
export interface RadioBaselineSnapshot {
  image?: Uint8Array;
  program?: RadioProgram;
}

export interface WriteAttemptBaselineInput {
  previous: RadioBaselineSnapshot;
  terminal: WriteAttemptTerminal;
  /** Image the editor tried to send. Ignored unless the write finished. */
  writtenImage?: Uint8Array;
  /** Program the editor tried to send. Ignored unless the write finished. */
  writtenProgram?: RadioProgram;
  /**
   * Image read so a pre-write backup file could be saved.
   * Kept on the input so a backup read cannot be stored as the session baseline.
   * It does not replace `previous` on any terminal, including success.
   */
  backupImage?: Uint8Array;
  /**
   * The operator canceled. Checked even when `terminal` is `success`, because
   * the driver can return after the progress dialog was already canceled.
   */
  canceled?: boolean;
}

export interface RadioBaselineDecision {
  /** True only when this attempt should replace `radioBaseline`. */
  commit: boolean;
  image?: Uint8Array;
  program?: RadioProgram;
}

/**
 * Baseline to keep after a write attempt.
 *
 * The previous snapshot stays in place for cancel, failure, and abort. A backup
 * image captured on the way to the write is never adopted. The editor image
 * replaces the baseline only after a write that finished and was not canceled.
 *
 * A write that stops partway can leave the radio different from this snapshot.
 * The next pre-write backup still reuses it. Dropping the snapshot made a
 * canceled write look like the edit was already on the radio.
 */
export function radioBaselineAfterWriteAttempt(input: WriteAttemptBaselineInput): RadioBaselineDecision {
  const preserve: RadioBaselineDecision = {
    commit: false,
    image: input.previous.image,
    program: input.previous.program,
  };

  if (input.canceled || input.terminal !== 'success') {
    return preserve;
  }

  if (!input.writtenImage || input.writtenImage.length === 0) {
    return preserve;
  }

  return {
    commit: true,
    image: input.writtenImage.slice(),
    program: input.writtenProgram ? cloneRadioProgram(input.writtenProgram) : undefined,
  };
}
