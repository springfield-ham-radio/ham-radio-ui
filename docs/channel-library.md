# Channel library

The **Channels** tab is HamBench’s portable channel list. Rows can be ordinary channels or imported repeaters. Select either kind and use **Add to radio** to copy them into unused memory slots on the loaded radio.

## Import

Use **Import CSV** on the Channels page. HamBench accepts:

- HamBench library CSV (`name,tx_mhz,rx_mhz,…,kind`)
- RepeaterBook website CSV exports (personal use, registered RepeaterBook account)
- CHIRP CSV exports, including RepeaterBook’s CHIRP export

RepeaterBook and CHIRP rows are stored in the same library and shown with a **Repeater** badge. RepeaterBook `Frequency` is the downlink (radio receive); `Input Freq` is the uplink (radio transmit). Data courtesy of RepeaterBook.com when that export is used.

You can also mark or unmark a row as a repeater in the channel editor. Repeater rows store **Use** (open or closed) and **On-air**. RepeaterBook `Use` and `Operational Status` fill those fields on import.

## Add to a radio

1. Open a memory file or import from a radio.
2. On **Channels**, select one or more rows.
3. Choose **Add to radio**. HamBench fills unused slots in order.
4. Use **Write** on the Radio page (or **File → Write to Radio…**) to program the device.
