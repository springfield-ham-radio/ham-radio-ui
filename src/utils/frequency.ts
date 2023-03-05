import { SpectrumBand } from '@springfield/ham-radio-api';
import { useSpectrumStore } from 'src/stores/spectrum-store';

export function formatFrequency(frequency: number, band?: SpectrumBand): string {
  const targetBand = band || findBand(frequency);
  return targetBand ? (frequency / 10 ** targetBand.frequencyDisplayBaseMultiplier).toFixed(targetBand.frequencyDisplayNumberDecimals) : frequency.toString();
}

function findBand(frequency: number): SpectrumBand | undefined {
  for (const band of useSpectrumStore().bands) {
    if (frequency >= band.lowerFrequency && frequency <= band.upperFrequency) {
      return band;
    }
  }
}
