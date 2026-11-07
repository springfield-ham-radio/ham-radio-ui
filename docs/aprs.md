# APRS receive (Kenwood TM-D710)

The **APRS** tab listens to the built-in TNC on the control-head **COM** jack. Stations, the map, packet fields, and the raw log are the menu 604 monitor. That monitor does not transmit, send TNC commands, upload to APRS-IS, igate, beacon, or change radio menus. **Messages** is a separate host listener on the same jack. This build does not write KISS frames or TNC commands there either. See [Host messaging](#host-messaging).

The PC jack on the TX/RX unit is the programming and CAT port. It is a different connector and a different baud menu. The DATA mini-DIN is for an external TNC; its PKS pin keys the transmitter when low. Do not use either jack for this tab.

## What Bryan needs to confirm

- The faceplate is TM-D710A, E, or S, or it is TM-D710G, GA, GE, or GS. A saved radio named only "TM-D710" shows both menu sets.
- The cable is the optional PG-5G, or the same 2.5 mm 3-conductor wiring, in the control-head COM jack. Tip is radio TXD, ring is radio RXD, sleeve is ground. There is no PTT wire on that plug.
- Menu 604 OUTPUT is ON. The Kenwood default is OFF, so a correct cable still produces no lines until that menu is ON.
- The radio's own APRS beacon schedule is whatever is already programmed. HamBench does not change it. A beacon that is already enabled can still go out on the air.

## Cable and port

| | COM (this tab) | PC (CAT and memory) | DATA |
| --- | --- | --- | --- |
| Where | Rear of the operation panel | Rear of the TX/RX unit | Rear of the TX/RX unit |
| Cable | PG-5G | Programming cable | External TNC |
| Use | Built-in TNC text | Clone and Kenwood CAT | Do not use; PKS transmits |

Sources:

- [TM-D710GA/GE instruction manual, B62-2562-10](https://manuals.jvckenwood.com/download/files/B62-2562-10.pdf) — menu table: 604 COM port output, 601 internal TNC, 920 PC port baud, 929 COM port baud, 930 packet data band. Panel: COM is the PC connection for the built-in TNC; GPS is the separate 2.5 mm jack for a GPS or weather station.
- [TM-D710G CD-ROM English V1.01](https://kasc.kenwood.com/files/prod/2681/5/TM-D710GE_GA_Instruction_Manual_CD-ROM_V1.01.pdf) — PACKET: the COM terminal is on the operation panel; do not connect the computer to the PC terminal. DATA is unused with the built-in TNC. PKS low transmits and mutes the microphone. Menu 929 COM PORT SPEED. Menu 920 PC PORT SPEED.
- [Getting More Acquainted with APRS and EchoLink](https://www.kenwood.com/i/products/info/amateur/pdf/TM-D710A_E_GA_GE_IDM.pdf) — PG-5G from the operation-panel COM port to a 9-pin serial port. KISS is entered by a command from the computer. HamBench does not send that command.
- [TM-D710/S/G/GS in-depth manual](https://origin.kenwood.com/jp/products/amateur/mobile/tm_d710_d710s/tm-d710_s_g_gs_in-depth_manual_j.pdf) — COM baud is menu 528 on TM-D710/S and menu 929 on TM-D710G/GS.

The A/E instruction manual uses the same APRS menu numbers and the 5xx port menus: COM speed **528**, PC speed **519**, packet data band **529**, internal TNC **601**, COM output **604**. Those numbers are the ones printed in the Kenwood TM-D710A/E PACKET OPERATION and APRS chapters (COM PORT Speed, PC Port Speed, Data Band, INTERNAL TNC, COM PORT ON/OFF).

## Radio settings

HamBench does not change these. Set them on the radio. Under **Preferences → Radios**, edit the saved radio and set **APRS serial port** and **APRS baud**. Those fields are stored separately from the memory port and baud. The same adapter name may be saved for both, because one USB device can be moved between jacks. Only one live session can hold that adapter: Read, Write, and CAT stay blocked while APRS is connected, and APRS will not open an adapter CAT already holds. **Connect** opens the saved APRS port. Saving APRS settings does not change the memory port. If that adapter is unplugged, the port stays in the list as saved and not connected, and Connect explains that the memory port was left unchanged.

1. Press **[TNC]** until the display shows **APRS** (not PACKET12 and not blank).
2. Menu **604** OUTPUT = **ON**. This is the switch that copies received APRS traffic and TNC monitor text to the COM jack. Default is OFF.
3. COM baud:
   - A/E/S: menu **528**
   - G/GA/GE/GS: menu **929**
   - Choices are 9600, 19200, 38400, and 57600. Default **9600**. Power-cycle the radio after changing it. The computer side is 8 data bits, 1 stop bit, no parity.
4. Menu **601** INTERNAL TNC: data band on the band that is receiving APRS, packet speed **1200 bps** unless that network is 9600.
5. Leave menu **519** / **920** (PC port) and menu **529** / **930** (packet-mode data band) as they are. They do not select this feed.
6. In HamBench, set that same COM baud and the PG-5G adapter on the saved radio, then **Connect**. **Disconnect** closes the handle. Read, Write, and CAT will not take that adapter until then.

RTS and DTR are written deasserted, and hardware flow control is off. The session never writes a payload byte. No TNC command is proposed for automatic send: menu 604 already enables the monitor copy, and commands such as `KISS ON` or `RESTART` are how a program takes over the TNC and can transmit. `MON ON` is the PACKET-mode default in the TNC command list and is not sent either.

## What the tab shows

The station list includes every heard station. The map shows only stations whose own position was decoded. A message with no position, a Mic-E ambiguous position, a malformed line, and an unsupported format stay off the map and stay in the raw log. An object or item position is not drawn as the sending station. The map fits the stations once, then leaves pan and zoom alone when later packets arrive. **Fit stations** fits them again.

Positions exist only for this listening session. Menu 604 OUTPUT copies new packets to the COM jack. It does not dump the radio's station list. The TNC `LIST` and `READ` commands are the packet mailbox, not an APRS station export, and HamBench does not send them.

## Decoded fields

Stations are AX.25 sources. A later packet replaces only fields it actually contains, so a message keeps the last position. An object or item position is labeled as a reported object and does not replace the sender's position. Course is omitted for Mic-E when the decoded course is 0, which the protocol uses for unknown. Weather uses the packet's own units (mph, °F, inches, hPa). Mic-E altitude is meters. Uncompressed `/A=` altitude is feet.

Unsupported or malformed text stays in the raw log with a reason. That includes telemetry, queries, third-party packets, NMEA sentences, Mic-E position ambiguity, the `cmd:` prompt, and anything that is not a one-line TNC2 monitor frame. The log and station list are capped (500 lines, 300 stations) and the lists are virtualized.

Packet format follows [APRS Protocol Reference 1.0.1](https://www.aprs.org/doc/APRS101.PDF). The decoder is in this repository; see [ADR 0014](adr/0014-aprs-receive.md).

## Host messaging

Messages use the same COM jack and the same saved port. They do not use the memory port. The monitor stays the default: **Connect** on Stations only reads menu 604 text. **Listen** on Messages only reads. Neither button sends `KISS ON`, `RESTART`, `HB`, or a message.

Kenwood's [Getting More Acquainted with APRS and EchoLink](https://www.kenwood.com/i/products/info/amateur/pdf/TM-D710A_E_GA_GE_IDM.pdf) (PC APRS, about pages 26–27) says the radio has to show **PACKET12**, and the PC then sends `KISS ON` and `RESTART`. The G CD-ROM command list says that while KISS is ON, `RESTART` enters or leaves KISS. The A/E command list says that while KISS is ON, powering the radio off and on enters or leaves KISS. Those are command-mode instructions. They do not document a host byte sequence that leaves KISS after the TNC is already in it. HamBench does not send the D700 init file, does not power-cycle the radio, and does not invent that exit sequence.

Until that exit is verified, **Allow transmit** and **Send** do not write. An incoming ack is also a transmission, and that switch stays off. A message is not queued across Disconnect or a restart.

Menus 600–612 do not control the TNC during host KISS. The radio's own station list, messages, and beacon are not promised to keep running, and HamBench does not erase them. Menu 604 is the monitor copy, not a way to inject a message. Menu 602 is GPS or weather input, not message input. `HBAUD` 1200 is the usual RF packet speed and is not menu 528 or 929.

The PG-5G is TXD, RXD, and ground. RTS and DTR are not on that plug and are not PTT. The TNC command `XFLOW` defaults to ON (software flow control). That handshake is not verified here, so it is not used as permission to transmit.

The TNC has 4 kB of KISS buffer. A partial frame longer than that is dropped. Message text is at most 67 characters, the addressee is a 9-character field, and a message number is 1 to 5 characters, as in APRS Protocol Reference 1.0.1. When a future build is allowed to transmit, a user message is sent at most 3 times, 15 seconds apart, and only after **Allow transmit** and **Send**. Cancel stops it. An ack is accepted only from the station that was addressed and only with that message number. See [ADR 0015](adr/0015-aprs-host-messaging.md).
