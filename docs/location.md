# Location

The in-memory point is `GeoPoint`: `{ latitude, longitude }` in signed decimal degrees, WGS84. The type is declared in `app/utils/maidenhead.ts`. SQLite stores that pair as two `REAL` columns. The database does not store GeoJSON, and it has no spatial extension or index.

GeoJSON `Point` coordinates are `[longitude, latitude]` (RFC 7946). HamBench builds them only for a map or an external API.

Maidenhead is a display and exchange format. It is stored only on records that already exchange a grid. Formatting, distance, bearing, and the unlocated rule live in `app/utils/location-format.ts`. Grid encode and decode stay in `app/utils/maidenhead.ts`.

Blank coordinates are absent (`undefined` in memory, `NULL` in SQLite). The exact pair `(0, 0)` is unlocated. A single `0` is still a real latitude or longitude.

## What each record stores

| Record | Stored location | Notes |
| --- | --- | --- |
| Station | Grid, point, and `locationSource` | `grid` or `coordinates` on the station record in browser storage. A grid edit saves the cell center. A coordinate edit saves the point and a 6-character grid. |
| Channel | Point only | `saved_channels.latitude` and `saved_channels.longitude` (migration 11). No grid column. |
| QSO | Grid only | `their_gridsquare` and `my_gridsquare`. Issue #81 may add an optional point. |
