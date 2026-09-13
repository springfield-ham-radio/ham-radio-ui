export type FilterKind = 'low-pass' | 'high-pass' | 'band-pass';
export type FilterTopology = 'rc' | 'lc' | 'rlc';
export type FilterNetwork = 'rc' | 'lc';
export type FilterResponseKind = 'voltage' | 's21';
export type FilterStimulus = 'sine' | 'square';
export type FilterComponentSymbol = 'R' | 'L' | 'C';

export interface FilterParameters {
  kind: FilterKind;
  topology: FilterNetwork;
  cutoffHz: number;
  centerHz: number;
  bandwidthHz: number;
  resistanceOhms: number;
}

export interface FilterComponent {
  id: string;
  symbol: FilterComponentSymbol;
  role: 'source' | 'series' | 'shunt' | 'load';
  value: number;
}

export interface FilterEquation {
  id: string;
  title: string;
  /** LaTeX source, typeset with KaTeX in the Equations panel. */
  expression: string;
}

export interface FilterDesign {
  kind: FilterKind;
  topology: FilterTopology;
  order: number;
  responseKind: FilterResponseKind;
  cutoffHz: number;
  centerHz?: number;
  bandwidthHz?: number;
  qualityFactor?: number;
  resistanceOhms: number;
  components: FilterComponent[];
  equations: FilterEquation[];
  summary: string;
}

export interface FilterResponse {
  frequencyHz: number;
  magnitude: number;
  magnitudeDb: number;
  phaseRadians: number;
  phaseDegrees: number;
}

export interface BodePoint extends FilterResponse {}

export interface WaveformSample {
  timeSeconds: number;
  input: number;
  output: number;
}

export interface HarmonicRow {
  harmonic: number;
  frequencyHz: number;
  magnitude: number;
  magnitudeDb: number;
  phaseDegrees: number;
}

export interface FilterPreset {
  id: string;
  label: string;
  description: string;
  testFrequencyHz: number;
  parameters: FilterParameters;
}

interface Complex {
  real: number;
  imag: number;
}

const TWO_PI = 2 * Math.PI;
const MIN_MAGNITUDE = 1e-15;

/**
 * Ham-oriented starting points for the WaveBench filter lab.
 *
 * LC presets use a 50 Ω Butterworth section, which is the usual RF
 * characteristic impedance. RC presets use a higher resistance so the
 * capacitor stays in a practical range at audio frequencies.
 */
export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'hf-lpf',
    label: 'HF harmonic LPF',
    description: '30 MHz low-pass for HF transmitters. Harmonics of 20 m still sit near cutoff on a 2-pole section.',
    testFrequencyHz: 14_200_000,
    parameters: {
      kind: 'low-pass',
      topology: 'lc',
      cutoffHz: 30_000_000,
      centerHz: 30_000_000,
      bandwidthHz: 2_000_000,
      resistanceOhms: 50,
    },
  },
  {
    id: 'am-hpf',
    label: 'AM broadcast HPF',
    description: '1.8 MHz high-pass to keep MW broadcast out of 160 m and 80 m receivers.',
    testFrequencyHz: 3_800_000,
    parameters: {
      kind: 'high-pass',
      topology: 'lc',
      cutoffHz: 1_800_000,
      centerHz: 1_800_000,
      bandwidthHz: 200_000,
      resistanceOhms: 50,
    },
  },
  {
    id: 'vhf-bpf',
    label: '2 m preselector',
    description: 'Band-pass around 146.52 MHz, the 2 m calling frequency.',
    testFrequencyHz: 146_520_000,
    parameters: {
      kind: 'band-pass',
      topology: 'lc',
      cutoffHz: 146_520_000,
      centerHz: 146_520_000,
      bandwidthHz: 4_000_000,
      resistanceOhms: 50,
    },
  },
  {
    id: 'uhf-bpf',
    label: '70 cm preselector',
    description: 'Band-pass around 446 MHz for a 70 cm front end.',
    testFrequencyHz: 446_000_000,
    parameters: {
      kind: 'band-pass',
      topology: 'lc',
      cutoffHz: 446_000_000,
      centerHz: 446_000_000,
      bandwidthHz: 10_000_000,
      resistanceOhms: 50,
    },
  },
  {
    id: 'ssb-audio',
    label: 'SSB audio LPF',
    description: '3 kHz RC low-pass, the classic voice bandwidth after demodulation.',
    testFrequencyHz: 1_000,
    parameters: {
      kind: 'low-pass',
      topology: 'rc',
      cutoffHz: 3_000,
      centerHz: 3_000,
      bandwidthHz: 500,
      resistanceOhms: 10_000,
    },
  },
  {
    id: 'cw-audio',
    label: 'CW audio BPF',
    description: '700 Hz series RLC peaked for Morse, with a 200 Hz ear bandwidth.',
    testFrequencyHz: 700,
    parameters: {
      kind: 'band-pass',
      topology: 'rc',
      cutoffHz: 700,
      centerHz: 700,
      bandwidthHz: 200,
      resistanceOhms: 10_000,
    },
  },
];

/**
 * Builds a lumped filter from cutoff (or center/bandwidth) and resistance.
 *
 * RC sections are first-order voltage dividers. LC low-pass and high-pass
 * sections are 2-pole Butterworth networks equally terminated at Z0, so the
 * plotted response is S21 (0 dB in the passband). Band-pass uses a series RLC
 * with the output taken across R.
 */
export function designFilter(parameters: FilterParameters): FilterDesign {
  assertPositive(parameters.cutoffHz, 'Cutoff frequency');
  assertPositive(parameters.centerHz, 'Center frequency');
  assertPositive(parameters.bandwidthHz, 'Bandwidth');
  assertPositive(parameters.resistanceOhms, 'Resistance');

  if (parameters.kind === 'band-pass') {
    return designBandPass(parameters);
  }

  if (parameters.topology === 'rc') {
    return designRcSection(parameters);
  }

  return designLcSection(parameters);
}

/**
 * Complex gain of the designed network at one frequency.
 *
 * LC low-pass and high-pass return S21 (twice the load voltage over the
 * source voltage) so a matched passband reads 0 dB instead of −6 dB.
 */
export function evaluateResponse(design: FilterDesign, frequencyHz: number): FilterResponse {
  const omega = TWO_PI * Math.max(frequencyHz, MIN_MAGNITUDE);
  const transfer = transferFunction(design, omega);
  const magnitude = complexAbs(transfer);

  return {
    frequencyHz,
    magnitude,
    magnitudeDb: toDecibels(magnitude),
    phaseRadians: Math.atan2(transfer.imag, transfer.real),
    phaseDegrees: (180 / Math.PI) * Math.atan2(transfer.imag, transfer.real),
  };
}

/**
 * Log-frequency sweep of magnitude and unwrapped phase.
 */
export function bodePlot(
  design: FilterDesign,
  options: { pointsPerDecade?: number; decadesBelow?: number; decadesAbove?: number } = {},
): BodePoint[] {
  const pointsPerDecade = options.pointsPerDecade ?? 24;
  const decadesBelow = options.decadesBelow ?? 2;
  const decadesAbove = options.decadesAbove ?? 2;
  const centerHz = design.centerHz ?? design.cutoffHz;
  const startHz = centerHz / 10 ** decadesBelow;
  const stopHz = centerHz * 10 ** decadesAbove;
  const decadeCount = Math.log10(stopHz / startHz);
  const pointCount = Math.max(2, Math.round(decadeCount * pointsPerDecade) + 1);
  const points: BodePoint[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const fraction = index / (pointCount - 1);
    const frequencyHz = startHz * 10 ** (fraction * decadeCount);
    points.push(evaluateResponse(design, frequencyHz));
  }

  unwrapPhase(points);
  return points;
}

/**
 * Steady-state input and output waveforms at a probe frequency.
 *
 * A sine uses the single-frequency phasor. A square wave is built from odd
 * harmonics so the output shows how the filter removes those harmonics.
 */
export function timeDomainWaveforms(
  design: FilterDesign,
  options: {
    frequencyHz: number;
    amplitude: number;
    cycles: number;
    sampleCount: number;
    stimulus: FilterStimulus;
  },
): WaveformSample[] {
  const sampleCount = Math.max(2, options.sampleCount);
  const duration = options.cycles / options.frequencyHz;
  const samples: WaveformSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = (index / (sampleCount - 1)) * duration;
    const angle = TWO_PI * options.frequencyHz * timeSeconds;

    if (options.stimulus === 'square') {
      samples.push({
        timeSeconds,
        input: options.amplitude * Math.sign(Math.sin(angle) || 1),
        output: filteredSquare(design, options.frequencyHz, options.amplitude, timeSeconds),
      });
      continue;
    }

    const response = evaluateResponse(design, options.frequencyHz);
    samples.push({
      timeSeconds,
      input: options.amplitude * Math.sin(angle),
      output: options.amplitude * response.magnitude * Math.sin(angle + response.phaseRadians),
    });
  }

  return samples;
}

/**
 * Harmonic attenuation of a probe tone, used to judge transmitter low-pass
 * sections against 2nd/3rd/4th/5th harmonics.
 */
export function harmonicTable(design: FilterDesign, fundamentalHz: number, harmonicCount: number): HarmonicRow[] {
  const rows: HarmonicRow[] = [];

  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const frequencyHz = fundamentalHz * harmonic;
    const response = evaluateResponse(design, frequencyHz);
    rows.push({
      harmonic,
      frequencyHz,
      magnitude: response.magnitude,
      magnitudeDb: response.magnitudeDb,
      phaseDegrees: response.phaseDegrees,
    });
  }

  return rows;
}

/**
 * Group delay −dφ/dω at one frequency, in seconds.
 */
export function groupDelaySeconds(design: FilterDesign, frequencyHz: number): number {
  const deltaHz = Math.max(frequencyHz * 1e-4, 1e-6);
  const lower = evaluateResponse(design, Math.max(frequencyHz - deltaHz, MIN_MAGNITUDE));
  const upper = evaluateResponse(design, frequencyHz + deltaHz);
  let deltaPhase = upper.phaseRadians - lower.phaseRadians;

  while (deltaPhase > Math.PI) {
    deltaPhase -= TWO_PI;
  }

  while (deltaPhase < -Math.PI) {
    deltaPhase += TWO_PI;
  }

  const deltaOmega = TWO_PI * (2 * deltaHz);
  return -deltaPhase / deltaOmega;
}

/**
 * Formats a frequency with a ham-typical unit.
 */
export function formatFrequencyHz(frequencyHz: number): string {
  const abs = Math.abs(frequencyHz);

  if (abs >= 1_000_000_000) {
    return `${formatFixed(frequencyHz / 1_000_000_000, 3)} GHz`;
  }

  if (abs >= 1_000_000) {
    return `${formatFixed(frequencyHz / 1_000_000, 3)} MHz`;
  }

  if (abs >= 1_000) {
    return `${formatFixed(frequencyHz / 1_000, 3)} kHz`;
  }

  return `${formatFixed(frequencyHz, 3)} Hz`;
}

/**
 * Formats R, L, or C with an SI prefix.
 */
export function formatComponentValue(symbol: FilterComponentSymbol, value: number): string {
  if (symbol === 'R') {
    return formatSi(value, 3, 'Ω');
  }

  if (symbol === 'L') {
    return formatSi(value, 3, 'H');
  }

  return formatSi(value, 3, 'F');
}

/**
 * Formats a gain in decibels with a Unicode minus.
 */
export function formatDecibels(magnitudeDb: number): string {
  const formatted = magnitudeDb.toFixed(2);
  return `${formatted.startsWith('-') ? `−${formatted.slice(1)}` : formatted} dB`;
}

function designRcSection(parameters: FilterParameters): FilterDesign {
  const resistance = parameters.resistanceOhms;
  const capacitance = 1 / (TWO_PI * parameters.cutoffHz * resistance);
  const isLowPass = parameters.kind === 'low-pass';

  return {
    kind: parameters.kind,
    topology: 'rc',
    order: 1,
    responseKind: 'voltage',
    cutoffHz: parameters.cutoffHz,
    resistanceOhms: resistance,
    components: isLowPass
      ? [
          { id: 'R', symbol: 'R', role: 'series', value: resistance },
          { id: 'C', symbol: 'C', role: 'shunt', value: capacitance },
        ]
      : [
          { id: 'C', symbol: 'C', role: 'series', value: capacitance },
          { id: 'R', symbol: 'R', role: 'shunt', value: resistance },
        ],
    equations: [
      {
        id: 'fc',
        title: 'Cutoff',
        expression: 'f_c = \\dfrac{1}{2\\pi R C}',
      },
      {
        id: 'H',
        title: 'Transfer function',
        expression: isLowPass ? 'H(s) = \\dfrac{1}{1 + sRC}' : 'H(s) = \\dfrac{sRC}{1 + sRC}',
      },
      {
        id: 'mag',
        title: 'Magnitude',
        expression: isLowPass
          ? '|H(j\\omega)| = \\dfrac{1}{\\sqrt{1 + (\\omega/\\omega_c)^{2}}}'
          : '|H(j\\omega)| = \\dfrac{\\omega/\\omega_c}{\\sqrt{1 + (\\omega/\\omega_c)^{2}}}',
      },
    ],
    summary: isLowPass
      ? 'A series resistor and shunt capacitor pass DC and audio below f_c, then roll off at 20 dB/decade. First-order RC is the textbook voltage divider; at RF the resistor burns power, so LC sections are preferred.'
      : 'A series capacitor and shunt resistor block DC and pass frequencies above f_c. The same 20 dB/decade slope appears, now on the low side of cutoff.',
  };
}

function designLcSection(parameters: FilterParameters): FilterDesign {
  const resistance = parameters.resistanceOhms;
  const omegaCutoff = TWO_PI * parameters.cutoffHz;
  const isLowPass = parameters.kind === 'low-pass';
  const inductance = (Math.SQRT2 * resistance) / omegaCutoff;
  const capacitance = isLowPass
    ? Math.SQRT2 / (omegaCutoff * resistance)
    : 1 / (Math.SQRT2 * omegaCutoff * resistance);

  return {
    kind: parameters.kind,
    topology: 'lc',
    order: 2,
    responseKind: 's21',
    cutoffHz: parameters.cutoffHz,
    resistanceOhms: resistance,
    components: isLowPass
      ? [
          { id: 'Rs', symbol: 'R', role: 'source', value: resistance },
          { id: 'L', symbol: 'L', role: 'series', value: inductance },
          { id: 'C', symbol: 'C', role: 'shunt', value: capacitance },
          { id: 'RL', symbol: 'R', role: 'load', value: resistance },
        ]
      : [
          { id: 'Rs', symbol: 'R', role: 'source', value: resistance },
          { id: 'C', symbol: 'C', role: 'series', value: capacitance },
          { id: 'L', symbol: 'L', role: 'shunt', value: inductance },
          { id: 'RL', symbol: 'R', role: 'load', value: resistance },
        ],
    equations: [
      {
        id: 'butterworth',
        title: 'Butterworth S21',
        expression: isLowPass
          ? 'S_{21}(s) = \\dfrac{1}{(s/\\omega_c)^{2} + \\sqrt{2}\\, s/\\omega_c + 1}'
          : 'S_{21}(s) = \\dfrac{(s/\\omega_c)^{2}}{(s/\\omega_c)^{2} + \\sqrt{2}\\, s/\\omega_c + 1}',
      },
      {
        id: 'L',
        title: 'Series element',
        expression: isLowPass
          ? 'L = \\dfrac{\\sqrt{2}\\, Z_{0}}{\\omega_c}'
          : 'C = \\dfrac{1}{\\sqrt{2}\\, Z_{0}\\,\\omega_c}',
      },
      {
        id: 'C',
        title: 'Shunt element',
        expression: isLowPass
          ? 'C = \\dfrac{\\sqrt{2}}{Z_{0}\\,\\omega_c}'
          : 'L = \\dfrac{\\sqrt{2}\\, Z_{0}}{\\omega_c}',
      },
    ],
    summary: isLowPass
      ? 'A 2-pole Butterworth low-pass, equally terminated at Z₀. The plot is insertion gain S21, so the passband sits at 0 dB. Slope is 40 dB/decade — a real HF harmonic filter usually stacks several of these sections.'
      : 'A 2-pole Butterworth high-pass, equally terminated at Z₀. Below cutoff the response falls at 40 dB/decade, which is why a 1.8 MHz section can knock down AM broadcast before a 160 m receiver.',
  };
}

function designBandPass(parameters: FilterParameters): FilterDesign {
  const resistance = parameters.resistanceOhms;
  const qualityFactor = parameters.centerHz / parameters.bandwidthHz;
  const omegaCenter = TWO_PI * parameters.centerHz;
  const inductance = (qualityFactor * resistance) / omegaCenter;
  const capacitance = 1 / (omegaCenter * omegaCenter * inductance);

  return {
    kind: 'band-pass',
    topology: 'rlc',
    order: 2,
    responseKind: 'voltage',
    cutoffHz: parameters.centerHz,
    centerHz: parameters.centerHz,
    bandwidthHz: parameters.bandwidthHz,
    qualityFactor,
    resistanceOhms: resistance,
    components: [
      { id: 'C', symbol: 'C', role: 'series', value: capacitance },
      { id: 'L', symbol: 'L', role: 'series', value: inductance },
      { id: 'R', symbol: 'R', role: 'shunt', value: resistance },
    ],
    equations: [
      {
        id: 'f0',
        title: 'Center',
        expression: 'f_{0} = \\dfrac{1}{2\\pi\\sqrt{LC}}',
      },
      {
        id: 'Q',
        title: 'Loaded Q',
        expression: 'Q = \\dfrac{f_{0}}{\\mathrm{BW}} = \\dfrac{\\omega_{0} L}{R}',
      },
      {
        id: 'H',
        title: 'Transfer function',
        expression: 'H(s) = \\dfrac{s\\omega_{0}/Q}{s^{2} + s\\omega_{0}/Q + \\omega_{0}^{2}}',
      },
    ],
    summary:
      'A series RLC with the output taken across R. At resonance the reactances cancel and the full source voltage appears at the load. Q = f₀ / BW sets how tightly the passband hugs the center — high Q for CW audio, lower Q for a VHF preselector.',
  };
}

function transferFunction(design: FilterDesign, omega: number): Complex {
  if (design.kind === 'band-pass') {
    const omegaCenter = TWO_PI * (design.centerHz ?? design.cutoffHz);
    const qualityFactor = design.qualityFactor ?? 1;
    const numerator = complex(0, (omega * omegaCenter) / qualityFactor);
    const denominator = complex(omegaCenter * omegaCenter - omega * omega, (omega * omegaCenter) / qualityFactor);
    return complexDiv(numerator, denominator);
  }

  const omegaCutoff = TWO_PI * design.cutoffHz;
  const normalized = omega / omegaCutoff;

  if (design.topology === 'rc') {
    if (design.kind === 'low-pass') {
      return complexDiv(complex(1, 0), complex(1, normalized));
    }

    return complexDiv(complex(0, normalized), complex(1, normalized));
  }

  const denominator = complex(1 - normalized * normalized, Math.SQRT2 * normalized);

  if (design.kind === 'low-pass') {
    return complexDiv(complex(1, 0), denominator);
  }

  return complexDiv(complex(-normalized * normalized, 0), denominator);
}

function filteredSquare(design: FilterDesign, frequencyHz: number, amplitude: number, timeSeconds: number): number {
  let output = 0;
  const harmonicLimit = 31;

  for (let harmonic = 1; harmonic <= harmonicLimit; harmonic += 2) {
    const response = evaluateResponse(design, frequencyHz * harmonic);
    const angle = TWO_PI * frequencyHz * harmonic * timeSeconds + response.phaseRadians;
    output += ((4 * amplitude) / Math.PI) * (1 / harmonic) * response.magnitude * Math.sin(angle);
  }

  return output;
}

function unwrapPhase(points: BodePoint[]): void {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];

    if (!previous || !current) {
      continue;
    }

    let delta = current.phaseDegrees - previous.phaseDegrees;

    while (delta > 180) {
      current.phaseDegrees -= 360;
      delta -= 360;
    }

    while (delta < -180) {
      current.phaseDegrees += 360;
      delta += 360;
    }

    current.phaseRadians = (current.phaseDegrees * Math.PI) / 180;
  }
}

function assertPositive(value: number, label: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new Error(`${label} must be positive`);
  }
}

function toDecibels(magnitude: number): number {
  return 20 * Math.log10(Math.max(magnitude, MIN_MAGNITUDE));
}

function complex(real: number, imag: number): Complex {
  return { real, imag };
}

function complexAbs(value: Complex): number {
  return Math.hypot(value.real, value.imag);
}

function complexDiv(numerator: Complex, denominator: Complex): Complex {
  const scale = denominator.real * denominator.real + denominator.imag * denominator.imag;

  if (scale === 0) {
    return complex(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }

  return complex(
    (numerator.real * denominator.real + numerator.imag * denominator.imag) / scale,
    (numerator.imag * denominator.real - numerator.real * denominator.imag) / scale,
  );
}

function formatFixed(value: number, _significantDigits: number): string {
  const abs = Math.abs(value);

  if (abs >= 100) {
    return value.toFixed(0);
  }

  if (abs >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(2);
}

function formatSi(value: number, significantDigits: number, unit: string): string {
  const prefixes: { threshold: number; suffix: string }[] = [
    { threshold: 1e9, suffix: ' G' },
    { threshold: 1e6, suffix: ' M' },
    { threshold: 1e3, suffix: ' k' },
    { threshold: 1, suffix: ' ' },
    { threshold: 1e-3, suffix: ' m' },
    { threshold: 1e-6, suffix: ' µ' },
    { threshold: 1e-9, suffix: ' n' },
    { threshold: 1e-12, suffix: ' p' },
  ];

  const abs = Math.abs(value);

  for (const prefix of prefixes) {
    if (abs >= prefix.threshold) {
      const scaled = value / prefix.threshold;
      return `${formatFixed(scaled, significantDigits)}${prefix.suffix}${unit}`;
    }
  }

  return `${formatFixed(value, significantDigits)} ${unit}`;
}
