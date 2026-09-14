import { describe, it } from 'node:test';
import { expect } from 'chai';
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
      expect(PROPAGATION_BANDS.map((band) => band.id)).to.deep.equal([
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
      expect(isDaylightHour(6)).to.equal(true);
      expect(isDaylightHour(12)).to.equal(true);
      expect(isDaylightHour(17)).to.equal(true);
      expect(isDaylightHour(5)).to.equal(false);
      expect(isDaylightHour(18)).to.equal(false);
      expect(isDaylightHour(0)).to.equal(false);
    });
  });

  describe('currentClockHour', () => {
    it('should return local or UTC hour from the same instant', () => {
      // 2026-09-14T00:30:00.000Z → 00 UTC; America/Chicago would be previous evening.
      const instant = new Date('2026-09-14T00:30:00.000Z');

      expect(currentClockHour('utc', instant)).to.equal(0);
      expect(currentClockHour('local', instant)).to.equal(instant.getHours());
    });
  });

  describe('rateBand', () => {
    it('should open 10 m by day when SFI is high and K is quiet', () => {
      const day = rateBand('10m', { solarFlux: 180, kIndex: 1, hour: 12 });
      const night = rateBand('10m', { solarFlux: 180, kIndex: 1, hour: 22 });

      expect(ratingRank(day)).to.be.at.least(ratingRank('good'));
      expect(ratingRank(night)).to.be.lessThan(ratingRank(day));
    });

    it('should keep 10 m closed or poor when SFI is low', () => {
      const day = rateBand('10m', { solarFlux: 70, kIndex: 1, hour: 12 });
      expect(ratingRank(day)).to.be.at.most(ratingRank('poor'));
    });

    it('should prefer 80 m at night over midday', () => {
      const night = rateBand('80m', { solarFlux: 100, kIndex: 2, hour: 22 });
      const day = rateBand('80m', { solarFlux: 100, kIndex: 2, hour: 12 });

      expect(ratingRank(night)).to.be.greaterThan(ratingRank(day));
    });

    it('should make 20 m a daytime workhorse at moderate SFI', () => {
      const day = rateBand('20m', { solarFlux: 120, kIndex: 2, hour: 14 });
      expect(ratingRank(day)).to.be.at.least(ratingRank('fair'));
    });

    it('should collapse high bands when K is severe', () => {
      const quiet = rateBand('15m', { solarFlux: 160, kIndex: 1, hour: 12 });
      const storm = rateBand('15m', { solarFlux: 160, kIndex: 7, hour: 12 });

      expect(ratingRank(storm)).to.be.lessThan(ratingRank(quiet));
      expect(ratingRank(storm)).to.be.at.most(ratingRank('poor'));
    });

    it('should keep 6 m closed unless SFI is high in daylight', () => {
      expect(rateBand('6m', { solarFlux: 100, kIndex: 1, hour: 12 })).to.equal('closed');
      expect(ratingRank(rateBand('6m', { solarFlux: 200, kIndex: 1, hour: 12 }))).to.be.at.least(ratingRank('poor'));
      expect(rateBand('6m', { solarFlux: 200, kIndex: 1, hour: 22 })).to.equal('closed');
    });
  });

  describe('buildDayNightTable', () => {
    it('should return day and night ratings for every band', () => {
      const table = buildDayNightTable({ solarFlux: 140, kIndex: 2 });

      expect(table).to.have.length(PROPAGATION_BANDS.length);
      expect(table[0]).to.include.keys('bandId', 'label', 'day', 'night');
      expect(table.find((row) => row.bandId === '40m')?.night).to.be.a('string');
    });
  });

  describe('buildHourlyBandGrid', () => {
    it('should rate every band for hours 0–23', () => {
      const grid = buildHourlyBandGrid({ solarFlux: 130, kIndex: 2 });

      expect(grid.hours).to.deep.equal([...Array(24).keys()]);
      expect(grid.rows).to.have.length(PROPAGATION_BANDS.length);
      expect(grid.rows[0]?.ratings).to.have.length(24);
      expect(grid.rows.find((row) => row.bandId === '20m')?.ratings[14]).to.be.oneOf([
        'closed',
        'poor',
        'fair',
        'good',
        'excellent',
      ]);
    });

    it('should keep columns in local-hour order with day better than night on 10 m', () => {
      const grid = buildHourlyBandGrid({ solarFlux: 160, kIndex: 1 });
      const ten = grid.rows.find((row) => row.bandId === '10m')!;

      expect(ratingRank(ten.ratings[12]!)).to.be.greaterThan(ratingRank(ten.ratings[22]!));
    });
  });

  describe('displayHourForLocalHour', () => {
    it('should leave local labels unchanged', () => {
      expect(displayHourForLocalHour(12, 'local', { timezoneOffsetMinutes: 300 })).to.equal(12);
    });

    it('should convert local columns to UTC labels without moving the chart', () => {
      // UTC-5: local noon → 17 UTC; local 22:00 → 03 UTC.
      const offsetMinutes = 300;

      expect(displayHourForLocalHour(12, 'utc', { timezoneOffsetMinutes: offsetMinutes })).to.equal(17);
      expect(displayHourForLocalHour(22, 'utc', { timezoneOffsetMinutes: offsetMinutes })).to.equal(3);
    });
  });
});
