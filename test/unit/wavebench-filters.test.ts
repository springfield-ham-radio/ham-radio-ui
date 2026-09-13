import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  bodePlot,
  designFilter,
  evaluateResponse,
  FILTER_PRESETS,
  formatComponentValue,
  formatDecibels,
  formatFrequencyHz,
  groupDelaySeconds,
  harmonicTable,
  timeDomainWaveforms,
  type FilterParameters,
} from '../../app/utils/wavebench-filters.ts';

const TWO_PI = 2 * Math.PI;

function rcLowPass(overrides: Partial<FilterParameters> = {}): ReturnType<typeof designFilter> {
  return designFilter({
    kind: 'low-pass',
    topology: 'rc',
    cutoffHz: 1_000,
    centerHz: 1_000,
    bandwidthHz: 200,
    resistanceOhms: 10_000,
    ...overrides,
  });
}

function lcLowPass(): ReturnType<typeof designFilter> {
  return designFilter({
    kind: 'low-pass',
    topology: 'lc',
    cutoffHz: 30_000_000,
    centerHz: 30_000_000,
    bandwidthHz: 1_000_000,
    resistanceOhms: 50,
  });
}

describe('wavebench-filters', () => {
  describe('designFilter', () => {
    it('should size an RC low-pass capacitor from cutoff and resistance', () => {
      const design = rcLowPass();
      const capacitor = design.components.find((component) => component.symbol === 'C');

      expect(design.order).to.equal(1);
      expect(design.responseKind).to.equal('voltage');
      expect(capacitor?.value).to.be.closeTo(1 / (TWO_PI * 1_000 * 10_000), 1e-12);
    });

    it('should size a matched LC Butterworth low-pass from cutoff and Z0', () => {
      const design = lcLowPass();
      const inductor = design.components.find((component) => component.symbol === 'L');
      const capacitor = design.components.find((component) => component.symbol === 'C');
      const omegaCutoff = TWO_PI * 30_000_000;

      expect(design.order).to.equal(2);
      expect(design.responseKind).to.equal('s21');
      expect(inductor?.value).to.be.closeTo((Math.SQRT2 * 50) / omegaCutoff, 1e-12);
      expect(capacitor?.value).to.be.closeTo(Math.SQRT2 / (omegaCutoff * 50), 1e-15);
    });

    it('should size a series RLC band-pass from center frequency, bandwidth, and R', () => {
      const design = designFilter({
        kind: 'band-pass',
        topology: 'lc',
        cutoffHz: 146_520_000,
        centerHz: 146_520_000,
        bandwidthHz: 4_000_000,
        resistanceOhms: 50,
      });
      const inductor = design.components.find((component) => component.symbol === 'L');
      const capacitor = design.components.find((component) => component.symbol === 'C');
      const omegaCenter = TWO_PI * 146_520_000;
      const qualityFactor = 146_520_000 / 4_000_000;

      expect(design.topology).to.equal('rlc');
      expect(design.centerHz).to.equal(146_520_000);
      expect(design.qualityFactor).to.be.closeTo(qualityFactor, 1e-9);
      expect(inductor?.value).to.be.closeTo((qualityFactor * 50) / omegaCenter, 1e-12);
      expect(capacitor?.value).to.be.closeTo(1 / (omegaCenter ** 2 * (inductor?.value ?? 0)), 1e-18);
    });

    it('should reject non-positive design values', () => {
      expect(() => rcLowPass({ cutoffHz: 0 })).to.throw('positive');
      expect(() => rcLowPass({ resistanceOhms: -1 })).to.throw('positive');
      expect(() =>
        designFilter({
          kind: 'band-pass',
          topology: 'rc',
          cutoffHz: 700,
          centerHz: 700,
          bandwidthHz: 0,
          resistanceOhms: 10_000,
        }),
      ).to.throw('positive');
    });
  });

  describe('evaluateResponse', () => {
    it('should be about 0 dB well below an RC low-pass cutoff', () => {
      const response = evaluateResponse(rcLowPass(), 10);

      expect(response.magnitudeDb).to.be.closeTo(0, 0.05);
      expect(response.phaseDegrees).to.be.closeTo(0, 1);
    });

    it('should be -3 dB at an RC low-pass cutoff', () => {
      const response = evaluateResponse(rcLowPass(), 1_000);

      expect(response.magnitude).to.be.closeTo(1 / Math.SQRT2, 1e-9);
      expect(response.magnitudeDb).to.be.closeTo(-20 * Math.log10(Math.SQRT2), 1e-9);
      expect(response.phaseDegrees).to.be.closeTo(-45, 1e-6);
    });

    it('should roll off at 20 dB per decade above an RC low-pass cutoff', () => {
      const response = evaluateResponse(rcLowPass(), 10_000);

      expect(response.magnitudeDb).to.be.closeTo(-20.04, 0.05);
    });

    it('should be -3 dB at an RC high-pass cutoff and near 0 dB well above it', () => {
      const design = designFilter({
        kind: 'high-pass',
        topology: 'rc',
        cutoffHz: 1_800,
        centerHz: 1_800,
        bandwidthHz: 200,
        resistanceOhms: 10_000,
      });

      expect(evaluateResponse(design, 1_800).magnitudeDb).to.be.closeTo(-3.01, 0.05);
      expect(evaluateResponse(design, 180_000).magnitudeDb).to.be.closeTo(0, 0.05);
    });

    it('should report 0 dB S21 in the passband of a matched LC low-pass', () => {
      const design = lcLowPass();

      expect(evaluateResponse(design, 1_000_000).magnitudeDb).to.be.closeTo(0, 0.05);
      expect(evaluateResponse(design, 30_000_000).magnitudeDb).to.be.closeTo(-3.01, 0.05);
    });

    it('should report 0 dB S21 well above a matched LC high-pass cutoff', () => {
      const design = designFilter({
        kind: 'high-pass',
        topology: 'lc',
        cutoffHz: 1_800_000,
        centerHz: 1_800_000,
        bandwidthHz: 200_000,
        resistanceOhms: 50,
      });

      expect(evaluateResponse(design, 1_800_000).magnitudeDb).to.be.closeTo(-3.01, 0.05);
      expect(evaluateResponse(design, 50_000_000).magnitudeDb).to.be.closeTo(0, 0.05);
    });

    it('should peak at 0 dB at the center of a series RLC band-pass', () => {
      const design = designFilter({
        kind: 'band-pass',
        topology: 'rc',
        cutoffHz: 700,
        centerHz: 700,
        bandwidthHz: 200,
        resistanceOhms: 10_000,
      });
      const qualityFactor = 700 / 200;
      const discriminant = Math.sqrt(1 / qualityFactor ** 2 + 4);
      const lowerRatio = (-1 / qualityFactor + discriminant) / 2;
      const upperRatio = (1 / qualityFactor + discriminant) / 2;

      expect(evaluateResponse(design, 700).magnitudeDb).to.be.closeTo(0, 0.05);
      expect(evaluateResponse(design, 700 * lowerRatio).magnitudeDb).to.be.closeTo(-3.01, 0.05);
      expect(evaluateResponse(design, 700 * upperRatio).magnitudeDb).to.be.closeTo(-3.01, 0.05);
    });
  });

  describe('bodePlot', () => {
    it('should sweep log frequency and unwrap phase for a low-pass', () => {
      const plot = bodePlot(rcLowPass(), { pointsPerDecade: 10, decadesBelow: 2, decadesAbove: 2 });

      expect(plot.length).to.be.greaterThan(20);
      expect(plot[0]?.frequencyHz).to.be.closeTo(10, 1e-6);
      expect(plot.at(-1)?.frequencyHz).to.be.closeTo(100_000, 1e-3);

      for (let index = 1; index < plot.length; index += 1) {
        expect(plot[index]?.frequencyHz).to.be.greaterThan(plot[index - 1]?.frequencyHz ?? 0);
        expect(Math.abs((plot[index]?.phaseDegrees ?? 0) - (plot[index - 1]?.phaseDegrees ?? 0))).to.be.lessThan(90);
      }

      expect(plot.at(-1)?.phaseDegrees).to.be.lessThan(-80);
    });
  });

  describe('timeDomainWaveforms', () => {
    it('should scale a sine wave by the filter magnitude and shift it by the phase', () => {
      const design = rcLowPass();
      const waveforms = timeDomainWaveforms(design, {
        frequencyHz: 1_000,
        amplitude: 1,
        cycles: 1,
        sampleCount: 400,
        stimulus: 'sine',
      });
      const response = evaluateResponse(design, 1_000);
      const outputPeak = Math.max(...waveforms.map((sample) => sample.output));

      expect(waveforms).to.have.length(400);
      expect(outputPeak).to.be.closeTo(response.magnitude, 0.02);
    });

    it('should keep odd harmonics of a square wave below a low-pass cutoff', () => {
      const design = rcLowPass({ cutoffHz: 10_000 });
      const waveforms = timeDomainWaveforms(design, {
        frequencyHz: 1_000,
        amplitude: 1,
        cycles: 2,
        sampleCount: 800,
        stimulus: 'square',
      });
      const inputPeak = Math.max(...waveforms.map((sample) => Math.abs(sample.input)));
      const outputPeak = Math.max(...waveforms.map((sample) => Math.abs(sample.output)));

      expect(inputPeak).to.be.closeTo(1, 0.05);
      expect(outputPeak).to.be.greaterThan(0.9);
      expect(outputPeak).to.be.lessThan(1.3);
    });
  });

  describe('harmonicTable', () => {
    it('should show a 30 MHz LC low-pass passing 14.2 MHz and attenuating its harmonics', () => {
      const rows = harmonicTable(lcLowPass(), 14_200_000, 5);

      expect(rows[0]?.harmonic).to.equal(1);
      expect(rows[0]?.magnitudeDb).to.be.greaterThan(-1);
      expect(rows[1]?.frequencyHz).to.equal(28_400_000);
      expect(rows[1]?.magnitudeDb).to.be.lessThan(rows[0]?.magnitudeDb ?? 0);
      expect(rows[2]?.magnitudeDb).to.be.lessThan(rows[1]?.magnitudeDb ?? 0);
    });
  });

  describe('groupDelaySeconds', () => {
    it('should be positive near an RC low-pass cutoff', () => {
      const delay = groupDelaySeconds(rcLowPass(), 1_000);

      expect(delay).to.be.greaterThan(0);
      expect(delay).to.be.closeTo(1 / (TWO_PI * 1_000 * 2), 5e-6);
    });
  });

  describe('formatting', () => {
    it('should format frequencies, components, and decibels', () => {
      expect(formatFrequencyHz(14_200_000)).to.equal('14.2 MHz');
      expect(formatFrequencyHz(1_000_000_000)).to.equal('1.00 GHz');
      expect(formatFrequencyHz(700)).to.equal('700 Hz');
      expect(formatFrequencyHz(3_000)).to.equal('3.00 kHz');
      expect(formatComponentValue('R', 50)).to.equal('50.0 Ω');
      expect(formatComponentValue('C', 1.5e-10)).to.equal('150 pF');
      expect(formatComponentValue('L', 2.21e-6)).to.equal('2.21 µH');
      expect(formatDecibels(-3.0103)).to.equal('−3.01 dB');
    });
  });

  describe('FILTER_PRESETS', () => {
    it('should produce a valid design for every ham-oriented preset', () => {
      expect(FILTER_PRESETS.length).to.be.greaterThan(3);

      for (const preset of FILTER_PRESETS) {
        const design = designFilter(preset.parameters);

        expect(design.components.length).to.be.greaterThan(0);
        expect(design.equations.length).to.be.greaterThan(1);
        expect(evaluateResponse(design, preset.testFrequencyHz).magnitude).to.be.greaterThan(0);
      }
    });
  });
});
