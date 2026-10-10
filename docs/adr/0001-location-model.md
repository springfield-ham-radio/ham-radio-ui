# Location model (GeoPoint, SQLite, GeoJSON boundaries)

**Status:** accepted  
**Date:** 2026-10-10

## Context

HamBench stores operator sites, channel library rows, and log contacts in different shapes (grid, point, or both). Helpers for DMS, distance, and grids lived beside Maidenhead encode/decode. Callook returns latitude and longitude as strings. Repeater imports could persist blank coordinates as `0`, so every row sat at Null Island until distance sorting (#59, #82) defined a single unlocated rule and migration 13 cleared existing `(0, 0)` pairs in `saved_channels`.

We need one canonical in-memory point, consistent SQLite columns, GeoJSON only at map and import/export edges, and shared formatting so UI and imports do not reimplement rules.

## Decision

**Canonical point.** `GeoPoint` is `{ latitude, longitude }` in signed decimal degrees, WGS84. The interface lives in `app/utils/maidenhead.ts` (grid math and `haversineDistanceKm` stay there).

**SQLite.** Store locations as nullable `latitude REAL` and `longitude REAL`. Never blobs, strings, or GeoJSON in the database. Missing coordinates are `NULL`. In application code, absent values are `undefined`. The exact pair `(0, 0)` is **unlocated** (not a real repeater position). A single `0` on one axis remains valid (equator or prime meridian).

**GeoJSON.** Use RFC 7946 Point geometry only at boundaries (map layers, external geocoders, import/export). Coordinates are `[longitude, latitude]`. Do not persist GeoJSON or add spatial extensions or indexes.

**Shared module.** All formatting and conversion go through `app/utils/location-format.ts` instead of ad-hoc helpers:

| Area | API (representative) |
| --- | --- |
| Decimal degrees | `formatDecimalDegrees`, `parseDecimalDegrees` |
| DMS | `decimalDegreesToDms`, `dmsToDecimalDegrees`, `parseDmsInput`, `formatLatitude`, `formatLongitude`, `emptyDmsInput`, `dmsInputFromDecimal` |
| Maidenhead (4/6 char) | `pointToMaidenhead`, `maidenheadToPoint` (encode/decode remains in `maidenhead.ts`) |
| Distance / bearing | `distanceKm` (wraps `haversineDistanceKm`), `initialBearingDegrees`, `compassPoint`, `compassPointBetween` |
| GeoJSON | `geoJsonPoint`, `geoJsonFeature`, `pointFromGeoJsonPoint` |
| Located vs unlocated | `isLocated`, `locatedPoint`, `parseLocatedPoint` |

DMS symbols remain re-exported from `maidenhead.ts` for backward-compatible imports. Channel pair normalization uses `locatedPoint` via `coordinatesFromPair` in `saved-channels-db.ts`. Callook parses lat/lon strings at the client in `callook.ts`. Per-entity storage (station grid + point + `locationSource`, channel point only, QSO grid only) is summarized in `docs/location.md`.

## Consequences

- New location display, parsing, distance, or bearing logic should call `location-format.ts` (or the `maidenhead.ts` re-exports for DMS only), not duplicate range checks or Null Island handling.
- Map code must keep longitude-first GeoJSON; tests in `test/unit/location-format.test.ts` guard axis order.
- Maidenhead **field** (2-character) locators stay on `maidenheadToLatLon`; `maidenheadToPoint` accepts 4- and 6-character squares only.
- Optional QSO lat/lon (#81) and API types (ham-radio-api #19) should extend the same `GeoPoint` and column pattern rather than introducing a second model.
- Repeater library location column work (#57, #83) should reuse `locatedPoint` / `isLocated` when touching coordinates.

## Related

- ham-radio-ui [#57](https://github.com/springfield-ham-radio/ham-radio-ui/issues/57), [#59](https://github.com/springfield-ham-radio/ham-radio-ui/issues/59), [#80](https://github.com/springfield-ham-radio/ham-radio-ui/issues/80), [#81](https://github.com/springfield-ham-radio/ham-radio-ui/issues/81), [#83](https://github.com/springfield-ham-radio/ham-radio-ui/issues/83)
- ham-radio-api [#19](https://github.com/springfield-ham-radio/ham-radio-api/issues/19)
