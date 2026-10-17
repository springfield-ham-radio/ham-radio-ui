# Channel library

The **Channels** tab is HamBench’s portable channel list. Rows can be ordinary channels or imported repeaters. **Weather**, **FRS**, and **GMRS** are built-in groups (not stored in the library). Hide each one under **Preferences → Channels**. Select either kind and use **Add to radio** to copy them into unused memory slots. The dialog asks which open radio receives them.

## Channel packs

Use **Import / Export** on the Channels page. **Import pack** and **Export pack** read and write a `.hpack` JSON file for one library group. A pack carries the group name, optional author and description, a free-text version, an `updated` timestamp, and an optional `source` URL for a club-hosted file. Export always includes every channel in the open group, not a selection.

RepeaterBook rows are left out of an export unless you check **Include RepeaterBook rows** and have written permission from RepeaterBook. Included rows carry `provenance: "repeaterbook"` so a later export omits them again by default.

Import shows added, changed, and removed rows before you apply. Applying a pack overwrites name and notes from the file and removes channels that are no longer in the pack from that group. A library row is deleted only when no other group still references it. Re-importing a pack matches rows by pack channel id, then by source key.

Open a stored group tab before exporting a pack. **All** and built-in groups cannot export packs.

For local testing, open Channels with `?fixture=channel-pack-import` in a dev build, or import `public/fixtures/sample-club.hpack`.

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

## Map

Use **Map** above the channel table to open a collapsible repeater map. The map shows the same rows as the table after group, search, **Band**, **On-air**, **Linked only**, and trip filters. **Band** and **On-air** choices are remembered in the browser. Repeater on-air status comes from imported repeater records; channels without that field appear only when **On-air** is **All**. Open or closed state and the splitter size are remembered; the map starts **closed** on first visit.

Markers use band colors with a legend for the bands in view. Click a pin to highlight the row, scroll it into view, and open a popup with call sign, frequencies, tones, and location. When **Distance from** has a start point, the popup also shows straight-line distance and compass bearing. Row hover highlights the matching pin without changing checkbox selection.

**Distance from** also drives a distance-start pin on the map. An optional **Range** field (miles or kilometers per **Preferences → Channels**) draws a ring around that start point; leave it blank to turn the ring off. Rows without coordinates are counted in a short note under the map.

If tiles cannot load, the map keeps markers on a plain background and shows a connection warning. Basemap choice is documented in `docs/adr/0003-map-basemap.md`.

The **Map** tab plots located repeaters and ordinary channels from your stored library groups (not built-in Weather, FRS, or GMRS). Turn **Repeaters** and **Channels** on or off independently. Use the group picker to limit which folders appear. **Trips** draws a dashed straight line through each selected trip group’s located stops (with a colored dot at each stop) from your located Home or selected station; the path follows the stops without doubling back. It is not a driven route. The collapsible map on this page is unchanged.

## Distance

**Distance from** is on every group. Pick a saved station or type coordinates. HamBench starts with the selected station when that station has a location, otherwise Home. The **Distance** column is straight-line miles or kilometers (**Preferences → Channels**; miles unless you change it). Sort the column either way. Rows without coordinates, including CHIRP imports and RepeaterBook website exports that omit latitude and longitude, show — and stay last. Hide **Distance** from **Columns**. With no start point the column is hidden. Bearing is not shown.

## Trip lists

The **Add channel** split button defaults to adding a channel. Open its menu to choose **New empty group** or **New trip group**; the last choice stays for the session. **New trip group** names a library group for a road trip, then opens **Import CSV**. Import a route export you already made, such as RepeaterBook Plus Route Search or Highway Repeater Search. HamBench does not search RepeaterBook for routes.

Trip groups use the same **Band**, **On-air**, and **Distance from** controls. Filter by **Open use** when the import included that field. Select the rows you want and use **Add to radio**.

## Add to a radio

1. On the Radio page, open the radio and load its memory (open a memory file or read from the radio).
2. On **Channels**, select one or more rows.
3. Choose **Add to radio**, then pick the radio. HamBench fills unused slots after the last programmed channel, then wraps to earlier free slots when the end of memory is full.
4. Use **Write** on that radio's card to program the device.

On the Radio page, **Add from library** copies saved channels into unused slots on that card in the same order. Select them in the order they should be programmed.

## Replace a memory slot

On the Radio page, open a memory channel and choose **Replace from library**. The picker shows the same group tabs as the Channels page. That copies the saved channel’s name, frequencies, and tones into the open slot. The slot number stays the same, and radio-specific settings such as power and mode stay as they are.

**Add from library** on the same page fills unused slots after the last programmed channel instead. Those new slots take this radio’s default power, mode, and scan settings.
