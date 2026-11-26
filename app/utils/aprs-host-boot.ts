/**
 * TNC startup text on a Kenwood command-mode port. Host KISS entry must not
 * treat a cmd: inside this script as permission to send RESTART.
 */

export const APRS_HOST_BOOT_QUIET_MS = 400;

const SETUP_LINE = /(?:^|\r?\n)(?:cmd:)?(?:DA |HB |HBAUD|KWXIMON|UNPROTO)/u;

export function textShowsTncBoot(text: string): boolean {
  if (text.includes('Kenwood Radio Modem')) {
    return true;
  }

  if (/HBAUD\s+was\b/u.test(text) || /:HBAUD\b/u.test(text)) {
    return true;
  }

  return SETUP_LINE.test(text);
}

/**
 * A prompt at the end of the buffer, not followed by another command on the
 * same line (for example cmd:HB or cmd:UNPROTO).
 */
export function endsWithBareCommandPrompt(bytes: Uint8Array, prompt: string): boolean {
  if (prompt.length === 0 || bytes.length === 0) {
    return false;
  }

  const text = new TextDecoder().decode(bytes);
  const idx = text.lastIndexOf(prompt);

  if (idx < 0) {
    return false;
  }

  const after = text.slice(idx + prompt.length);
  return /^[\r\n\s]*$/u.test(after);
}