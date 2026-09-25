# Channel library

The **Channels** tab is HamBench’s portable channel list. Rows can be ordinary channels or imported repeaters. Select either kind and use **Add to radio** to copy them into unused memory slots. The dialog asks which open radio receives them.

## Import

Use **Import CSV** on the Channels page. HamBench accepts:

- HamBench library CSV (`name,tx_mhz,rx_mhz,…,kind`)
- RepeaterBook website CSV exports (personal use, registered RepeaterBook account)
- CHIRP CSV exports, including RepeaterBook’s CHIRP export

RepeaterBook and CHIRP rows are stored in the same library and shown with a **Repeater** badge. RepeaterBook `Frequency` is the downlink (radio receive); `Input Freq` is the uplink (radio transmit). Data courtesy of RepeaterBook.com when that export is used.

You can also mark or unmark a row as a repeater in the channel editor. Repeater rows store **Use** (open or closed) and **On-air**. RepeaterBook `Use` and `Operational Status` fill those fields on import.

## Add to a radio

1. On the Radio page, open the radio and load its memory (open a memory file or import from the radio).
2. On **Channels**, select one or more rows.
3. Choose **Add to radio**, then pick the radio. HamBench fills unused slots on that radio in order.
4. Use **Write** on that radio's card to program the device.

On the Radio page, **Add from library** copies saved channels into unused slots on that card. Select them in the order they should be programmed.

## Replace a memory slot

On the Radio page, open a memory channel and choose **Replace from library**. The picker shows the same group tabs as the Channels page. That copies the saved channel’s name, frequencies, and tones into the open slot. The slot number stays the same, and radio-specific settings such as power and mode stay as they are.

**Add from library** on the same page fills unused slots instead. Those new slots take this radio’s default power, mode, and scan settings.
