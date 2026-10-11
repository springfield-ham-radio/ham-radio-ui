# Map basemap (MapLibre GL and OpenFreeMap)

**Status:** accepted  
**Date:** 2026-10-11  
**Related:** [#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83), [0001-location-model.md](./0001-location-model.md)

## Context

HamBench already ships MapLibre GL for the station log map and the map-style preference preview. The channel library needs a repeater map that follows the same tiles, attribution, and offline behavior without adding a second mapping engine or bundling tile data in the desktop app.

## Decision

- **Renderer:** MapLibre GL (`maplibre-gl`, already in the app). Vue components own the map lifecycle (`new Map`, worker URL, `ResizeObserver`, style reload). Pure GeoJSON helpers live in `app/utils/channel-map.ts`.
- **Basemap:** OpenFreeMap vector styles from `https://tiles.openfreemap.org`, selected through `useAppearanceSettings().mapStyle` and the app color mode (Liberty in light mode, Dark in dark mode). No API key.
- **Attribution:** `AttributionControl` with `compact: false` stays visible on every map surface.
- **Clustering:** Native GeoJSON source clustering (`cluster: true`, `clusterRadius` 50, `clusterMaxZoom` 12) for repeater markers.
- **Offline / style failure:** Swap to an empty MapLibre style (background layer only), show “The map could not be loaded. Check your connection.”, and keep markers on the canvas. Do not add a second tile provider.
- **CSP (future):** If content security policy is tightened, allow `connect-src` and `img-src` for `https://tiles.openfreemap.org` and `worker-src 'self' blob:` for the bundled MapLibre worker.
- **Dependencies:** No new map packages. Reuse `stationLogMapStyleUrl` / OpenFreeMap URLs from `app/utils/station-log-map.ts`.

GeoPoint and unlocated rules remain in [0001-location-model.md](./0001-location-model.md); map code uses `locatedPoint` and `geoJsonFeature` at the GeoJSON boundary only.

## Consequences

- Phase 2 can share the same basemap decision for a global Map tab; extracting a shared map shell component is deferred until after the Channels map ships.
- Turn-by-turn routing and RF coverage are out of scope; trip lines (phase 2) are straight segments in distance order, not road geometry.
- Operators need network access for the vector basemap; markers and range rings still render on the empty style when tiles are unavailable.
