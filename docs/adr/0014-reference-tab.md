# Reference tab

**Status:** accepted  
**Date:** 2026-11-07

## Context

Operators want a phonetic alphabet, Q signals, a U.S. band chart, and Morse practice without opening a radio. That material has to stay available when no radio is selected, installed, or connected.

The band chart has to follow FCC privileges, not a voluntary band plan, and it has to survive the February 13, 2026 60 m change. Copying the ARRL PDF would also put someone else's layout in an MIT app.

An APRS receive feature is in progress on `cursor/aprs-receive-d710-a336`. This tab must not share serial, CAT, or radio-memory code with that work.

## Decision

- Add a header section **Reference** and the route `/reference`. It is not a per-radio pane.
- In `app.vue`, skip the required module-install dialog on `/reference`, the same way `/wavebench` and `/propagation` already do. Those two files are the only app-shell edits.
- Keep the data in plain TypeScript modules under `app/utils/`: `phonetic-alphabet.ts`, `q-signals.ts`, `amateur-bands.ts`, `morse-code.ts`, `morse-audio.ts`, and `reference-sources.ts`. No new dependency. The installed app does not fetch the reference.
- Draw the band chart as original SVG from those modules. The accessible text table is the same data. Half-open `[startHz, endHz)` ranges abut. 60 m is four center frequencies plus 5351.5–5366.5 kHz, not a solid bar. The 7.075–7.100 MHz phone exception is a row marked “Not drawn.”
- Morse practice is listening only. Web Audio is created on Start, Replay, or a per-character Play. Leaving the page closes the context. Timing is PARIS (50 units). Farnsworth lengthens only the character and word gaps, and only when the character speed is faster.
- Label ITU Q-code text separately from amateur custom. Do not list QST as a Q code.

## Consequences

- Header tab order and the module-dialog route guard can conflict with other shell work. The APRS branch should not need these lines if it stays inside the radio workspace.
- The chart is U.S. Region 2 as drawn for places that are not the §97.307(f)(11) phone exception. It is not a world allocation chart and not an ARRL band plan.
- Privileges go stale when Part 97 changes. Update the data, the verified-on date, and the unit tests together. See [reference.md](../reference.md).
- Practice does not record audio, use a keyer, or transmit.
