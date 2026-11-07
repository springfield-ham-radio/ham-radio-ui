/**
 * Command-mode bytes for the TM-D710 built-in TNC.
 *
 * The A/E and G command lists say Ctrl+C returns from Converse to Command
 * mode, and Ctrl+C three times returns from Transparent. SENDPAC defaults to
 * carriage return ($0D), which sends a packet in Converse. These bytes are
 * Ctrl+C only.
 *
 * A bare Ctrl+C is not a KISS frame. The D710 manuals do not say what an
 * already-KISS TNC does with it, and the TM-D700 sequence C0 FF C0 is not
 * sent. RESET is not sent.
 */

export const APRS_CTRL_C = 0x03;

/** One explicit request. Not repeated by a timer. */
export const APRS_COMMAND_INTERRUPT = Uint8Array.of(APRS_CTRL_C, APRS_CTRL_C, APRS_CTRL_C);

/** Sent only after a cmd: prompt that arrived on this connection. */
export const APRS_KISS_ON_COMMAND = 'KISS ON\r';

/** Sent only after a later cmd: prompt accepts KISS ON. */
export const APRS_RESTART_COMMAND = 'RESTART\r';

export const APRS_COMMAND_WAIT_MS = 5000;

const PROMPT = [0x63, 0x6d, 0x64, 0x3a]; // cmd:
const ERROR_REPLY = [0x3f, 0x45, 0x48]; // ?EH

function indexOfBytes(haystack: Uint8Array, needle: number[]): number {
  if (needle.length === 0 || haystack.length < needle.length) {
    return -1;
  }

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return start;
    }
  }

  return -1;
}

export function hasCommandPrompt(bytes: Uint8Array): boolean {
  return indexOfBytes(bytes, PROMPT) >= 0;
}

export function hasTncError(bytes: Uint8Array): boolean {
  return indexOfBytes(bytes, ERROR_REPLY) >= 0;
}

export function appendCommandBytes(previous: Uint8Array, chunk: Uint8Array, cap = 4096): Uint8Array {
  const combined = new Uint8Array(previous.length + chunk.length);
  combined.set(previous, 0);
  combined.set(chunk, previous.length);

  if (combined.length <= cap) {
    return combined;
  }

  return combined.subarray(combined.length - cap);
}
