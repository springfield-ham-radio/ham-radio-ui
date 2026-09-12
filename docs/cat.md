# CAT

The **CAT** page is live computer control for radios whose driver sets `capabilities.liveControl` and a Kenwood `cat` block. It is not a memory editor. Import and Write stay on the Radio page and refuse to run while a CAT session is connected.

Memory protocol is separate: TH-F6 programs memories with live CAT (`catRead` / `catWrite`); TM-D710A clones EEPROM and still speaks Kenwood CAT on the same PC port.

## Open the page

Use the **CAT** tab in the header, between Radio and Channels.

## Connect

1. Install a radio module that declares live control (Kenwood TH-F6, TM-D710A, TH-D74). Reinstall the module after a driver update so the catalog picks up `liveControl`.
2. Click **Connect**. The same connection dialog as Import asks for manufacturer, model, serial port, and baud rate when the driver lists more than one speed. Match the radio’s PC-port baud.
3. Plug the programming cable into the computer, then into the radio **PC** jack on the main body (not the control-head COM port on a TM-D710).
4. Confirm **Connect**. HamBench wakes the radio, reads `ID`, and polls VFO frequency, mode, and power.

Radios that set `capabilities.liveControl` to false, or omit it and have no Kenwood CAT handshake (for example a Baofeng UV-5R), do not appear in this dialog. A Kenwood module installed before `liveControl` existed is still listed from its protocol or manufacturer until you reinstall it.

## Operate

Each VFO card shows the live frequency. Edit the MHz field and press Enter or leave the field to QSY. Mode and power send CAT `MD` and `PC`. **Log contact** opens the station log with frequency, mode, and band filled in.

**Hold to transmit** sends `TX` while the button is held and `RX` on release. That keys microphone audio on whichever side currently has PTT, not audio from the DATA port.

## Disconnect

Click **Disconnect** before Import, Write, or Sniffer on the same serial port. The Radio page will warn if you try to transfer memory while CAT still holds the port.
