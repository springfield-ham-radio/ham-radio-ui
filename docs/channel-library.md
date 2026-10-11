# Channel library

The **Channels** tab is HamBench’s portable channel list. Rows can be ordinary channels or imported repeaters. **Weather**, **FRS**, and **GMRS** are built-in groups (not stored in the library). Hide each one under **Preferences → Channels**. Select either kind and use **Add to radio** to copy them into unused memory slots. The dialog asks which open radio receives them.

## Import

Use **Import CSV** on the Channels page. HamBench accepts:

- HamBench library CSV (`name,tx_mhz,rx_mhz,…,kind`)
- RepeaterBook website CSV exports (personal use, registered RepeaterBook account)
- CHIRP CSV exports, including RepeaterBook’s CHIRP export

RepeaterBook and CHIRP rows are stored in the same library and shown with a **Repeater** badge. RepeaterBook `Frequency` is the downlink (radio receive); `Input Freq` is the uplink (radio transmit). Data courtesy of RepeaterBook.com when that export is used.

You can also mark or unmark a row as a repeater in the channel editor. Repeater rows store **Use** (open or closed) and **On-air**. RepeaterBook `Use` and `Operational Status` fill those fields on import. Latitude and longitude are stored when the CSV includes them. A blank coordinate cell is left empty. The exact pair (0, 0) is unlocated.

RepeaterBook rows also store a source key, city, county, state, country, landmark, modes, and the export's **Last Update** when that column is present. The source key is the RepeaterBook state id and repeater id when the export has them. Otherwise it is the call sign, output frequency, and location. CHIRP CSV has no coordinates and no city or state columns, so those rows stay unlocated.

City, state, landmark, and modes are no longer copied into notes. A RepeaterBook **Notes** cell is still stored, and a **Digital Access** value is stored as notes (`Digital access 293`) because that cell is an access code, not a node number. Notes written before this change are left as they are: a line such as `Austin, Texas · FM AllStar EchoLink · Digital access 293` cannot be split reliably, because city names contain commas and dashes, modes are free text, and the separator can appear in notes you typed.

Importing a file again matches an existing row by source key. When a row has no source key yet, it still matches on kind, call sign, and both frequencies. A match updates tones, offset, status, modes, location, linked-system flags and nodes, and coordinates when the new row has coordinates. It does not add a second row, and it does not replace the name or notes you edited. The toast reports how many rows were added, updated, and unchanged.

The **Location** column shows city and state (`Austin, Texas`) when those are known, then formatted coordinates, then —. Sort it either way. Rows with no location stay last. Hide it from **Columns**. The search box matches city, county, state, country, and landmark. The repeater editor shows the same location fields and modes.

## Distance

**Distance from** is on every group. Pick a saved station or type coordinates. HamBench starts with the selected station when that station has a location, otherwise Home. The **Distance** column is straight-line miles or kilometers (**Preferences → Channels**; miles unless you change it). Sort the column either way. Rows without coordinates, including CHIRP imports and RepeaterBook website exports that omit latitude and longitude, show — and stay last. Hide **Distance** from **Columns**. With no start point the column is hidden. Bearing is not shown.

## Trip lists

**New trip group** names a library group for a road trip, then opens **Import CSV**. Import a route export you already made, such as RepeaterBook Plus Route Search or Highway Repeater Search. HamBench does not search RepeaterBook for routes.

Trip groups use the same **Distance from** control. Filter by band, **Open use**, and **On-air** when the import included those fields. Select the rows you want and use **Add to radio**.

## Add to a radio

1. On the Radio page, open the radio and load its memory (open a memory file or read from the radio).
2. On **Channels**, select one or more rows.
3. Choose **Add to radio**, then pick the radio. HamBench fills unused slots on that radio in order.
4. Use **Write** on that radio's card to program the device.

On the Radio page, **Add from library** copies saved channels into unused slots on that card. Select them in the order they should be programmed.

## Replace a memory slot

On the Radio page, open a memory channel and choose **Replace from library**. The picker shows the same group tabs as the Channels page. That copies the saved channel’s name, frequencies, and tones into the open slot. The slot number stays the same, and radio-specific settings such as power and mode stay as they are.

**Add from library** on the same page fills unused slots instead. Those new slots take this radio’s default power, mode, and scan settings.
