# Antennas

HamBench keeps **stations** (operating sites) and the **antennas** at each site in Preferences. Propagation can use that owned list or a scratch **what-if** that is not saved until you add it to the selected station.

This is not a commercial catalog and not a globe forecast. Types are dipole, inverted-V, quarter-wave vertical, 3-element Yagi, magnetic loop, end-fed, dual-band VHF/UHF vertical, 2 m Yagi, and 70 cm Yagi. Gain, beamwidth, and takeoff are catalog estimates from type plus height.

## Preferences

**Preferences → Stations**. Existing `?section=antennas` links still open this page.

### Stations

A station is a site (Home, Cabin, Portable), not a log `STATION_CALLSIGN`. Each station lists the antennas installed there. **Add station** / **Edit** opens a slideover:

- **Nickname** — required
- **Maidenhead grid** — optional 2-, 4-, or 6-character locator. Editing the grid sets latitude and longitude to the **cell center**
- **Latitude / longitude** — optional degrees, minutes, and decimal seconds with N/S and E/W. Editing coordinates keeps that point and derives a **6-character** grid

Location can stay empty until you need it (later map work). HamBench does not treat the FCC mailing-address grid as the shack. If Home has no grid and no coordinates, a Callook **license** gridsquare is copied in as a starting point and remains editable.

You cannot delete the last station. Removing a station also removes the antennas assigned to it. The same physical antenna at two sites is two records.

### Antennas

Antennas sit under the station they belong to. **Add antenna** on a site opens a slideover already assigned to that site. **Station** in the editor can move it.

- **Station** — the site where it is installed
- **Nickname** — optional; empty uses the type label
- **Type** — one of the built-in families
- **Height AGL** — meters, 0.5–120
- **Heading** — true degrees of maximum radiation, 0–359. Hidden for omni types (HF vertical, magloop, dual-band vertical). For a Yagi this is the boom; for a dipole it is the broadside
- **Bands** — 160 m through 70 cm. Empty uses the type defaults (for example a HF Yagi starts as 20 / 15 / 10 m; a dual-band vertical starts as 2 m / 70 cm)
- **Traps** — dipoles, inverted-Vs, and HF Yagis. LC traps isolate the inner sections on the higher bands (80/40 traps at 40 m; a 20/15/10 tribander traps at 15 m and 10 m). Leave off for a fan or parallel-wire dipole. Turning traps on with one HF band adds the next-lower band. Catalog gain is 0.5 dBi lower when traps are on. The 3-element Yagi starts trapped.

The list is stored in browser localStorage (`ham-radio-station-antennas`). Older payloads that only had a flat antenna list are migrated onto a **Home** station. It is not a radio module and is not synced to GitHub.

## Propagation

The **Antenna** card sits above solar indices.

- **Station** — which site. Location is shown as grid plus degrees / minutes / seconds when set
- **Owned** — pick an antenna at that site. Geometry, peak gain / beam, and an estimated takeoff angle are shown
- **What-if** — change type, height, heading, bands, and traps without touching Preferences. **Add to station** saves a copy named `What-if …` onto the selected site and switches back to Owned

Takeoff is a rule of thumb from type and height in wavelengths. For HF it is a hint for later skip rings. For 2 m / 70 cm only, the card notes line-of-sight (and tropo) instead of HF skip. It is not an EZNEC plot or a VOACAP path. The WWV openings chart still rates only HF plus 6 m.

## What this cut leaves out

Manufacturer SKUs, NEC patterns, a world globe, and path reliability. Those can layer on the same station / owned / what-if records.
