import { describe, expect, it } from 'vitest';
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
      expect(sineWave(0, 2, 1_000)).toBe(0);
      expect(Math.abs((sineWave(1 / 4_000, 2, 1_000)) - (2))).toBeLessThanOrEqual(1e-12);
      expect(Math.abs((sineWave(0, 1, 1_000, Math.PI / 2)) - (1))).toBeLessThanOrEqual(1e-12);
    });
  });

  describe('AM', () => {
    it('should scale the carrier by 1 + μ m(t)', () => {
      const time = 0.0013;
      const carrier = sineWave(time, lab.carrierAmplitude, lab.carrierHz);
      const message = Math.sin(TWO_PI * lab.messageHz * time);

      expect(Math.abs((amSignal(time, lab)) - (carrier * (1 + lab.amIndex * message)))).toBeLessThanOrEqual(1e-12);
    });

    it('should peak the envelope at A_c (1 + μ) a quarter-tone later', () => {
      const peakTime = 1 / (4 * lab.messageHz);
      expect(Math.abs((amEnvelope(peakTime, lab)) - (1.5))).toBeLessThanOrEqual(1e-12);
    });

    it('should fold through zero when μ > 1', () => {
      const over = { ...lab, amIndex: 1.4 };
      const troughTime = 3 / (4 * over.messageHz);
      expect(Math.abs((amEnvelope(troughTime, over)) - (1 - 1.4))).toBeLessThanOrEqual(1e-12);
      expect(modulationReadings(over).overmodulated).toBe(true);
    });
  });

  describe('FM', () => {
    it('should match the carrier when deviation is zero', () => {
      const quiet = { ...lab, fmDeviationHz: 0 };
      const time = 0.00037;
      expect(Math.abs((fmSignal(time, quiet)) - (sineWave(time, quiet.carrierAmplitude, quiet.carrierHz)))).toBeLessThanOrEqual(1e-12);
      expect(fmModulationIndex(0, 100)).toBe(0);
    });

    it('should use β = Δf / f_m and peak f_i at t = 0', () => {
      expect(fmModulationIndex(2_500, 1_000)).toBe(2.5);
      expect(instantaneousFrequencyHz(0, lab)).toBe(lab.carrierHz + lab.fmDeviationHz);
      expect(Math.abs((instantaneousFrequencyHz(1 / (2 * lab.messageHz), lab)) - (lab.carrierHz - lab.fmDeviationHz))).toBeLessThanOrEqual(1e-9);
    });
  });

  describe('window and channels', () => {
    it('should show a few carrier cycles until AM or FM is added, then a few tone cycles', () => {
      const scoped = { ...lab, carrierHz: 10_000, messageHz: 400 };
      const carrierOnly = modulationWindow(scoped, { enableAm: false, enableFm: false });
      const withAm = modulationWindow(scoped, { enableAm: true, enableFm: false });

      expect(Math.abs((carrierOnly.durationSeconds) - (4 / scoped.carrierHz))).toBeLessThanOrEqual(1e-12);
      expect(Math.abs((withAm.durationSeconds) - (3 / scoped.messageHz))).toBeLessThanOrEqual(1e-12);
      expect(withAm.sampleCount).toBeGreaterThan(carrierOnly.sampleCount);
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

      expect(samples).toHaveLength(window.sampleCount);
      expect(channels.map((channel) => channel.id)).toEqual(['carrier', 'message', 'am', 'env-hi', 'env-lo', 'fm']);
      expect(channels.filter((channel) => channel.group === 'am')).toHaveLength(3);
    });
  });

  describe('presets and equations', () => {
    it('should expose a wave equation and ham-oriented AM/FM starting points', () => {
      expect(WAVE_EQUATION).toContain('sin');
      expect(MODULATION_PRESETS.map((preset) => preset.id)).toEqual(expect.arrayContaining(['carrier', 'am-lab', 'nbfm', 'compare']));
    });

    it('should typeset every equation for carrier, AM, and FM', () => {
      const equations = modulationEquations({ enableAm: true, enableFm: true });
      expect(equations[0]?.id).toBe('wave');

      for (const equation of equations) {
        expect(() => renderEquationHtml(equation.expression), equation.id).not.toThrow();
        expect(renderEquationHtml(equation.expression)).toContain('katex');
      }
    });

    it('should report AM bandwidth and Carson FM bandwidth', () => {
      const readings = modulationReadings(lab);
      expect(readings.amBandwidthHz).toBe(200);
      expect(readings.carsonBandwidthHz).toBe(2 * (250 + 100));
      expect(readings.fmBeta).toBe(2.5);
      expect(readings.carrierTooLow).toBe(false);
    });
  });
});
