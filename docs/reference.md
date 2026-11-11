# Reference

The Reference tab is an offline aid: ITU phonetics, common Q signals, a U.S. amateur band chart, and Morse listening practice. It does not read or transmit on a radio.

Open it from the **Reference** item in the header. No radio has to be selected, installed, or connected. The module-install dialog stays closed on `/reference`.

## What is law, and what is not

The band chart draws FCC privileges for a station in ITU Region 2. CW is allowed wherever that license class may transmit, except 219–220 MHz.

It does not draw the ARRL band plan. Those plans are voluntary. The page links to them as a cross-check. The drawing is original; it is not the ARRL PDF or that layout.

Novice and Advanced are no longer issued (47 CFR § 97.501). The class menu still lists them because existing grants keep those privileges. The app does not guess which class the operator holds.

## 60 m, and other easy mistakes

As of the rules effective February 13, 2026:

- 5351.5–5366.5 kHz is a real segment. Maximum power is 9.15 W ERP. Emissions stay within 2.8 kHz. It is not channelized.
- 5332, 5348, 5373, and 5405 kHz remain separate centers at 100 W ERP, with the emission designators in § 97.303(h).
- 5358.5 kHz is inside the 15 kHz segment. It is not a fifth 100 W channel.
- The gaps between those centers are not amateur spectrum.

30 m is CW and data only, 200 W PEP, secondary. 2200 m and 630 m need a fixed station, a Utilities Telecom Council notice, and the EIRP limits in § 97.313. 219–220 MHz is data-only message forwarding.

Phone and image on 7.075–7.100 MHz exist only for the places in § 97.307(f)(11). The default bars do not paint that as a nationwide phone segment. The text table has a “Not drawn” row.

The chart stops at the allocations in § 97.301. The old 3.3–3.5 GHz amateur segment is not in that table, so it is not drawn. Above 275 GHz the bar has no upper edge; § 97.303(f) notches are not drawn.

## Morse practice

Practice is listening. Pick character sets, a speed in WPM, and optional Farnsworth character speed. Start plays one character. Replay plays it again. Check scores the typed answer. Reveal shows it and, if you had not checked, counts a miss. Reset clears the session.

Element timing follows ITU-R M.1677-1: dot : dash is 1 : 3, and the gaps inside a character, between characters, and between words are 1 : 3 : 7. PARIS is 50 of those units. Farnsworth keeps the dot length at the faster character speed and stretches only the two longer gaps, still in the ratio 3 : 7. If the character speed is not faster than the overall speed, spacing stays standard.

The tone uses Web Audio and starts only after Start, Replay, or Play. Default volume is 20%. Mute and Stop silence it. Leaving the Morse section closes the audio context. There is no microphone, key, or transmitter.

## Sources

Links and the verified-on date are in `app/utils/reference-sources.ts`. The page lists them. Data modules:

| File | Contents |
| --- | --- |
| `app/utils/phonetic-alphabet.ts` | Appendix 14 letters and figure code |
| `app/utils/q-signals.ts` | ITU-R M.1172 question and statement |
| `app/utils/amateur-bands.ts` | Part 97 segments, footnotes, chart layout |
| `app/utils/morse-code.ts` | ITU-R M.1677-1 characters, timing, scoring |
| `app/utils/morse-audio.ts` | Web Audio player |

## Updating the band chart

1. Read the current eCFR text for §§ 97.301, 97.303, 97.305, 97.307, and 97.313, and § 2.106 when a sharing footnote changes.
2. Edit segments in `app/utils/amateur-bands.ts`. Keep ranges half-open: the FCC upper edge is `endHz`, and the next segment starts there. Do not overlap a class’s own spans.
3. Put a tighter power limit or a geographic limit on the segment, and add a footnote whose text matches the rule. If painting the bar would overstate access, say so in `blurb` and keep the exception out of the default bars.
4. Set `REFERENCE_VERIFIED_ON` in `app/utils/reference-sources.ts`.
5. Extend `test/unit/amateur-bands.test.ts` for the edge you changed: contiguous ranges, gaps, 60 m channels, Novice versus Technician, and any exception that must not look universal.
6. Run `yarn test:unit`, `yarn lint`, and `yarn build`.

Do not copy an ARRL chart image or a third-party privilege table into the repo. Confirm each external URL still resolves before changing it.
