# Propagation

Propagation is a live HF conditions dashboard inside HamBench. It has two sections:

- **Solar activity** — current NOAA space-weather indices (10.7 cm solar flux, sunspot number, planetary A and K, GOES X-ray class), a 30-day SFI/SSN trend, and the WWV geomagnetic summary.
- **Band openings** — a day/night table and a 24-hour heatmap estimating which HF bands (plus 6 m) are more likely open from those indices and local time.

This is a WWV-style rule-of-thumb chart, **not** a VOACAP path forecast and **not** a live spot map.

## Open the page

Use the **Propagation** tab in the header, between Log and WaveBench.

## Data sources

Solar indices are **measured**. HamBench fetches three NOAA SWPC products:

- [WWV geophysical alert](https://services.swpc.noaa.gov/text/wwv.txt) — current SFI, planetary A, planetary K, storm summary
- [Daily solar indices](https://services.swpc.noaa.gov/text/daily-solar-indices.txt) — last 30 days of SFI and sunspot number
- [GOES X-rays](https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json) — latest 0.1–0.8 nm flux → A/B/C/M/X class

Refresh reloads those products. Results are cached for the browser session so switching tabs does not re-hit NOAA until you press Refresh.

Band openings are **estimated locally** from SFI, K, and the hour. There is no official “20 m is open now” feed.

## Band estimates

Rated bands: 160, 80, 40, 30, 20, 17, 15, 12, 10, and 6 m. Ratings are `closed`, `poor`, `fair`, `good`, or `excellent`.

Rules of thumb:

- Low bands (160/80/40) prefer night
- 20 m is often the daytime workhorse; night depends on SFI
- 15/12/10 need higher SFI and daylight
- 6 m stays closed unless SFI is high in daylight
- K ≥ 5 drops ratings; K ≥ 7 collapses HF toward poor/closed

The 24-hour chart columns are always ordered in **local** time (day/night stays put). Switch **Local / UTC** to change only the hour labels; tooltips still show both clocks. The “now” column follows local time. Daylight in the heuristic is a fixed 06–17 local window — it does not yet use the operator gridsquare for true solar time. VHF/UHF FM bands (2 m / 70 cm) are not rated from solar data.

The band chart always uses the current live WWV SFI and K. The SFI/SSN sparkline shows the full NOAA daily-indices window (about 30 days).

## What this model leaves out

Point-to-point MUF, absorbption maps, live PSK Reporter / RBN spots, tropo, and sporadic-E. Those can be later surfaces; this page’s job is the WWV dashboard.
