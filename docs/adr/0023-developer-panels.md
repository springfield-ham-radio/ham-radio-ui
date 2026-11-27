# Developer panel preferences

**Status:** proposed  
**Date:** 2026-11-24  
**Related:** [0021](./0021-menu-capture-session.md), [0013](./0013-first-run-onboarding-stepper.md)

## Context

Radio cards exposed Driver, Hex Dump, Debug, and Sniffer tabs to every operator. The main **Driver** module editor lived behind a separate **View → Developer Mode** menu check item (`ham-radio-developer-mode`). PR 238 added a single **Developer tools** switch (`ham-radio-developer-tools`) for menu capture on the radio Driver tab. That split was hard to discover and did not hide the other developer-oriented card tabs.

## Decision

- **Preferences → Developer** has six independent switches, all **off by default** for new installs:
  1. **Driver development** — main header **Driver** tab and `/driver` module editor (replaces View-menu developer mode).
  2. **Radio Driver tab** — radio-card **Driver** tab (protocol inspector; **Menu capture** pill whenever this tab is on).
  3. **Radio Hex Dump tab**
  4. **Radio Debug tab**
  5. **Radio Sniffer tab**
  6. **Raw log** — APRS sub-tab only (serial reply, byte counters, and decoded lines). Not a radio-card tab. Capture in the host session and the decoded-line fold keeps running while the sub-tab is hidden. The Packet **Monitor** and **Terminal** panes are not this switch.
- Persist as JSON in `ham-radio-developer-panels`. Only explicit `true` turns a field on.
- **One-time migration** when the JSON key is absent: `ham-radio-developer-mode === "1"` → `driverDevelopment`; `ham-radio-developer-tools === "1"` → `radioDriver`; other fields stay off. Write JSON immediately (including all-false). Legacy keys remain in localStorage but are not read after JSON exists.
- Remove **View → Developer Mode** from the Tauri menu and drop `set_developer_mode` / `developer-mode-changed`.
- When a hidden tab is active, fall back to **Channels** on that card. Hiding the radio Driver tab unmounts menu capture but **does not** release an active menu-capture port hold until the session ends or is discarded.
- **CAT**, **APRS**, and **Packet** stay capability tabs (unchanged). The **Raw log** preference only adds or removes the APRS sub-tab inside **APRS**. Clone **Read from Radio** / **Write to Radio** stay on the card toolbar and **Radio** menu regardless of these switches.

## Consequences

- Upgraded profiles lose visible developer card tabs and the APRS Raw log sub-tab unless they enable switches in Preferences (legacy flags migrate only mode → development and tools → radio Driver; **Raw log** stays off).
- Driver authors enable the panels they need; typical operators see Channels, Settings, CAT (when supported), and optional APRS/Packet.
- Browser sessions use Preferences only; there is no native menu shortcut for Driver development.