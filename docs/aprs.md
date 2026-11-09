# APRS receive (Kenwood TM-D710)

The **APRS** tab listens to the built-in TNC on the control-head **COM** jack. Stations, the map, packet fields, and the raw log are the menu 604 monitor. That monitor does not transmit, send TNC commands, upload to APRS-IS, igate, beacon, or change radio menus. Leave the radio showing **APRS** for that test. **Messages** is a separate host session on the same jack. See [Host messaging](#host-messaging).

The PC jack on the TX/RX unit is the programming and CAT port. It is a different connector and a different baud menu. The DATA mini-DIN is for an external TNC; its PKS pin keys the transmitter when low. Do not use either jack for this tab.

## What Bryan needs to confirm

- The faceplate is TM-D710A, E, or S, or it is TM-D710G, GA, GE, or GS. A saved radio named only "TM-D710" shows both menu sets.
- The cable is on the operation-panel **COM** jack. That jack is an 8-pin connector: RTS out, CTS in, TXD out, GND, RXD in, and three unused pins (TM-D710A/E PACKET OPERATION, “PC/COM terminal pins”; the G manual lists the same COM pins). The optional PG-5G is the cable from that jack to a 9-pin serial connector. The 2.5 mm 3-conductor plug is the **GPS** jack, not COM. Whether a USB adapter actually wires RTS and CTS is not known from software.
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
- [Getting More Acquainted with APRS and EchoLink](https://www.kenwood.com/i/products/info/amateur/pdf/TM-D710A_E_GA_GE_IDM.pdf) — PG-5G from the operation-panel COM port to a 9-pin serial port. KISS is entered from PACKET12 by carriage return, `KISS ON`, and `RESTART`. HamBench sends that only from **Enter host KISS** on the Messages tab.
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

The passive session writes RTS and DTR deasserted and leaves flow control off. That is the setup already confirmed on the air. It never writes a payload byte. `KISS ON` and `RESTART` are not sent from Stations. `MON ON` is the PACKET-mode default in the TNC command list and is not sent either.

## What the tab shows

The station list includes every heard station. The map shows only stations whose own position was decoded. A message with no position, a Mic-E ambiguous position, a malformed line, and an unsupported format stay off the map and stay in the raw log. An object or item position is not drawn as the sending station. The map fits the stations once, then leaves pan and zoom alone when later packets arrive. **Fit stations** fits them again.

Positions exist only for this listening session. Menu 604 OUTPUT copies new packets to the COM jack. It does not dump the radio's station list. The TNC `LIST` and `READ` commands are the packet mailbox, not an APRS station export, and HamBench does not send them.

## Decoded fields

Stations are AX.25 sources. A later packet replaces only fields it actually contains, so a message keeps the last position. An object or item position is labeled as a reported object and does not replace the sender's position. Course is omitted for Mic-E when the decoded course is 0, which the protocol uses for unknown. Weather uses the packet's own units (mph, °F, inches, hPa). Mic-E altitude is meters. Uncompressed `/A=` altitude is feet.

Unsupported or malformed text stays in the raw log with a reason. That includes telemetry, queries, third-party packets, NMEA sentences, Mic-E position ambiguity, the `cmd:` prompt, and anything that is not a one-line TNC2 monitor frame. The log and station list are capped (500 lines, 300 stations) and the lists are virtualized.

Packet format follows [APRS Protocol Reference 1.0.1](https://www.aprs.org/doc/APRS101.PDF). The decoder is in this repository; see [ADR 0014](adr/0014-aprs-receive.md).

## Host messaging

Messages use the same COM jack and the same saved port. They do not use the memory port. The list is one row per callsign, and the SSID stays on it. Opening a row or **New message** does not send. An incoming line shows the APRS addressee. An ack updates that outgoing line. It is not a second bubble and it is not a read receipt. One **APRS COM** control sits above Stations, Map, Messages, Station details, and Raw log. **Passive monitor** reads menu 604 text and writes nothing. **Host session** opens that same port with the flow you chose and writes nothing. The prompt request and the KISS enter bytes come from the installed module's `aprs.host` block. A module that does not publish that block does not receive the TM-D710 sequence. A TM-D710 module that has not been updated yet still uses the tested sequence: three Ctrl+C, then `KISS ON` after `cmd:`, then `RESTART` after another `cmd:`. Connect does not enter KISS, send a beacon, or send a message. Disconnect closes whichever of those two is open. CAT stays on its own tab. **Station details** is the selected station’s decoded fields. It is not packet mail. A parsed AX.25 UI frame from the host session is decoded with the same APRS rules as a menu 604 line and folded into the Stations list and map. Source, destination, and path come from the AX.25 addresses. A digipeater that has already repeated is marked with a star. A frame that is not a position does not get coordinates. The passive path still reads TNC2 text only. It cannot open the port while the host session holds it. The badge says **Connected** or **Disconnected**. KISS confirmation is a sentence on that same connection, not a second badge. **Send** is the transmit choice. It writes a message frame only when this host session has parsed an AX.25 UI frame. A KISS frame that is not a UI frame does not count, and it does not clear a confirmation that a UI frame already gave. `cmd:` outside a KISS frame clears that confirmation and cancels the queue. A message is sent at most 3 times, 15 seconds apart. **Cancel** stops it. **Disconnect** drops the queue, and the next Connect does not send it again. **Automatically acknowledge messages addressed to my callsign** sits with **My callsign** on the APRS header. It is off each time the port opens, it is not saved, and turning it on does not answer messages already heard. It does not answer an ack, and it is not a read receipt. An ack or reject counts only when it comes from the station you addressed and carries your message number. A carriage return after that ack is the TNC terminator. It is not part of the message number.

**Request command prompt** is not Connect and not Send. The command list says one Ctrl+C returns from Converse, and three return from Transparent. It does not say Ctrl+C prints a new `cmd:` when the TNC is already in command mode. `SENDPAC` defaults to carriage return (`$0D`), which sends a packet in Converse, so no newline is written to ask for a prompt. If the bytes `cmd:` arrive on this host session, Request sends nothing. If they have not, Request writes Ctrl+C three times, once, and waits. Disconnect drops that prompt. `cmd` without the colon does not count. Cancel or five seconds with no `cmd:` writes nothing more.

**Enter host KISS** stays disabled until that prompt. It then writes `KISS ON` and a carriage return, and writes `RESTART` only after another `cmd:`. The reply log records that command after `write_binary` returns the same length. Plugin 3.0.9’s `write_all` stops at the kernel `write()` and does not call `tcdrain`, so that count is not an echo. A plugin error is logged and the five-second wait does not start. An `?EH` answer stops it before `RESTART`. KISS-framed bytes are not a `cmd:` prompt and do not get a carriage return. A bare Ctrl+C is not a KISS frame; the D710 manuals do not say an already-KISS TNC answers it, and `C0 FF C0` is not sent. `RESET` is not sent.

Menus 600–612 do not control the TNC after KISS is entered. The radio’s station list and beacon are not promised to keep running, and HamBench does not erase them. Menu 604 is not a message input. Menu 602 is GPS or weather. `HBAUD` 1200 is the usual RF speed and is not menu 528 or 929.

The IDM (printed page 27, PDF page 31) says STA and CON blink together six times during the change into KISS. That is not a light that stays on. In the A/E PACKET indicator list, a steady STA means packets remain in the buffer and a steady CON means the TNC is connected. Dark indicators do not mean KISS is off, and a photo of PACKET12 does not prove KISS is on or off.

The A/E command list says, for KISS: “When ON, switching the power OFF then ON causes the TNC to enter (or exit) KISS mode.” The parameter default is OFF. The G command list says: “When ON, entering a RESTART command causes the TNC to enter (or exit) KISS mode.” `RESTART` on both “causes the TNC to function as if it is switched OFF then ON.” The stored ON/OFF parameter is what survives the power switch. Neither sentence says the result alternates, and neither promises that a power cycle leaves KISS. A power cycle can show the startup banner. That observation is not a guaranteed exit. `RESTART` is command text, so it is not available while the TNC is already inside KISS. The A/E packet chapter says press **[TNC]** twice to enter PACKET mode. It does not say that key leaves KISS. HamBench does not power-cycle the radio, does not send a carriage return or Ctrl+C to probe an unknown mode, and does not send `KISS OFF`. The TM-D700 bytes `C0 FF C0` are not used: the IDM says D700 PC commands are not compatible with the D710.

To leave an unknown TNC state without the computer sending a payload: **Disconnect**. On the radio, switch power OFF, then ON. HamBench does not send a carriage return or Ctrl+C to find the mode. Connect the host session again, and do not press **Send**. A startup banner can include `cmd:`. That line is not proof the TNC left KISS, and it is not proof of PACKET mode. An AX.25 UI line means a KISS payload parsed. A KISS frame that is not a UI frame leaves the mode unconfirmed, and **Send** stays blocked. HamBench does not send `KISS OFF`.

**Raw log** holds two lists. **Serial reply** is the host-session byte log: time, direction, hex, and escaped text. **Clear serial reply** removes those lines and keeps the counters. It does not disconnect or write. **Decoded lines** are the passive menu 604 text and the KISS UI frames already folded into the station list. **Clear decoded lines** also clears that station list and does not write. Command text, an incomplete KISS frame, a bad escape, and a parsed AX.25 UI frame are counted separately. Both lists stay when you change tabs. **Station details** is the selected station’s decoded fields, not a second copy of either log and not a mailbox. The radio’s stored mailbox is not read. KISS stays unconfirmed until an AX.25 UI frame is parsed. The host listener keeps bytes that arrive as the port opens. The passive monitor still drops its opening fraction of a second, which is the path already verified. Software flow control can take 0x11 and 0x13 before they are listed. That is a capture limit, not a conclusion about the two bytes seen on the air.

`XFLOW` defaults to ON in the command list, which is software flow control. **Flow control** is chosen on the APRS COM row before Connect and is not changed because a log is quiet. **Software (XON/XOFF)** is the default and keeps RTS and DTR low. **Off** is the passive monitor’s setting and also keeps RTS and DTR low. **Hardware (RTS/CTS)** is for a TNC whose display already says `XFLOW OFF`. The plugin’s `FlowControl::Hardware` is serialport `CRTSCTS`: the driver asserts RTS while it can receive and pauses TX when CTS drops. That mode does not ioctl RTS. A terminal “RTS on” checkbox is a manual line, not `CRTSCTS`. None of the three sends `XFLOW`.

The TM-D710A/E service manual, panel MPU table on printed pages 6–7, names pin 98 `PCCTS` as the UART inhibiting input from the PC and pin 99 `PCRTS` as the UART inhibiting output to the PC. Pins 46 and 47, `TNCCTS` and `TNCRTS`, are the separate inhibit pair toward the TNC. Forcing RTS low holds `PCCTS` in the inhibit state. DTR is not a pin on the COM jack.

`HBAUD    was 1200` is the TNC’s own parameter reply. The command list’s name is `HBAUD` / `HB`, default 1200. A D710 power-on transcript runs `HB 1200` and then prints that line and `cmd:`. HamBench never sends `HB` or `HBAUD`. The 17-byte enter string was `\\rKISS ON\\rRESTART\\r`. Plugin `open` writes no payload. `ECHO` defaults to ON, so a command the TNC accepted is echoed. `KISS ON` is a parameter; the A/E text enters KISS on the next power cycle, and the G text enters it on `RESTART`. Neither says the TNC goes silent at `KISS ON` itself.

The TNC has 4 kB of KISS buffer. A partial frame longer than that is dropped. Message text is at most 67 characters. See [ADR 0015](adr/0015-aprs-host-messaging.md).
