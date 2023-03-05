import { SpectrumBand } from '@springfield/ham-radio-api';

export function formatFrequency(frequency: number, band?: SpectrumBand): string {
  const targetBand = band || findBand(frequency);
  return (frequency / 10 ** targetBand.frequencyDisplayBaseMultiplier).toFixed(targetBand.frequencyDisplayNumberDecimals);
}

function findBand(_frequency: number): SpectrumBand {
  return {
    name: '2m',
    wavelength: 2 * 10 ** 6,
    lowerFrequency: 144 * 10 ** 6,
    upperFrequency: 148 * 10 ** 6,
    frequencyDisplayBaseMultiplier: 6,
    frequencyDisplayNumberDecimals: 3,
    privilegeIds: [],
  };
}
