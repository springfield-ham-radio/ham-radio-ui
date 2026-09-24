import { describe, expect, it } from 'vitest';
import {
  PROPAGATION_BANDS,
  buildDayNightTable,
  buildHourlyBandGrid,
  currentClockHour,
  displayHourForLocalHour,
  isDaylightHour,
  rateBand,
  ratingRank,
} from '../../app/utils/propagation-bands.ts';

describe('propagation-bands', () => {
  describe('PROPAGATION_BANDS', () => {
    it('should cover HF plus 6 m and exclude VHF/UHF FM bands', () => {
      expect(PROPAGATION_BANDS.map((band) => band.id)).toEqual([
        '160m',
        '80m',
        '40m',
        '30m',
        '20m',
        '17m',
        '15m',
        '12m',
        '10m',
        '6m',
      ]);
    });
  });

  describe('isDaylightHour', () => {
    it('should treat 06–17 local as day and the rest as night', () => {
      expect(isDaylightHour(6)).toBe(true);
      expect(isDaylightHour(12)).toBe(true);
      expect(isDaylightHour(17)).toBe(true);
      expect(isDaylightHour(5)).toBe(false);
      expect(isDaylightHour(18)).toBe(false);
      expect(isDaylightHour(0)).toBe(false);
    });
  });

  describe('currentClockHour', () => {
    it('should return local or UTC hour from the same instant', () => {
      // 2026-09-14T00:30:00.000Z → 00 UTC; America/Chicago would be previous evening.
      const instant = new Date('2026-09-14T00:30:00.000Z');

      expect(currentClockHour('utc', instant)).toBe(0);
      expect(currentClockHour('local', instant)).toBe(instant.getHours());
    });
  });

  describe('rateBand', () => {
    it('should open 10 m by day when SFI is high and K is quiet', () => {
      const day = rateBand('10m', { solarFlux: 180, kIndex: 1, hour: 12 });
      const night = rateBand('10m', { solarFlux: 180, kIndex: 1, hour: 22 });

      expect(ratingRank(day)).toBeGreaterThanOrEqual(ratingRank('good'));
      expect(ratingRank(night)).toBeLessThan(ratingRank(day));
    });

    it('should keep 10 m closed or poor when SFI is low', () => {
      const day = rateBand('10m', { solarFlux: 70, kIndex: 1, hour: 12 });
      expect(ratingRank(day)).toBeLessThanOrEqual(ratingRank('poor'));
    });

    it('should prefer 80 m at night over midday', () => {
      const night = rateBand('80m', { solarFlux: 100, kIndex: 2, hour: 22 });
      const day = rateBand('80m', { solarFlux: 100, kIndex: 2, hour: 12 });

      expect(ratingRank(night)).toBeGreaterThan(ratingRank(day));
    });

    it('should make 20 m a daytime workhorse at moderate SFI', () => {
      const day = rateBand('20m', { solarFlux: 120, kIndex: 2, hour: 14 });
      expect(ratingRank(day)).toBeGreaterThanOrEqual(ratingRank('fair'));
    });

    it('should collapse high bands when K is severe', () => {
      const quiet = rateBand('15m', { solarFlux: 160, kIndex: 1, hour: 12 });
      const storm = rateBand('15m', { solarFlux: 160, kIndex: 7, hour: 12 });

      expect(ratingRank(storm)).toBeLessThan(ratingRank(quiet));
      expect(ratingRank(storm)).toBeLessThanOrEqual(ratingRank('poor'));
    });

    it('should keep 6 m closed unless SFI is high in daylight', () => {
      expect(rateBand('6m', { solarFlux: 100, kIndex: 1, hour: 12 })).toBe('closed');
      expect(ratingRank(rateBand('6m', { solarFlux: 200, kIndex: 1, hour: 12 }))).toBeGreaterThanOrEqual(ratingRank('poor'));
      expect(rateBand('6m', { solarFlux: 200, kIndex: 1, hour: 22 })).toBe('closed');
    });
  });

  describe('buildDayNightTable', () => {
    it('should return day and night ratings for every band', () => {
      const table = buildDayNightTable({ solarFlux: 140, kIndex: 2 });

      expect(table).toHaveLength(PROPAGATION_BANDS.length);
      expect(table[0]).toEqual(expect.objectContaining({ bandId: expect.anything(), label: expect.anything(), day: expect.anything(), night: expect.anything() }));
      expect(table.find((row) => row.bandId === '40m')?.night).toBeTypeOf('string');
    });
  });

  describe('buildHourlyBandGrid', () => {
    it('should rate every band for hours 0–23', () => {
      const grid = buildHourlyBandGrid({ solarFlux: 130, kIndex: 2 });

      expect(grid.hours).toEqual([...Array(24).keys()]);
      expect(grid.rows).toHaveLength(PROPAGATION_BANDS.length);
      expect(grid.rows[0]?.ratings).toHaveLength(24);
      expect(['closed', 'poor', 'fair', 'good', 'excellent']).toContain(
        grid.rows.find((row) => row.bandId === '20m')?.ratings[14],
      );
    });

    it('should keep columns in local-hour order with day better than night on 10 m', () => {
      const grid = buildHourlyBandGrid({ solarFlux: 160, kIndex: 1 });
      const ten = grid.rows.find((row) => row.bandId === '10m')!;

      expect(ratingRank(ten.ratings[12]!)).toBeGreaterThan(ratingRank(ten.ratings[22]!));
    });
  });

  describe('displayHourForLocalHour', () => {
    it('should leave local labels unchanged', () => {
      expect(displayHourForLocalHour(12, 'local', { timezoneOffsetMinutes: 300 })).toBe(12);
    });

    it('should convert local columns to UTC labels without moving the chart', () => {
      // UTC-5: local noon → 17 UTC; local 22:00 → 03 UTC.
      const offsetMinutes = 300;

      expect(displayHourForLocalHour(12, 'utc', { timezoneOffsetMinutes: offsetMinutes })).toBe(17);
      expect(displayHourForLocalHour(22, 'utc', { timezoneOffsetMinutes: offsetMinutes })).toBe(3);
    });
  });
});
