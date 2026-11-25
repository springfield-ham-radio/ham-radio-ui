# Driver

Enable **Radio Driver tab** in Preferences → Developer to open the **Radio → Driver** tab on each saved radio. Sub-tabs cover **Read**, **Write**, **Channels**, **Settings**, and **Menu capture** (guided capture for driver authors). Those **Read** / **Write** pills are protocol diagrams and JSON — not the clone actions. Use the card toolbar or **Radio → Read from Radio** / **Write to Radio** to read or program a radio, or **Open** / **Save** for a memory file. Until a memory is loaded, Channels and Settings also offer **Read from Radio** and **Open Memory** via the empty state.

Enable **Driver development** in the same preferences section for the main **Driver** tab in the app header and the module editor at `/driver`.

## Read and write

The diagram is a serial sequence: Computer on the left, Radio on the right. Yellow arrows are bytes the computer sends; green arrows are replies. Clone protocols wrap the memory transfer in a **loop** (one exchange per chunk). Live CAT protocols loop per channel and show the commands the packer issues (`MR` / `MNA` on read, `MW` / `MNA` on write for Kenwood TH-F6). Write loops also note skipped address ranges and per-block delays when the configuration specifies them.

Switch to **JSON** to inspect the raw `readMemory` or `writeMemory` steps from the radio configuration.

## Channels and settings

These views are **memory maps**, not serial sequences. **Channels** shows structs bound onto portable channel records (and names/extras). **Settings** shows the remaining radio-wide structs, opening on the `settings` struct when one exists. An address bar shows where each struct lives in EEPROM. Select a struct chip to see one record’s packing: multi-byte fields as cells, bitfields as bits 7–0, plus a field table. JSON is the filtered memory-map document for that tab.