# Channel validation before Add to radio and Write

**Status:** accepted  
**Date:** 2026-10-15  
**Related:** [#61](https://github.com/springfield-ham-radio/ham-radio-ui/issues/61), [#58](https://github.com/springfield-ham-radio/ham-radio-ui/issues/58)

## Context

Library channels can be copied into a radio memory image or written to the device without checking whether frequencies, tones, and names fit that radio’s hardware map or the operator’s license. Module configs now declare amateur transmit bands (`bands`), and each radio ships a JSON channel schema and memory map, but Add to radio and Write did not use them. CHIRP’s `validate_memory` pattern—errors that block bad rows and warnings that allow confirmation—is the model.

## Decision

- **Helper:** `validateChannelForRadio` in `app/utils/channel-validation.ts` returns `{ level, field, code, message }` findings for one `RadioChannel`-shaped row against a target radio (`bands`, hydrated `memoryMap`, hydrated `channelSchema`) and optional license assessment (same shape as the channel editor’s privilege check).
- **Band membership:** `bands` lists amateur **transmit** coverage as ADIF tokens (`2m`, `70cm`, …). When at least one token maps to a known allocation in `ham-radio-utils` `bands.json`, receive outside those windows is a **warning**, transmit outside is an **error**. When `bands` is missing or empty, band checks are skipped and numeric `minimum` / `maximum` from the channel schema apply instead (legacy modules without `bands`).
- **Do not** apply the UV-5R channel schema’s 136–174 MHz window when `bands` includes `70cm`; schema frequency limits are fallback-only.
- **Encode limits:** Name length comes from the memory map’s bound `ascii` name field when present; otherwise from schema `name.maxLength`. Tone and frequency checks mirror `memory-map-codec` encode rules (lbcd digit width, `tone` / `ctcss-index` / `dcs-index` tables, `ctcssMin`). Encode is unchanged; validation reports tones that would be cleared or mis-encoded.
- **Offset:** Warn when TX and RX differ, both frequencies share the same allocation label, and the magnitude is not `defaultRepeaterOffsetHz` (ARRL table in `channel-edit.ts`). **No** offset warning for cross-band pairs (for example 146 / 446 MHz).
- **License:** When the license assessment is `active`, transmit privilege uses `transmitPrivilegeWarning`; receive is not checked.
- **UI (later PRs):** Add to radio will filter or confirm rows; Write review (#58) will summarize findings but **Write stays enabled**—the operator confirms after reading the summary.
- **Placement:** Policy and wording stay in ham-radio-ui. Band-window and tone-encode primitives may move to `ham-radio-utils` in a later release; this ADR does not require a utils bump for #61.

## Consequences

- Operators see mismatches before slots are filled or before they confirm a write.
- Old Baofeng configs without `bands` still reject 70 cm via schema range until modules are upgraded.
- Third-party modules with missing or inaccurate `bands` rely on schema range and encode checks until `bands` is declared.
