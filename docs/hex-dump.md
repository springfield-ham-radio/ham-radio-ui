# Hex Dump

The **Radio → Hex Dump** tab shows the loaded memory image next to the radio’s memory map. Use **Import** / **Write** on the Radio page to read or program a radio, or **Open** / **Save** for a memory file. Until a memory is loaded, the tab also offers **Import from Radio** and **Open Memory**.

## Layout

A two-column layout keeps the **hex dump** on the left and the **memory map** on the right.

The dump lists EEPROM addresses, 16-byte rows, and ASCII. Bytes that belong to the selected record are tinted by field; the selected field is outlined. Click a mapped byte to select that struct, instance, and field on the map.

## Memory map

The map is the same address-bar and record layout as **Driver → Channels / Settings**, bound to the actual image:

- The address bar and chips select a struct (channel records, names, extras, or radio-wide settings).
- **Prev / Next** step through repeated records. For channel-bound structs this is the channel number used on the Channels tab (`Channel 0 of 128`, and so on). The dump scrolls to that record.
- The record layout and table show how the current instance is packed: raw **Encoded** bytes and the **Decoded** value (frequencies in MHz, CTCSS/DCS, On/Off, and so on). Click a field cell or table row to highlight those bytes in the dump.

Empty channel slots show an **Empty** badge. Radios without a memory map still show the hex dump alone.
