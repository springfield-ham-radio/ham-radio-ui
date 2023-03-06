import { RadioManufacturer } from '@springfield/ham-radio-api';
import { defineStore } from 'pinia';

export const useRadioStore = defineStore('radios', {
  state: () => ({
    manufacturers: [] as RadioManufacturer[],
  }),
});
