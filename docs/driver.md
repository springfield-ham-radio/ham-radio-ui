# Driver

The **Radio → Driver** tab shows how HamBench talks to the loaded radio. Sub-tabs cover **Read**, **Write**, **Channels**, and **Settings**. Until a memory file is opened or a radio is imported, the tab offers **Import from Radio** and **Open Memory**.

## Read and write

The diagram is a serial sequence: Computer on the left, Radio on the right. Yellow arrows are bytes the computer sends; green arrows are replies. Clone protocols wrap the memory transfer in a **loop** (one exchange per chunk). Live CAT protocols loop per channel and show the commands the packer issues (`MR` / `MNA` on read, `MW` / `MNA` on write for Kenwood TH-F6). Write loops also note skipped address ranges and per-block delays when the configuration specifies them.

Switch to **JSON** to inspect the raw `readMemory` or `writeMemory` steps from the radio configuration.

## Channels and settings

These views are **memory maps**, not serial sequences. **Channels** shows structs bound onto portable channel records (and names/extras). **Settings** shows the remaining radio-wide structs, opening on the `settings` struct when one exists. An address bar shows where each struct lives in EEPROM. Select a struct chip to see one record’s packing: multi-byte fields as cells, bitfields as bits 7–0, plus a field table. JSON is the filtered memory-map document for that tab.
