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

Practice is listening. Pick character sets, an overall speed in WPM, and a character speed. Start plays one character. Replay plays it again. Check scores the typed answer. Reveal shows it and, if you had not checked, counts a miss. Reset clears the session.

Play text takes pasted text and sends it with the same speed, character speed, tone, and volume. Play starts the tone. Stop cancels it immediately and silences the audio. The character that is sounding is marked while it plays.

Element timing follows ITU-R M.1677-1: dot : dash is 1 : 3, and the gaps inside a character, between characters, and between words are 1 : 3 : 7. PARIS is 50 of those units. A dot is 1.2 / character-speed seconds.

Farnsworth follows the ARRL practice method. PARIS is 31 units of dits, dahs, and the gaps inside characters, plus 19 units of spacing (four character gaps and one word gap). The dit stays at the character speed. The spacing unit is `((60 / overallWPM) - 31 × dit) / 19`. The character gap is 3 of those units and the word gap is 7, so PARIS still lasts `60 / overallWPM` seconds. Character speed defaults to 18 WPM and is never slower than the overall speed. When the two speeds are equal, the gaps stay at 3 and 7 dits.

At 5 WPM overall and 18 WPM character speed, the dit is 1.2/18 seconds (about 66.7 ms). The character gap is about 1.568 seconds, the word gap is about 3.660 seconds, and a paragraph gap is about 10.979 seconds. One PARIS word is 12 seconds.

Pasted text uses those same gaps. A space, a tab, or a single newline is one word gap. A blank line is a paragraph gap of 3 word gaps (21 dits when the speeds are equal, otherwise three times the stretched word gap). Characters with no Morse equivalent, including `%` and emoji, are skipped and do not add a gap. Procedural signals such as SK are not inferred from letter pairs.

The tone uses Web Audio and starts only after Start, Replay, Play, or Play text. Default volume is 20%. Mute and Stop silence it. Leaving the Morse section closes the audio context. There is no microphone, key, or transmitter. Speed, character speed, tone, and volume stay in the Morse section for both practice and pasted text, the same way those controls already do. They are not written to storage.

## Sources

Links and the verified-on date are in `app/utils/reference-sources.ts`. The page lists them. Data modules:

| File | Contents |
| --- | --- |
| `app/utils/phonetic-alphabet.ts` | Appendix 14 letters and figure code |
| `app/utils/q-signals.ts` | ITU-R M.1172 question and statement |
| `app/utils/amateur-bands.ts` | Part 97 segments, footnotes, chart layout |
| `app/utils/morse-code.ts` | ITU-R M.1677-1 characters, Farnsworth timing, pasted-text scheduling, scoring |
| `app/utils/morse-audio.ts` | Web Audio player |

## Updating the band chart

1. Read the current eCFR text for §§ 97.301, 97.303, 97.305, 97.307, and 97.313, and § 2.106 when a sharing footnote changes.
2. Edit segments in `app/utils/amateur-bands.ts`. Keep ranges half-open: the FCC upper edge is `endHz`, and the next segment starts there. Do not overlap a class’s own spans.
3. Put a tighter power limit or a geographic limit on the segment, and add a footnote whose text matches the rule. If painting the bar would overstate access, say so in `blurb` and keep the exception out of the default bars.
4. Set `REFERENCE_VERIFIED_ON` in `app/utils/reference-sources.ts`.
5. Extend `test/unit/amateur-bands.test.ts` for the edge you changed: contiguous ranges, gaps, 60 m channels, Novice versus Technician, and any exception that must not look universal.
6. Run `yarn test:unit`, `yarn lint`, and `yarn build`.

Do not copy an ARRL chart image or a third-party privilege table into the repo. Confirm each external URL still resolves before changing it.
