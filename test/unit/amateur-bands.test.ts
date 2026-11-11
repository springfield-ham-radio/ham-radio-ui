import { describe, expect, it } from 'vitest';
import {
  AMATEUR_BANDS,
  BAND_FOOTNOTES,
  GEOGRAPHIC_EXCEPTIONS,
  bandById,
  channelCenters,
  classSpans,
  frequencySpans,
  layoutBand,
  privilegeTextRows,
  type LicenseClassId,
} from '../../app/utils/amateur-bands.ts';

const CLASSES: LicenseClassId[] = ['extra', 'advanced', 'general', 'technician', 'novice'];

function covers(hz: number, classId: LicenseClassId): boolean {
  return AMATEUR_BANDS.some((band) => {
    return frequencySpans(band, classId).some((span) => hz >= span.startHz && hz < span.endHz);
  });
}

describe('amateur band chart data', () => {
  it('keeps every class’s spans inside the axis and free of overlaps', () => {
    for (const band of AMATEUR_BANDS) {
      expect(band.axisEndHz === null || band.axisEndHz > band.axisStartHz).toBe(true);

      for (const classId of CLASSES) {
        const spans = classSpans(band, classId).filter((segment) => segment.endHz !== null);

        for (const segment of spans) {
          expect(segment.endHz).toBeGreaterThan(segment.startHz);
          expect(segment.startHz).toBeGreaterThanOrEqual(band.axisStartHz);

          if (band.axisEndHz !== null && segment.endHz !== null) {
            expect(segment.endHz).toBeLessThanOrEqual(band.axisEndHz);
          }
        }

        for (let index = 1; index < spans.length; index += 1) {
          expect(spans[index].startHz).toBeGreaterThanOrEqual(spans[index - 1].endHz ?? 0);
        }

        for (const center of channelCenters(band, classId)) {
          const channel = band.segments.find((segment) => segment.centerHz === center);
          const maskStart = channel?.startHz ?? 0;
          const maskEnd = channel?.endHz ?? 0;
          const hitsSpan = spans.some((segment) => maskStart < (segment.endHz ?? 0) && maskEnd > segment.startHz);

          expect(hitsSpan).toBe(false);
        }
      }
    }
  });

  it('gives Extra a contiguous 40 m allocation and General a phone gap', () => {
    expect(frequencySpans(bandById('40m'), 'extra')).toEqual([
      { startHz: 7_000_000, endHz: 7_300_000 },
    ]);
    expect(frequencySpans(bandById('40m'), 'advanced')).toEqual([
      { startHz: 7_025_000, endHz: 7_300_000 },
    ]);
    expect(frequencySpans(bandById('40m'), 'general')).toEqual([
      { startHz: 7_025_000, endHz: 7_125_000 },
      { startHz: 7_175_000, endHz: 7_300_000 },
    ]);
    expect(frequencySpans(bandById('40m'), 'technician')).toEqual([
      { startHz: 7_025_000, endHz: 7_125_000 },
    ]);

    for (const classId of CLASSES) {
      for (const segment of classSpans(bandById('40m'), classId)) {
        if (segment.startHz < 7_125_000) {
          expect(segment.emissions).not.toContain('phone');
        }
      }
    }
  });

  it('keeps the 7.075 MHz phone exception off the default bars', () => {
    const exception = GEOGRAPHIC_EXCEPTIONS.find((entry) => entry.id === '40m-phone-7075');

    expect(exception).toMatchObject({
      startHz: 7_075_000,
      endHz: 7_100_000,
    });
    expect(exception?.classes).toEqual(['general', 'advanced', 'extra']);
    expect(privilegeTextRows('extra').some((row) => row.drawn === false && row.range.includes('7.075'))).toBe(true);
    expect(BAND_FOOTNOTES['40m-geography']).toContain('130°');
  });

  it('splits 20 m and 15 m where General and Advanced do not have the Extra segments', () => {
    expect(frequencySpans(bandById('20m'), 'extra')).toEqual([
      { startHz: 14_000_000, endHz: 14_350_000 },
    ]);
    expect(frequencySpans(bandById('20m'), 'advanced')).toEqual([
      { startHz: 14_025_000, endHz: 14_150_000 },
      { startHz: 14_175_000, endHz: 14_350_000 },
    ]);
    expect(frequencySpans(bandById('20m'), 'general')).toEqual([
      { startHz: 14_025_000, endHz: 14_150_000 },
      { startHz: 14_225_000, endHz: 14_350_000 },
    ]);
    expect(frequencySpans(bandById('15m'), 'extra')).toEqual([
      { startHz: 21_000_000, endHz: 21_450_000 },
    ]);
    expect(frequencySpans(bandById('15m'), 'advanced')).toEqual([
      { startHz: 21_025_000, endHz: 21_200_000 },
      { startHz: 21_225_000, endHz: 21_450_000 },
    ]);
    expect(frequencySpans(bandById('15m'), 'general')).toEqual([
      { startHz: 21_025_000, endHz: 21_200_000 },
      { startHz: 21_275_000, endHz: 21_450_000 },
    ]);
    expect(frequencySpans(bandById('20m'), 'technician')).toEqual([]);
  });

  it('limits Novice and Technician HF data and phone', () => {
    expect(frequencySpans(bandById('80m'), 'extra')).toEqual([
      { startHz: 3_500_000, endHz: 4_000_000 },
    ]);
    expect(frequencySpans(bandById('80m'), 'general')).toEqual([
      { startHz: 3_525_000, endHz: 3_600_000 },
      { startHz: 3_800_000, endHz: 4_000_000 },
    ]);
    expect(frequencySpans(bandById('80m'), 'advanced')).toEqual([
      { startHz: 3_525_000, endHz: 3_600_000 },
      { startHz: 3_700_000, endHz: 4_000_000 },
    ]);

    const novice80 = classSpans(bandById('80m'), 'novice');

    expect(novice80).toHaveLength(1);
    expect(novice80[0]?.emissions).toEqual(['cw']);
    expect(novice80[0]?.power).toBe('200 W PEP');

    const tech10 = classSpans(bandById('10m'), 'technician');

    expect(frequencySpans(bandById('10m'), 'technician')).toEqual([
      { startHz: 28_000_000, endHz: 28_500_000 },
    ]);
    expect(tech10.find((segment) => segment.startHz === 28_300_000)?.emissions).toEqual(['cw', 'phone']);
    expect(tech10.find((segment) => segment.startHz === 28_000_000)?.emissions).toContain('data');
    expect(covers(29_000_000, 'technician')).toBe(false);
    expect(covers(29_000_000, 'general')).toBe(true);
  });

  it('models 60 m as a 15 kHz segment plus four channels, not the old fifth channel', () => {
    const band = bandById('60m');

    expect(channelCenters(band, 'general')).toEqual([5_332_000, 5_348_000, 5_373_000, 5_405_000]);
    expect(channelCenters(band, 'technician')).toEqual([]);
    expect(frequencySpans(band, 'extra')).toEqual([
      { startHz: 5_351_500, endHz: 5_366_500 },
    ]);
    expect(covers(5_358_500, 'general')).toBe(true);
    expect(channelCenters(band, 'general')).not.toContain(5_358_500);

    const segment = classSpans(band, 'general')[0];
    const channel = band.segments.find((entry) => entry.centerHz === 5_332_000);

    expect(segment?.power).toBe('9.15 W ERP');
    expect(segment?.emissions).not.toContain('image');
    expect(channel?.power).toBe('100 W ERP');
    expect(band.blurb).toContain('5358.5');
    expect(covers(5_340_000, 'extra')).toBe(false);
  });

  it('keeps 30 m, 2200 m, and 630 m off Technician and states the power limits', () => {
    expect(frequencySpans(bandById('30m'), 'technician')).toEqual([]);
    expect(classSpans(bandById('30m'), 'general')[0]?.emissions).toEqual(['cw', 'data']);
    expect(classSpans(bandById('30m'), 'general')[0]?.power).toBe('200 W PEP');
    expect(frequencySpans(bandById('2200m'), 'technician')).toEqual([]);
    expect(classSpans(bandById('2200m'), 'extra')[0]?.power).toBe('1 W EIRP');
    expect(classSpans(bandById('630m'), 'general')[0]?.power).toBe('5 W EIRP');
    expect(BAND_FOOTNOTES['630-power']).toContain('Alaska');
    expect(frequencySpans(bandById('160m'), 'technician')).toEqual([]);
    expect(frequencySpans(bandById('160m'), 'general')).toEqual([
      { startHz: 1_800_000, endHz: 2_000_000 },
    ]);
  });

  it('does not give Novice the Technician VHF bands, and leaves 3.3 GHz out', () => {
    expect(frequencySpans(bandById('2m'), 'novice')).toEqual([]);
    expect(frequencySpans(bandById('6m'), 'novice')).toEqual([]);
    expect(frequencySpans(bandById('70cm'), 'novice')).toEqual([]);
    expect(frequencySpans(bandById('2m'), 'technician')).toEqual([
      { startHz: 144_000_000, endHz: 148_000_000 },
    ]);
    expect(classSpans(bandById('2m'), 'technician').find((segment) => segment.startHz === 144_000_000)?.emissions).toEqual(['cw']);
    expect(frequencySpans(bandById('1.25m'), 'novice')).toEqual([
      { startHz: 222_000_000, endHz: 225_000_000 },
    ]);
    expect(classSpans(bandById('1.25m'), 'novice')[0]?.power).toBe('25 W PEP');
    expect(classSpans(bandById('1.25m'), 'technician').some((segment) => segment.startHz === 219_000_000)).toBe(true);
    expect(classSpans(bandById('1.25m'), 'technician').find((segment) => segment.startHz === 219_000_000)?.emissions).toEqual(['data']);
    expect(frequencySpans(bandById('23cm'), 'novice')).toEqual([
      { startHz: 1_270_000_000, endHz: 1_295_000_000 },
    ]);
    expect(covers(3_400_000_000, 'extra')).toBe(false);
    expect(bandById('13cm').blurb).toContain('2310');
    expect(bandById('above-275').axisEndHz).toBeNull();
    expect(frequencySpans(bandById('5cm'), 'extra')).toEqual([
      { startHz: 5_650_000_000, endHz: 5_925_000_000 },
    ]);
  });

  it('collapses identical class rows and still names who is left out', () => {
    const six = layoutBand(bandById('6m'), 'all');

    expect(six.tracks).toHaveLength(1);
    expect(six.tracks[0]?.label).toContain('Technician');
    expect(six.tracks[0]?.label).not.toContain('Novice');
    expect(six.omitted).toContain('Novice');

    const forty = layoutBand(bandById('40m'), 'all');

    expect(forty.tracks.length).toBeGreaterThan(1);
    expect(layoutBand(bandById('60m'), 'technician').tracks).toHaveLength(0);
    expect(layoutBand(bandById('60m'), 'technician').omitted).toContain('Technician');
  });
});
