/**
 * Host KISS enter and the documented way back.
 *
 * Kenwood's IDM enters KISS from PACKET12 by a carriage return, `KISS ON`,
 * and `RESTART`. The TM-D710A/E command list says that while KISS is ON,
 * switching the radio off and then on enters or exits KISS. That is a toggle,
 * not a promise that one power cycle lands on APRS. The G CD-ROM describes
 * the same toggle as the `RESTART` command, which itself "functions as if
 * switched OFF then ON". `RESTART` is command-mode text, so it is not
 * available as ASCII while the TNC is already inside KISS.
 *
 * The TM-D700 manual documents the bytes C0 FF C0. The D710 IDM says D700
 * PC commands are not compatible, so those bytes are not sent and not
 * recommended here.
 *
 * Converse mode (`CONVERSE`, Ctrl+C back to command) has a documented exit,
 * but the TNC would own `MYCALL`, `UNPROTO`, and connected-mode `RETRY`.
 * APRS acks stay with the host, so the path remains KISS.
 */

/** Leading CR, then the two IDM lines. No `HB`, beacon, or callsign command. */
export const APRS_KISS_ENTER_TEXT = '\rKISS ON\rRESTART\r';

export const APRS_HOST_SETUP = [
  'Stations is the passive test. Leave the radio showing APRS for that test. This page is the host session and is not required for it.',
  'Host KISS starts from PACKET12, which you select on the radio. HamBench does not switch the radio until you press Enter host KISS.',
  'Enter host KISS sends only a carriage return, KISS ON, and RESTART. It does not send a message, a beacon, or HB.',
  'COM baud is menu 528 on A/E/S and menu 929 on G. HBAUD 1200 is the usual RF packet speed and is not that baud. Menu 529 or 930 is the packet band.',
  'While the TNC is in host KISS, menus 600–612 do not control it. The radio’s station list and beacon are not promised to keep running, and HamBench does not erase them.',
] as const;

export const APRS_HOST_RECOVERY = [
  'HamBench does not power-cycle the radio and does not send the TM-D700 bytes C0 FF C0.',
  'On a TM-D710A/E, with the KISS parameter ON, the manual says power OFF then ON enters or exits KISS. Read the display. If STA and CON blink together, it entered KISS; power OFF then ON once more.',
  'When a command prompt is back, press [TNC] until the display shows APRS. Confirm menu 604 OUTPUT is ON before using Stations. The G manual names RESTART for that toggle once command mode is available.',
] as const;
