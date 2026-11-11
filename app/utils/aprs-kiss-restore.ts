/**
 * Host KISS enter and the documented way back.
 *
 * Kenwood's IDM enters KISS from PACKET12 by a carriage return, `KISS ON`,
 * and `RESTART`. The A/E command list says that while KISS is ON, switching
 * the radio off and then on causes the TNC to enter (or exit) KISS. The G
 * list uses `RESTART` for that sentence, and `RESTART` "functions as if
 * switched OFF then ON". Neither sentence says the result alternates, and
 * a power cycle is not a guaranteed exit. A startup banner is not proof of
 * PACKET mode. `RESTART` is command-mode text, so it is not available as
 * ASCII while the TNC is already inside KISS.
 *
 * The TM-D700 manual documents the bytes C0 FF C0. The D710 IDM says D700
 * PC commands are not compatible, so this fallback does not declare kissExit.
 *
 * Converse mode (`CONVERSE`, Ctrl+C back to command) has a documented exit,
 * but the TNC would own `MYCALL`, `UNPROTO`, and connected-mode `RETRY`.
 * APRS acks stay with the host, so the path remains KISS.
 */

/** Leading CR, then the two IDM lines. No `HB`, beacon, or callsign command. */
export const APRS_KISS_ENTER_TEXT = '\rKISS ON\rRESTART\r';

export const APRS_HOST_SETUP = [
  'Stations is the passive test. Leave the radio showing APRS for that test. This page is the host session and is not required for it.',
  'Connect listens for a few seconds. cmd: runs the enter steps. Monitor text with no cmd:, and a silent port, each write three Ctrl+C once and then wait for cmd:. That text is not proof of PACKET mode. SENDPAC defaults to carriage return, which sends a packet in Converse, so a carriage return is not sent to ask for a prompt.',
  'The enter steps write KISS ON only after cmd:, then RESTART only after another cmd:. They do not send a message, a beacon, HB, or RESET.',
  'A bare Ctrl+C is not a KISS frame. The D710 manuals do not say an already-KISS TNC answers it. This fallback does not send the TM-D700 bytes C0 FF C0.',
  'COM baud is menu 528 on A/E/S and menu 929 on G. HBAUD 1200 is the usual RF packet speed and is not that baud.',
] as const;

export const APRS_HOST_RECOVERY = [
  'HamBench does not power-cycle the radio.',
  'The IDM says STA and CON blink together 6 times while KISS is being entered. That blink is not a lamp that stays on. A steady STA means packets remain in the buffer. A steady CON means connected. Lights that are off do not prove the mode, and PACKET12 alone does not either.',
  'A/E command list, KISS: “When ON, switching the power OFF then ON causes the TNC to enter (or exit) KISS mode.” The parameter default is OFF. G command list, KISS: “When ON, entering a RESTART command causes the TNC to enter (or exit) KISS mode.” RESTART functions as power OFF then ON, and it is command text, so it is not available inside KISS. The stored parameter survives the switch. Neither sentence says the result alternates, and neither promises that a power cycle leaves KISS. A power cycle can show the startup banner. That banner is not a guaranteed exit and is not proof of PACKET mode. cmd: alone is not proof of PACKET mode. The A/E packet chapter says press [TNC] twice to enter PACKET. It does not say that key leaves KISS.',
  'HamBench does not send KISS OFF, a message, or Ctrl+C as a recovery guess. Cancel stops a message that is waiting. Disconnect closes the port.',
] as const;
