import { describe, it } from 'node:test';
import { expect } from 'chai';
import { renderEquationHtml } from '../../app/utils/wavebench-math.ts';
import {
  MODULATION_PRESETS,
  WAVE_EQUATION,
  amEnvelope,
  amSignal,
  fmModulationIndex,
  fmSignal,
  instantaneousFrequencyHz,
  modulationEquations,
  modulationReadings,
  modulationScopeChannels,
  modulationWaveforms,
  modulationWindow,
  sineWave,
} from '../../app/utils/wavebench-modulation.ts';

const TWO_PI = 2 * Math.PI;

const lab = {
  carrierAmplitude: 1,
  carrierHz: 1_000,
  messageHz: 100,
  amIndex: 0.5,
  fmDeviationHz: 250,
};

describe('wavebench-modulation', () => {
  describe('wave equation', () => {
    it('should evaluate a sine as A sin(2πft + φ)', () => {
      expect(sineWave(0, 2, 1_000)).to.equal(0);
      expect(sineWave(1 / 4_000, 2, 1_000)).to.be.closeTo(2, 1e-12);
      expect(sineWave(0, 1, 1_000, Math.PI / 2)).to.be.closeTo(1, 1e-12);
    });
  });

  describe('AM', () => {
    it('should scale the carrier by 1 + μ m(t)', () => {
      const time = 0.0013;
      const carrier = sineWave(time, lab.carrierAmplitude, lab.carrierHz);
      const message = Math.sin(TWO_PI * lab.messageHz * time);

      expect(amSignal(time, lab)).to.be.closeTo(carrier * (1 + lab.amIndex * message), 1e-12);
    });

    it('should peak the envelope at A_c (1 + μ) a quarter-tone later', () => {
      const peakTime = 1 / (4 * lab.messageHz);
      expect(amEnvelope(peakTime, lab)).to.be.closeTo(1.5, 1e-12);
    });

    it('should fold through zero when μ > 1', () => {
      const over = { ...lab, amIndex: 1.4 };
      const troughTime = 3 / (4 * over.messageHz);
      expect(amEnvelope(troughTime, over)).to.be.closeTo(1 - 1.4, 1e-12);
      expect(modulationReadings(over).overmodulated).to.equal(true);
    });
  });

  describe('FM', () => {
    it('should match the carrier when deviation is zero', () => {
      const quiet = { ...lab, fmDeviationHz: 0 };
      const time = 0.00037;
      expect(fmSignal(time, quiet)).to.be.closeTo(sineWave(time, quiet.carrierAmplitude, quiet.carrierHz), 1e-12);
      expect(fmModulationIndex(0, 100)).to.equal(0);
    });

    it('should use β = Δf / f_m and peak f_i at t = 0', () => {
      expect(fmModulationIndex(2_500, 1_000)).to.equal(2.5);
      expect(instantaneousFrequencyHz(0, lab)).to.equal(lab.carrierHz + lab.fmDeviationHz);
      expect(instantaneousFrequencyHz(1 / (2 * lab.messageHz), lab)).to.be.closeTo(lab.carrierHz - lab.fmDeviationHz, 1e-9);
    });
  });

  describe('window and channels', () => {
    it('should show a few carrier cycles until AM or FM is added, then a few tone cycles', () => {
      const scoped = { ...lab, carrierHz: 10_000, messageHz: 400 };
      const carrierOnly = modulationWindow(scoped, { enableAm: false, enableFm: false });
      const withAm = modulationWindow(scoped, { enableAm: true, enableFm: false });

      expect(carrierOnly.durationSeconds).to.be.closeTo(4 / scoped.carrierHz, 1e-12);
      expect(withAm.durationSeconds).to.be.closeTo(3 / scoped.messageHz, 1e-12);
      expect(withAm.sampleCount).to.be.greaterThan(carrierOnly.sampleCount);
    });

    it('should put AM and its envelope in the same scope group', () => {
      const window = modulationWindow(lab, { enableAm: true, enableFm: true });
      const samples = modulationWaveforms(lab, window);
      const channels = modulationScopeChannels(samples, {
        enableAm: true,
        enableFm: true,
        showCarrier: true,
        showMessage: true,
        showEnvelope: true,
      });

      expect(samples).to.have.length(window.sampleCount);
      expect(channels.map((channel) => channel.id)).to.deep.equal(['carrier', 'message', 'am', 'env-hi', 'env-lo', 'fm']);
      expect(channels.filter((channel) => channel.group === 'am')).to.have.length(3);
    });
  });

  describe('presets and equations', () => {
    it('should expose a wave equation and ham-oriented AM/FM starting points', () => {
      expect(WAVE_EQUATION).to.include('sin');
      expect(MODULATION_PRESETS.map((preset) => preset.id)).to.include.members(['carrier', 'am-lab', 'nbfm', 'compare']);
    });

    it('should typeset every equation for carrier, AM, and FM', () => {
      const equations = modulationEquations({ enableAm: true, enableFm: true });
      expect(equations[0]?.id).to.equal('wave');

      for (const equation of equations) {
        expect(() => renderEquationHtml(equation.expression), equation.id).not.to.throw();
        expect(renderEquationHtml(equation.expression)).to.include('katex');
      }
    });

    it('should report AM bandwidth and Carson FM bandwidth', () => {
      const readings = modulationReadings(lab);
      expect(readings.amBandwidthHz).to.equal(200);
      expect(readings.carsonBandwidthHz).to.equal(2 * (250 + 100));
      expect(readings.fmBeta).to.equal(2.5);
      expect(readings.carrierTooLow).to.equal(false);
    });
  });
});
