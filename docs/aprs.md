# APRS receive (Kenwood TM-D710)

The **APRS** tab is receive-only. It listens to the built-in TNC on the control-head **COM** jack and lists stations, decoded fields, and the raw line log. It does not transmit, send TNC commands, upload to APRS-IS, igate, beacon, or change radio menus. Map and outbound messages are not in this tab.

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

HamBench does not change these. Set them on the radio, then press **Connect** and pick the PG-5G adapter. The programming port saved on the radio card is not filled in.

1. Press **[TNC]** until the display shows **APRS** (not PACKET12 and not blank).
2. Menu **604** OUTPUT = **ON**. This is the switch that copies received APRS traffic and TNC monitor text to the COM jack. Default is OFF.
3. COM baud:
   - A/E/S: menu **528**
   - G/GA/GE/GS: menu **929**
   - Choices are 9600, 19200, 38400, and 57600. Default **9600**. Power-cycle the radio after changing it. The computer side is 8 data bits, 1 stop bit, no parity.
4. Menu **601** INTERNAL TNC: data band on the band that is receiving APRS, packet speed **1200 bps** unless that network is 9600.
5. Leave menu **519** / **920** (PC port) and menu **529** / **930** (packet-mode data band) as they are. They do not select this feed.
6. In HamBench, set the same COM baud, then **Connect**. **Disconnect** closes the handle. Read, Write, and CAT will not take that adapter until then.

RTS and DTR are written deasserted, and hardware flow control is off. The session never writes a payload byte. No TNC command is proposed for automatic send: menu 604 already enables the monitor copy, and commands such as `KISS ON` or `RESTART` are how a program takes over the TNC and can transmit. `MON ON` is the PACKET-mode default in the TNC command list and is not sent either.

## What the tab shows

Stations are AX.25 sources. A later packet replaces only fields it actually contains, so a message keeps the last position. An object or item position is labeled as a reported object and does not replace the sender's position. Course is omitted for Mic-E when the decoded course is 0, which the protocol uses for unknown. Weather uses the packet's own units (mph, °F, inches, hPa). Mic-E altitude is meters. Uncompressed `/A=` altitude is feet.

Unsupported or malformed text stays in the raw log with a reason. That includes telemetry, queries, third-party packets, NMEA sentences, Mic-E position ambiguity, the `cmd:` prompt, and anything that is not a one-line TNC2 monitor frame. The log and station list are capped (500 lines, 300 stations) and the lists are virtualized.

Packet format follows [APRS Protocol Reference 1.0.1](https://www.aprs.org/doc/APRS101.PDF). The decoder is in this repository; see [ADR 0014](adr/0014-aprs-receive.md).
