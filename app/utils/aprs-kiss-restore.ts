/**
 * Why this build does not write to the COM port for host KISS.
 *
 * Kenwood's IDM says a PC enters KISS from PACKET mode by sending `KISS ON`
 * and then `RESTART`. The G CD-ROM command list says that while KISS is ON,
 * a RESTART command enters or leaves KISS. The A/E command list says that
 * while KISS is ON, switching the radio off and on enters or leaves KISS.
 * Those commands are command-mode text. None of those Kenwood texts give a
 * host byte sequence that leaves KISS after the TNC is already in it.
 * A power cycle is not sent from here, and D700 init bytes are not copied.
 *
 * The PG-5G has TXD, RXD, and ground. RTS and DTR are not on that plug and
 * are not PTT. The TNC command list defaults XFLOW to ON, which is software
 * flow control. That handshake is not verified on this cable.
 */
export const APRS_HOST_TRANSMIT_BLOCKER =
  'Kenwood does not document a host byte sequence that leaves KISS once the TNC is already in it, and the PG-5G flow-control handshake is not verified. This build does not send KISS ON, RESTART, or any message frame.';

/** This build keeps the constant false. Tests pass true only on an in-memory port. */
export const APRS_HOST_HARDWARE_TRANSMIT = false;

export const APRS_HOST_SETUP = [
  'Press [TNC] until the display shows PACKET12. The monitor path is the APRS display plus menu 604 OUTPUT, and it does not accept a message from the computer.',
  'Match the COM baud to menu 528 on A/E/S or menu 929 on G/GA/GE/GS. That is the host serial rate.',
  'Menu 529 or 930 selects the packet-mode data band. HBAUD 1200 is the usual RF packet speed and is not the host baud.',
  'Menus 600–612 do not control the TNC during host KISS. The radio’s own station list, messages, and beacon are not promised to keep running, and HamBench does not erase them.',
  'Write down MYCALL, UNPROTO, KISS, XFLOW, and HBAUD before changing them on the radio. HamBench does not query or restore those settings.',
] as const;

export const APRS_HOST_RECOVERY = [
  'HamBench does not send KISS ON, KISS OFF, RESTART, HB, or a KISS return frame, and it does not power-cycle the radio.',
  'If you enter KISS yourself, return to command mode by the method in the Kenwood manual you are using, then press [TNC] until APRS is shown.',
  'Confirm menu 604 OUTPUT is still ON before using the monitor. Disconnect releases the serial port and does not write a closing command.',
] as const;
