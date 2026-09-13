import type { ScopeChannel, ScopeSample } from './wavebench-scope';
import { SCOPE_PHOSPHOR } from './wavebench-scope';

const TWO_PI = 2 * Math.PI;

export interface ModulationParameters {
  carrierAmplitude: number;
  carrierHz: number;
  messageHz: number;
  amIndex: number;
  fmDeviationHz: number;
}

export interface ModulationSample {
  timeSeconds: number;
  carrier: number;
  message: number;
  am: number;
  fm: number;
  envelope: number;
  instantaneousHz: number;
}

export interface ModulationEquation {
  id: string;
  title: string;
  expression: string;
}

export interface ModulationPreset {
  id: string;
  label: string;
  description: string;
  enableAm: boolean;
  enableFm: boolean;
  parameters: ModulationParameters;
}

export interface ModulationReadings {
  amIndex: number;
  amPercent: number;
  overmodulated: boolean;
  fmBeta: number;
  amBandwidthHz: number;
  carsonBandwidthHz: number;
  carrierTooLow: boolean;
}

/**
 * The sine every later experiment starts from: amplitude, frequency, phase.
 */
export const WAVE_EQUATION = 'v(t) = A \\sin(2\\pi f t + \\varphi)';

export const MODULATION_PRESETS: ModulationPreset[] = [
  {
    id: 'carrier',
    label: 'Carrier only',
    description: 'A 10 kHz sine — the unmodulated RF the rest of the bench writes onto.',
    enableAm: false,
    enableFm: false,
    parameters: {
      carrierAmplitude: 1,
      carrierHz: 10_000,
      messageHz: 400,
      amIndex: 0.7,
      fmDeviationHz: 800,
    },
  },
  {
    id: 'am-lab',
    label: 'AM 70%',
    description: 'Classic scope-lab AM: a 400 Hz tone on a 10 kHz carrier at μ = 0.7, so the envelope never folds.',
    enableAm: true,
    enableFm: false,
    parameters: {
      carrierAmplitude: 1,
      carrierHz: 10_000,
      messageHz: 400,
      amIndex: 0.7,
      fmDeviationHz: 800,
    },
  },
  {
    id: 'am-overmod',
    label: 'Overmodulation',
    description: 'μ > 1. The envelope crosses zero and the recovered audio distorts — the reason AM voice stays under 100%.',
    enableAm: true,
    enableFm: false,
    parameters: {
      carrierAmplitude: 1,
      carrierHz: 10_000,
      messageHz: 400,
      amIndex: 1.4,
      fmDeviationHz: 800,
    },
  },
  {
    id: 'nbfm',
    label: 'NBFM',
    description: 'Narrow FM as used on 2 m: β = Δf / f_m ≈ 2.5 with a 1 kHz tone and 2.5 kHz deviation.',
    enableAm: false,
    enableFm: true,
    parameters: {
      carrierAmplitude: 1,
      carrierHz: 10_000,
      messageHz: 1_000,
      amIndex: 0.7,
      fmDeviationHz: 2_500,
    },
  },
  {
    id: 'compare',
    label: 'AM + FM',
    description: 'Same carrier and tone, both modulators on. AM changes height; FM keeps height and bunches the cycles.',
    enableAm: true,
    enableFm: true,
    parameters: {
      carrierAmplitude: 1,
      carrierHz: 10_000,
      messageHz: 400,
      amIndex: 0.8,
      fmDeviationHz: 1_200,
    },
  },
];

export function sineWave(timeSeconds: number, amplitude: number, frequencyHz: number, phaseRadians = 0): number {
  return amplitude * Math.sin(TWO_PI * frequencyHz * timeSeconds + phaseRadians);
}

export function amSignal(timeSeconds: number, parameters: ModulationParameters): number {
  const message = Math.sin(TWO_PI * parameters.messageHz * timeSeconds);
  return parameters.carrierAmplitude * (1 + parameters.amIndex * message) * Math.sin(TWO_PI * parameters.carrierHz * timeSeconds);
}

export function fmSignal(timeSeconds: number, parameters: ModulationParameters): number {
  const beta = fmModulationIndex(parameters.fmDeviationHz, parameters.messageHz);
  return parameters.carrierAmplitude * Math.sin(TWO_PI * parameters.carrierHz * timeSeconds + beta * Math.sin(TWO_PI * parameters.messageHz * timeSeconds));
}

export function amEnvelope(timeSeconds: number, parameters: ModulationParameters): number {
  return parameters.carrierAmplitude * (1 + parameters.amIndex * Math.sin(TWO_PI * parameters.messageHz * timeSeconds));
}

/**
 * Instantaneous frequency for s(t) = A sin(2π f_c t + β sin(2π f_m t)).
 * f_i(t) = f_c + Δf cos(2π f_m t).
 */
export function instantaneousFrequencyHz(timeSeconds: number, parameters: ModulationParameters): number {
  return parameters.carrierHz + parameters.fmDeviationHz * Math.cos(TWO_PI * parameters.messageHz * timeSeconds);
}

export function fmModulationIndex(deviationHz: number, messageHz: number): number {
  return messageHz > 0 ? deviationHz / messageHz : 0;
}

export function modulationReadings(parameters: ModulationParameters): ModulationReadings {
  const amIndex = parameters.amIndex;
  return {
    amIndex,
    amPercent: amIndex * 100,
    overmodulated: amIndex > 1,
    fmBeta: fmModulationIndex(parameters.fmDeviationHz, parameters.messageHz),
    amBandwidthHz: 2 * parameters.messageHz,
    carsonBandwidthHz: 2 * (parameters.fmDeviationHz + parameters.messageHz),
    carrierTooLow: parameters.carrierHz < 8 * parameters.messageHz,
  };
}

export function modulationWindow(
  parameters: ModulationParameters,
  options: { enableAm: boolean; enableFm: boolean },
): { durationSeconds: number; sampleCount: number } {
  const durationSeconds =
    options.enableAm || options.enableFm ? 3 / Math.max(parameters.messageHz, 1) : 4 / Math.max(parameters.carrierHz, 1);
  const carrierCycles = durationSeconds * Math.max(parameters.carrierHz, 1);
  const sampleCount = Math.min(4_000, Math.max(800, Math.ceil(carrierCycles * 24)));

  return { durationSeconds, sampleCount };
}

export function modulationWaveforms(
  parameters: ModulationParameters,
  options: { durationSeconds: number; sampleCount: number },
): ModulationSample[] {
  const sampleCount = Math.max(2, options.sampleCount);
  const duration = Math.max(options.durationSeconds, Number.MIN_VALUE);
  const samples: ModulationSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = (index / (sampleCount - 1)) * duration;
    samples.push({
      timeSeconds,
      carrier: sineWave(timeSeconds, parameters.carrierAmplitude, parameters.carrierHz),
      message: Math.sin(TWO_PI * parameters.messageHz * timeSeconds),
      am: amSignal(timeSeconds, parameters),
      fm: fmSignal(timeSeconds, parameters),
      envelope: amEnvelope(timeSeconds, parameters),
      instantaneousHz: instantaneousFrequencyHz(timeSeconds, parameters),
    });
  }

  return samples;
}

export function modulationEquations(options: { enableAm: boolean; enableFm: boolean }): ModulationEquation[] {
  const equations: ModulationEquation[] = [
    {
      id: 'wave',
      title: 'The wave',
      expression: WAVE_EQUATION,
    },
    {
      id: 'omega',
      title: 'Angular frequency',
      expression: '\\omega = 2\\pi f',
    },
    {
      id: 'carrier',
      title: 'Carrier',
      expression: 'c(t) = A_c \\sin(2\\pi f_c t)',
    },
    {
      id: 'message',
      title: 'Modulating tone',
      expression: 'm(t) = \\sin(2\\pi f_m t)',
    },
  ];

  if (options.enableAm) {
    equations.push(
      {
        id: 'am',
        title: 'Amplitude modulation',
        expression: 's_{AM}(t) = A_c [1 + \\mu m(t)] \\sin(2\\pi f_c t)',
      },
      {
        id: 'mu',
        title: 'AM index',
        expression: '\\mu = \\dfrac{A_{max} - A_{min}}{A_{max} + A_{min}}',
      },
    );
  }

  if (options.enableFm) {
    equations.push(
      {
        id: 'fm',
        title: 'Frequency modulation',
        expression: 's_{FM}(t) = A_c \\sin\\big(2\\pi f_c t + \\beta \\sin(2\\pi f_m t)\\big)',
      },
      {
        id: 'beta',
        title: 'FM index',
        expression: '\\beta = \\dfrac{\\Delta f}{f_m}',
      },
      {
        id: 'fi',
        title: 'Instantaneous frequency',
        expression: 'f_i(t) = f_c + \\Delta f \\cos(2\\pi f_m t)',
      },
    );
  }

  return equations;
}

export function modulationScopeChannels(
  samples: ModulationSample[],
  options: { enableAm: boolean; enableFm: boolean; showCarrier: boolean; showMessage: boolean; showEnvelope: boolean },
): ScopeChannel[] {
  const channels: ScopeChannel[] = [];

  if (options.showCarrier) {
    channels.push(trace('carrier', 'CH1 Carrier', SCOPE_PHOSPHOR.green, samples, (sample) => sample.carrier));
  }

  if (options.showMessage && (options.enableAm || options.enableFm)) {
    channels.push(trace('message', 'CH2 Tone', SCOPE_PHOSPHOR.cyan, samples, (sample) => sample.message));
  }

  if (options.enableAm) {
    channels.push(trace('am', 'CH3 AM', SCOPE_PHOSPHOR.amber, samples, (sample) => sample.am, 'am'));

    if (options.showEnvelope) {
      channels.push({
        ...trace('env-hi', 'Envelope', SCOPE_PHOSPHOR.amber, samples, (sample) => sample.envelope, 'am'),
        dashed: true,
      });
      channels.push({
        ...trace('env-lo', 'Envelope −', SCOPE_PHOSPHOR.amber, samples, (sample) => -sample.envelope, 'am'),
        dashed: true,
      });
    }
  }

  if (options.enableFm) {
    channels.push(trace('fm', 'CH4 FM', SCOPE_PHOSPHOR.white, samples, (sample) => sample.fm));
  }

  return channels;
}

function trace(
  id: string,
  label: string,
  color: string,
  samples: ModulationSample[],
  voltage: (sample: ModulationSample) => number,
  group?: string,
): ScopeChannel {
  const mapped: ScopeSample[] = samples.map((sample) => ({
    timeSeconds: sample.timeSeconds,
    voltage: voltage(sample),
  }));

  return { id, label, color, samples: mapped, group };
}
