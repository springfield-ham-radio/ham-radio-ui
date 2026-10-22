# Icons in radio modules

HamBench runs offline. Nuxt Icon uses provider `none` and does not call the Iconify API, so a module icon renders only when that glyph was bundled with the app. The source scan covers app code. It does not see JSON shipped inside an installed radio module.

## How to name an icon

Set `icon` to an `i-lucide-<name>` value from the list below. Settings groups use this field today. Any other module `icon` field uses the same set.

```json
{ "id": "transmit", "label": "Transmit", "icon": "i-lucide-radio-tower" }
```

An empty `icon`, or a name that is not in this set, is shown as `i-lucide-sliders-horizontal`. The module file can keep the original string. The Driver editor warns on a settings group whose name is outside the set, and the Settings tab still shows the default icon instead of a blank.

Only this Lucide set is bundled for modules. A name from another collection, such as `i-mdi-radio`, is shown as the default icon. Bundled module JSON that uses a name outside the set fails `test/unit/module-icons.test.ts`.

## Icons already used by current modules

These names come from the settings groups in [radio-module-kenwood](https://github.com/springfield-ham-radio/radio-module-kenwood) (`th-f6-settings.json`, `th-d74-settings.json`, `tm-d710a-settings.json`) and [radio-module-baofeng](https://github.com/springfield-ham-radio/radio-module-baofeng) (`uv5r-settings.json`):

- `i-lucide-battery-medium` — TH-F6 Power Save
- `i-lucide-cloud` — TM-D710 sky
- `i-lucide-database` — memory
- `i-lucide-ellipsis` — UV-5R other
- `i-lucide-folder` — TH-D74 groups
- `i-lucide-gauge` — TM-D710 VFO
- `i-lucide-hash` — DTMF
- `i-lucide-keyboard` — TM-D710 keys
- `i-lucide-layers` — TM-D710 bands
- `i-lucide-layout-dashboard` — TH-F6 Main
- `i-lucide-map-pinned` — TM-D710 APRS
- `i-lucide-monitor` — Display
- `i-lucide-radio-tower` — Transmit
- `i-lucide-repeat-2` — TM-D710 repeater
- `i-lucide-settings-2` — UV-5R advanced
- `i-lucide-sliders-horizontal` — basic settings, and the default when a name is missing
- `i-lucide-unplug` — Auxiliary
- `i-lucide-volume-2` — Audio
- `i-lucide-waypoints` — UV-5R work mode
- `i-lucide-wrench` — UV-5R service

## Allowed set

A module may use any name in this list without a new HamBench release. Adding a Lucide icon that is not listed requires a change to `MODULE_LUCIDE_ICONS` in `app/utils/module-icons.ts`, a matching entry on this page, and an app release. The unit test `test/unit/module-icons.test.ts` fails when this page, the constant, and bundled module JSON disagree, and when a listed name is missing from `@iconify-json/lucide`.

### Layout and display

- `i-lucide-a-large-small`
- `i-lucide-contrast`
- `i-lucide-eye`
- `i-lucide-eye-off`
- `i-lucide-flashlight`
- `i-lucide-lamp`
- `i-lucide-languages`
- `i-lucide-layout-dashboard`
- `i-lucide-lightbulb`
- `i-lucide-monitor`
- `i-lucide-monitor-smartphone`
- `i-lucide-moon`
- `i-lucide-palette`
- `i-lucide-smartphone`
- `i-lucide-sun`
- `i-lucide-sun-medium`
- `i-lucide-tablet`
- `i-lucide-type`

### Power

- `i-lucide-battery`
- `i-lucide-battery-charging`
- `i-lucide-battery-full`
- `i-lucide-battery-low`
- `i-lucide-battery-medium`
- `i-lucide-battery-warning`
- `i-lucide-leaf`
- `i-lucide-plug`
- `i-lucide-plug-zap`
- `i-lucide-power`
- `i-lucide-power-off`
- `i-lucide-unplug`
- `i-lucide-zap`

### Audio

- `i-lucide-audio-lines`
- `i-lucide-audio-waveform`
- `i-lucide-bell`
- `i-lucide-bell-off`
- `i-lucide-headphones`
- `i-lucide-mic`
- `i-lucide-mic-off`
- `i-lucide-music`
- `i-lucide-podcast`
- `i-lucide-speaker`
- `i-lucide-volume`
- `i-lucide-volume-1`
- `i-lucide-volume-2`
- `i-lucide-volume-off`
- `i-lucide-volume-x`

### Radio

- `i-lucide-antenna`
- `i-lucide-bluetooth`
- `i-lucide-cable`
- `i-lucide-ethernet-port`
- `i-lucide-radar`
- `i-lucide-radio`
- `i-lucide-radio-receiver`
- `i-lucide-radio-tower`
- `i-lucide-rss`
- `i-lucide-satellite`
- `i-lucide-satellite-dish`
- `i-lucide-signal`
- `i-lucide-signal-high`
- `i-lucide-signal-low`
- `i-lucide-signal-medium`
- `i-lucide-signal-zero`
- `i-lucide-usb`
- `i-lucide-waves`
- `i-lucide-wifi`
- `i-lucide-wifi-off`

### Location and sky

- `i-lucide-cloud`
- `i-lucide-cloud-rain`
- `i-lucide-cloud-sun`
- `i-lucide-compass`
- `i-lucide-earth`
- `i-lucide-globe`
- `i-lucide-locate`
- `i-lucide-locate-fixed`
- `i-lucide-map`
- `i-lucide-map-pin`
- `i-lucide-map-pinned`
- `i-lucide-mountain`
- `i-lucide-navigation`
- `i-lucide-waypoints`
- `i-lucide-wind`

### Memory and data

- `i-lucide-binary`
- `i-lucide-bookmark`
- `i-lucide-circuit-board`
- `i-lucide-cpu`
- `i-lucide-database`
- `i-lucide-file-text`
- `i-lucide-folder`
- `i-lucide-folder-open`
- `i-lucide-grid-3x3`
- `i-lucide-hard-drive`
- `i-lucide-hash`
- `i-lucide-layers`
- `i-lucide-list`
- `i-lucide-memory-stick`
- `i-lucide-microchip`
- `i-lucide-network`
- `i-lucide-save`
- `i-lucide-server`
- `i-lucide-table`

### Controls

- `i-lucide-cog`
- `i-lucide-copy`
- `i-lucide-ellipsis`
- `i-lucide-filter`
- `i-lucide-gauge`
- `i-lucide-info`
- `i-lucide-keyboard`
- `i-lucide-menu`
- `i-lucide-more-horizontal`
- `i-lucide-refresh-cw`
- `i-lucide-repeat`
- `i-lucide-repeat-2`
- `i-lucide-rotate-ccw`
- `i-lucide-scan`
- `i-lucide-scan-search`
- `i-lucide-search`
- `i-lucide-settings`
- `i-lucide-settings-2`
- `i-lucide-sliders-horizontal`
- `i-lucide-sliders-vertical`
- `i-lucide-toggle-left`
- `i-lucide-toggle-right`
- `i-lucide-wrench`

### Status and tools

- `i-lucide-badge`
- `i-lucide-bug`
- `i-lucide-circle-alert`
- `i-lucide-key`
- `i-lucide-key-round`
- `i-lucide-lock`
- `i-lucide-printer`
- `i-lucide-puzzle`
- `i-lucide-ruler`
- `i-lucide-shield`
- `i-lucide-shield-alert`
- `i-lucide-siren`
- `i-lucide-triangle-alert`
- `i-lucide-unlock`

### Time

- `i-lucide-alarm-clock`
- `i-lucide-calendar`
- `i-lucide-clock`
- `i-lucide-hourglass`
- `i-lucide-timer`

### Communication and travel

- `i-lucide-activity`
- `i-lucide-arrow-down-to-line`
- `i-lucide-arrow-left-right`
- `i-lucide-arrow-up-from-line`
- `i-lucide-briefcase`
- `i-lucide-car`
- `i-lucide-crosshair`
- `i-lucide-mail`
- `i-lucide-message-square`
- `i-lucide-phone`
- `i-lucide-share-2`
- `i-lucide-thermometer`
- `i-lucide-truck`
- `i-lucide-users`
