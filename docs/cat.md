# CAT

The **CAT** page is live computer control for radios whose driver sets `capabilities.liveControl` and a Kenwood `cat` block. It is not a memory editor. Import and Write stay on the Radio page.

You can run more than one CAT session at once. Each serial port is its own session, so a D710 on one cable and a TH-F6 on another can both stay connected. Import and Write only refuse the port a CAT session already holds; another adapter still works.

Memory protocol is separate: TH-F6 programs memories with live CAT (`catRead` / `catWrite`); TM-D710A clones EEPROM and still speaks Kenwood CAT on the same PC port. How that live session talks (wake CR, VFO count, `FO` vs `FQ`, mode and power names) comes from the radio module `cat` fields, not from HamBench model checks.

## Open the page

Use the **CAT** tab in the header, between Radio and Channels.

## Connect

1. Install a radio module that declares live control. Reinstall the module after a driver update so the catalog picks up the `cat` profile.
2. Click **Connect**. The same connection dialog as Import asks for manufacturer, model, serial port, and baud rate when the driver lists more than one speed. Match the radio’s PC-port baud.
3. Plug the programming cable into the computer, then into the radio **PC** jack on the main body (not the control-head COM port on a TM-D710).
4. Confirm **Connect**. HamBench sends `ID` (and a wake CR first when the module sets `wakeCr`) and polls each VFO the module declares.
5. To add another radio, click **Connect another** and choose a free serial port. Ports already in a CAT session are omitted from the list. Disconnect that radio first if you need its port again.

Radios that set `capabilities.liveControl` to false, or omit it and have no Kenwood CAT handshake (for example a Baofeng UV-5R), do not appear in this dialog. A Kenwood module installed before `liveControl` existed is still listed from its protocol or manufacturer until you reinstall it.

## Operate

Each connected radio has its own panel with VFO cards. Edit the MHz field and press Enter or leave the field to QSY. Mode and power lists are the names from the radio module. **Log contact** opens the station log with frequency, mode, and band filled in.

**Hold to transmit** sends `TX` while the button is held and `RX` on release. That keys microphone audio on whichever side currently has PTT, not audio from the DATA port.

## Disconnect

Use **Disconnect** on that radio’s panel. The other CAT sessions stay up. Disconnect a port before Import, Write, or Sniffer on **that** serial port. The Import and Write dialogs label CAT-busy ports and will not use them; pick another adapter for a second radio.

## Debug

The **Debug** tab shows live SEND/RECV bytes. When more than one session is open, choose the radio (or **Last failed connect**) in the menu. Each frame is hex plus an ASCII preview (`ID\r`, `?\r`). **Save serial log** writes the same JSON shape as Radio import/write logs for the selected session.

A good TM-D710 connect shows `ID\r` → `ID TM-D710\r`, then `BC\r`, `FO 0\r`, and `FO 1\r` with full VFO replies. No reply after `ID` usually means the wrong jack, baud, or serial device. Modules that set `wakeCr` also show a wake CR first.
