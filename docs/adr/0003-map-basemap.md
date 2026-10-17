# Map basemap (MapLibre GL and OpenFreeMap)

**Status:** accepted  
**Date:** 2026-10-11  
**Related:** [#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83), [0001-location-model.md](./0001-location-model.md)

## Context

HamBench already ships MapLibre GL for the station log map and the map-style preference preview. The channel library needs a repeater map that follows the same tiles, attribution, and offline behavior without adding a second mapping engine or bundling tile data in the desktop app.

## Decision

- **Renderer:** MapLibre GL (`maplibre-gl`, already in the app). `MapCanvas.vue` owns the worker URL and `new Map`; consumers add sources and layers. Pure GeoJSON helpers live in `app/utils/channel-map.ts` and related modules.
- **Basemap:** OpenFreeMap vector styles from `https://tiles.openfreemap.org`, selected through `useAppearanceSettings().mapStyle` and the app color mode (Liberty in light mode, Dark in dark mode). No API key. The public instance states no cap on interactive map views or tile requests; the service is as-is and may change without notice. Offline area downloads (not implemented here) are limited on OpenFreeMap to 3,000 tiles or 50 MB per download, at most four parallel requests, and a unique User-Agent identifying the app.
- **Custom style URL:** Appearance settings may store an optional `customMapStyleUrl` in `ham-radio-appearance`. Only `https:` URLs are accepted (`parseCustomMapStyleUrl`). Blank or invalid values use the named OpenFreeMap style. `resolveMapStyleUrl` is the single function that turns preference, color mode, and custom URL into the string passed to MapLibre (`MapCanvas`, log map, Channels map, style preview).
- **Licensing:** HamBench stays MIT. Map data is OpenStreetMap (ODbL). OpenFreeMap styles carry OpenMapTiles / OSM attribution; MapLibre’s `AttributionControl` with `compact: false` stays visible on every map surface so those credits remain on screen. Do not use OSM Foundation tile endpoints (`tile.openstreetmap.org`, `vector.openstreetmap.org`) for application traffic; their usage policy forbids heavy use, bulk download, and unreliable User-Agent / Referer in Tauri webviews.
- **Clustering:** Native GeoJSON source clustering (`cluster: true`, `clusterRadius` 50, `clusterMaxZoom` 12) for repeater markers on the Map tab and the Channels map, and for contact markers where applicable.
- **Map tab (phase 2):** Route `/map` with `MapCanvas` and `offlineFallback`. Repeater layer uses one GeoJSON source (`map-repeaters`) and the same cluster settings as the Channels map. Station-log contacts use source `map-contacts` with the same cluster settings; stored QSO coordinates plot at that point (`locationKind: coordinates`), otherwise markers use Maidenhead **grid centers** (`locationKind: grid-center`). `precisionLabel` is `Exact coordinates` or `field center · about 20° × 10°`, `square center · about 2° × 1°`, or `subsquare center · about 5′ × 2.5′` (`mapQsoLocationPrecisionLabel`). QSO rows are not embedded in GeoJSON; popups resolve calls from the in-memory log. Stations use source `map-stations`, are not clustered, and use the rose Home pin (`STATION_PIN_COLOR`) plus teal pins (`#0f766e`) with nicknames for other sites; popups list antennas at that station. Trip groups use source `map-trips` with dashed `LineString` features (`line-dasharray: [2, 2]`) and matching `Point` stop markers through located members ordered by `orderTripMapStops` (nearest-neighbor from an endpoint farthest from the map trip start, then 2-opt) using `defaultDistanceStartId` / `stationStartPoint`; unlocated members are omitted. Layer toggles, group selection, and camera `{ longitude, latitude, zoom }` persist in `localStorage` key `ham-radio-map`. Restoring a saved camera on load replaces the initial fit; after that, data and group changes do not move the camera. **Fit** fits visible repeater, channel, contact, station, and trip-line features (`padding` 48, `maxZoom` 11). Library group selection filters repeaters, ordinary channels, and trip lines, not contacts or stations. The log map clusters contacts the same way and keeps its refit-on-data behavior and its non-fallback error path.
- **Offline / style failure:** Swap to an empty MapLibre style (background layer only) on surfaces with `offlineFallback`, show “The map could not be loaded. Check your connection.”, and keep markers on the canvas. Do not add a second tile provider as automatic fallback.
- **CSP (future):** If content security policy is tightened, allow `connect-src` and `img-src` for `https://tiles.openfreemap.org` and `worker-src 'self' blob:` for the bundled MapLibre worker. A custom style host is operator-specific and is not on that list until added.
- **Dependencies:** No new map packages. Named styles use `stationLogMapStyleUrl` / OpenFreeMap URLs from `app/utils/station-log-map.ts`.

GeoPoint and unlocated rules remain in [0001-location-model.md](./0001-location-model.md); map code uses `locatedPoint` and `geoJsonFeature` at the GeoJSON boundary only.

## Consequences

- The station log map, the Channels map, and the Map tab share `MapCanvas` and `resolveMapStyleUrl`.
- Turn-by-turn routing and RF coverage are out of scope; trip lines are straight segments through ordered stops, not road geometry.
- Operators need network access for the vector basemap unless they point **Custom style URL** at a style they host; markers and range rings still render on the empty style when tiles are unavailable.
