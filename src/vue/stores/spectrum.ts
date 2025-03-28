import { defineStore } from 'pinia';

interface Band {
  id: string;
  name: string;
  wavelength: number;
  lowerFrequency: number;
  upperFrequency: number;
  frequencyDisplayBaseMultiplier: number;
  frequencyDisplayNumberDecimals: number;
  privilegeIds: string[];
}

const bands: Band[] = [
  {
    id: '1',
    name: '2m',
    wavelength: 2 * 10 ** 6,
    lowerFrequency: 144 * 10 ** 6,
    upperFrequency: 148 * 10 ** 6,
    frequencyDisplayBaseMultiplier: 6,
    frequencyDisplayNumberDecimals: 3,
    privilegeIds: [],
  },
  {
    id: '2',
    name: '70cm',
    wavelength: 70 * 10 ** 4,
    lowerFrequency: 420 * 10 ** 6,
    upperFrequency: 450 * 10 ** 6,
    frequencyDisplayBaseMultiplier: 6,
    frequencyDisplayNumberDecimals: 3,
    privilegeIds: [],
  },
];

export const useSpectrumStore = defineStore('spectrums', {
  state: () => ({
    bands: bands,
  }),
});
