import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  fluxToXrayClass,
  parseDailySolarIndices,
  parseWwvAlert,
  selectLatestXrayFlux,
} from '../../app/utils/propagation-solar.ts';

const WWV_FIXTURE = `:Product: Geophysical Alert Message wwv.txt
:Issued: 2026 Sep 13 2105 UTC
# Prepared by the US Dept. of Commerce, NOAA, Space Weather Prediction Center
#
# Geophysical Alert Message
#
Solar-terrestrial indices for 13 September follow.
Solar flux 114 and estimated planetary A-index 8.
The estimated planetary K-index at 2100 UTC on 13 September was 0.33.

No space weather storms were observed for the past 24 hours.

No space weather storms are predicted for the next 24 hours.
`;

const DAILY_INDICES_FIXTURE = `:Product: Daily Solar Data DSD.txt
:Issued: 1425 UT 13 Sep 2026
#
# Prepared by the U.S. Dept. of Commerce, NOAA, Space Weather Prediction Center
#
# Last 30 Days Daily Solar Data
#
#                                                Sunspot       Stanford GOES15
#       Radio  SESC     Area          New     Coronal          X-Ray  ----- Flares -----
#       Flux  Sunspot  10E-6   Mean  Regions  Hole Bkgd        Flux   C  M  X  S  1  2  3
# Date  10.7cm Number  Hemis.  Field                  Flux
#---------------------------------------------------------------------------------------
2026 09 11  110   62   340      0     -999      *       2  0  0  4  0  0  0
2026 09 12  109   55   310      1     -999      *       1  0  0  2  0  0  0
2026 09 13  114   48   280      0     -999      *       3  0  0  5  0  0  0
`;

describe('propagation-solar', () => {
  describe('parseWwvAlert', () => {
    it('should extract SFI, A-index, K-index, issued time, and storm summary', () => {
      const parsed = parseWwvAlert(WWV_FIXTURE);

      expect(parsed.solarFlux).to.equal(114);
      expect(parsed.aIndex).to.equal(8);
      expect(parsed.kIndex).to.be.closeTo(0.33, 1e-9);
      expect(parsed.issuedAt).to.equal('2026 Sep 13 2105 UTC');
      expect(parsed.stormSummary).to.include('No space weather storms were observed');
      expect(parsed.stormSummary).to.include('No space weather storms are predicted');
    });

    it('should throw when the WWV body is missing required indices', () => {
      expect(() => parseWwvAlert('Solar flux only')).to.throw(/solar flux/i);
    });
  });

  describe('parseDailySolarIndices', () => {
    it('should parse the last 30 days of SFI and sunspot number', () => {
      const days = parseDailySolarIndices(DAILY_INDICES_FIXTURE);

      expect(days).to.have.length(3);
      expect(days[0]).to.deep.equal({ date: '2026-09-11', solarFlux: 110, sunspotNumber: 62 });
      expect(days[2]).to.deep.equal({ date: '2026-09-13', solarFlux: 114, sunspotNumber: 48 });
    });

    it('should return the most recent sunspot number for the dashboard card', () => {
      const days = parseDailySolarIndices(DAILY_INDICES_FIXTURE);
      expect(days.at(-1)?.sunspotNumber).to.equal(48);
    });
  });

  describe('fluxToXrayClass', () => {
    it('should map GOES long-channel flux to A/B/C/M/X class labels', () => {
      expect(fluxToXrayClass(5.2e-8)).to.equal('A5.2');
      expect(fluxToXrayClass(3.1e-7)).to.equal('B3.1');
      expect(fluxToXrayClass(1.4e-6)).to.equal('C1.4');
      expect(fluxToXrayClass(2.5e-5)).to.equal('M2.5');
      expect(fluxToXrayClass(1.2e-4)).to.equal('X1.2');
    });
  });

  describe('selectLatestXrayFlux', () => {
    it('should prefer the 0.1-0.8 nm long channel and take the newest sample', () => {
      const samples = [
        { time_tag: '2026-09-13T20:00:00Z', energy: '0.05-0.4nm', flux: 1e-7 },
        { time_tag: '2026-09-13T20:00:00Z', energy: '0.1-0.8nm', flux: 2.1e-6 },
        { time_tag: '2026-09-13T21:00:00Z', energy: '0.1-0.8nm', flux: 3.4e-6 },
        { time_tag: '2026-09-13T21:00:00Z', energy: '0.05-0.4nm', flux: 2e-7 },
      ];

      expect(selectLatestXrayFlux(samples)).to.equal(3.4e-6);
      expect(fluxToXrayClass(selectLatestXrayFlux(samples)!)).to.equal('C3.4');
    });

    it('should return undefined when no long-channel samples exist', () => {
      expect(selectLatestXrayFlux([{ time_tag: '2026-09-13T20:00:00Z', energy: '0.05-0.4nm', flux: 1e-7 }])).to.equal(
        undefined,
      );
    });
  });
});
