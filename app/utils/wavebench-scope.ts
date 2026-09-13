import { plotViewportSize } from './wavebench-charts';

export const SCOPE_H_DIVS = 10;
export const SCOPE_V_DIVS = 8;
export const SCOPE_STACK_DIVS = 4;

export const SCOPE_PHOSPHOR = {
  green: 'var(--ui-success)',
  cyan: 'var(--ui-info)',
  amber: 'var(--ui-warning)',
  white: 'var(--ui-text-highlighted)',
} as const;

export type ScopeLayoutMode = 'overlay' | 'stack';

export interface ScopeSample {
  timeSeconds: number;
  voltage: number;
}

export interface ScopeChannel {
  id: string;
  label: string;
  color: string;
  samples: ScopeSample[];
  /** Channels that share a group occupy one stacked strip. */
  group?: string;
  visible?: boolean;
  dashed?: boolean;
}

export interface ScopePlotBox {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotWidth: number;
  plotHeight: number;
}

export interface ScopeStrip {
  key: string;
  top: number;
  height: number;
  centerY: number;
  divisions: number;
}

export interface ScopeGraticule {
  majorVertical: number[];
  majorHorizontal: number[];
  axisX: number;
  axisY: number;
}

const MARGIN = { left: 36, right: 12, top: 12, bottom: 12 };

/**
 * Map a CSS box to the CRT viewBox, sharing the plot viewport helper
 * so Bode tiles and the scope fill a panel the same way.
 */
export function scopeViewportSize(clientWidth: number, clientHeight: number): ScopePlotBox {
  const size = plotViewportSize(clientWidth, clientHeight, 640, 280);
  const plotWidth = Math.max(1, size.width - MARGIN.left - MARGIN.right);
  const plotHeight = Math.max(1, size.height - MARGIN.top - MARGIN.bottom);

  return {
    width: size.width,
    height: size.height,
    left: MARGIN.left,
    right: MARGIN.right,
    top: MARGIN.top,
    bottom: MARGIN.bottom,
    plotWidth,
    plotHeight,
  };
}

export function visibleScopeChannels(channels: ScopeChannel[]): ScopeChannel[] {
  return channels.filter((channel) => channel.visible !== false && channel.samples.length > 0);
}

export function scopeStackKeys(channels: ScopeChannel[]): string[] {
  const keys: string[] = [];

  for (const channel of visibleScopeChannels(channels)) {
    const key = channel.group ?? channel.id;

    if (!keys.includes(key)) {
      keys.push(key);
    }
  }

  return keys;
}

/**
 * Vertical bands for overlay (one CRT) or stacked traces (multi-channel).
 */
export function scopeStrips(box: ScopePlotBox, channels: ScopeChannel[], mode: ScopeLayoutMode): ScopeStrip[] {
  const keys = scopeStackKeys(channels);

  if (mode === 'overlay' || keys.length <= 1) {
    return [
      {
        key: keys[0] ?? 'ch',
        top: box.top,
        height: box.plotHeight,
        centerY: box.top + box.plotHeight / 2,
        divisions: SCOPE_V_DIVS,
      },
    ];
  }

  const gap = 6;
  const usable = box.plotHeight - gap * (keys.length - 1);
  const height = usable / keys.length;

  return keys.map((key, index) => {
    const top = box.top + index * (height + gap);
    return {
      key,
      top,
      height,
      centerY: top + height / 2,
      divisions: SCOPE_STACK_DIVS,
    };
  });
}

export function scopeDurationSeconds(channels: ScopeChannel[]): number {
  let max = 0;

  for (const channel of visibleScopeChannels(channels)) {
    const last = channel.samples.at(-1)?.timeSeconds ?? 0;
    if (last > max) {
      max = last;
    }
  }

  return max > 0 ? max : 1;
}

export function scopePeakVoltage(samples: ScopeSample[]): number {
  let peak = 0;

  for (const sample of samples) {
    const abs = Math.abs(sample.voltage);
    if (abs > peak) {
      peak = abs;
    }
  }

  return peak;
}

/**
 * Pick a 1/2/5 volts-per-division so the peak sits inside the CRT.
 */
export function autoVoltsPerDiv(peakAbs: number, divisions: number): number {
  if (!(peakAbs > 0) || !(divisions > 0)) {
    return 1;
  }

  const raw = peakAbs / (divisions / 2 - 0.35);
  return niceScopeStep(raw);
}

export function niceScopeStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / 10 ** exponent;

  if (fraction <= 1) {
    return 10 ** exponent;
  }

  if (fraction <= 2) {
    return 2 * 10 ** exponent;
  }

  if (fraction <= 5) {
    return 5 * 10 ** exponent;
  }

  return 10 ** (exponent + 1);
}

export function mapScopeX(timeSeconds: number, durationSeconds: number, box: ScopePlotBox): number {
  const span = durationSeconds > 0 ? durationSeconds : 1;
  return box.left + (timeSeconds / span) * box.plotWidth;
}

export function mapScopeY(voltage: number, voltsPerDiv: number, strip: ScopeStrip): number {
  const pixelsPerDiv = strip.height / strip.divisions;
  return strip.centerY - (voltage / voltsPerDiv) * pixelsPerDiv;
}

export function scopeGraticule(box: ScopePlotBox): ScopeGraticule {
  const majorVertical: number[] = [];
  const majorHorizontal: number[] = [];

  for (let index = 0; index <= SCOPE_H_DIVS; index += 1) {
    majorVertical.push(box.left + (index / SCOPE_H_DIVS) * box.plotWidth);
  }

  for (let index = 0; index <= SCOPE_V_DIVS; index += 1) {
    majorHorizontal.push(box.top + (index / SCOPE_V_DIVS) * box.plotHeight);
  }

  return {
    majorVertical,
    majorHorizontal,
    axisX: box.left + box.plotWidth / 2,
    axisY: box.top + box.plotHeight / 2,
  };
}

export function scopeTracePath(
  samples: ScopeSample[],
  durationSeconds: number,
  voltsPerDiv: number,
  box: ScopePlotBox,
  strip: ScopeStrip,
): string {
  return samples
    .filter((sample) => Number.isFinite(sample.timeSeconds) && Number.isFinite(sample.voltage))
    .map((sample, index) => {
      const x = mapScopeX(sample.timeSeconds, durationSeconds, box).toFixed(2);
      const y = mapScopeY(sample.voltage, voltsPerDiv, strip).toFixed(2);
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}

export function formatVoltsPerDiv(volts: number): string {
  return `${formatSiSeconds(volts, 'V')}/div`;
}

export function formatTimePerDiv(seconds: number): string {
  return `${formatSiSeconds(seconds, 's')}/div`;
}

export function scopeTimePerDiv(durationSeconds: number): number {
  return durationSeconds / SCOPE_H_DIVS;
}

function formatSiSeconds(value: number, unit: string): string {
  const abs = Math.abs(value);
  const scaled =
    abs >= 1
      ? { value, suffix: ` ${unit}` }
      : abs >= 1e-3
        ? { value: value * 1e3, suffix: ` m${unit}` }
        : abs >= 1e-6
          ? { value: value * 1e6, suffix: ` µ${unit}` }
          : { value: value * 1e9, suffix: ` n${unit}` };

  return `${formatFixed(scaled.value)}${scaled.suffix}`;
}

function formatFixed(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 100) {
    return value.toFixed(0);
  }

  if (abs >= 10) {
    return value.toFixed(1);
  }

  if (Number.isInteger(Number(value.toFixed(2)))) {
    return value.toFixed(0);
  }

  return value.toFixed(2);
}
