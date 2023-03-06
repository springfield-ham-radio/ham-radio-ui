import { RadioManufacturer, RadioModel } from '@springfield/ham-radio-api';
import { defineStore } from 'pinia';

export const useRadioStore = defineStore('radios', {
  state: () => ({
    manufacturers: [] as RadioManufacturer[],
    models: [] as RadioModel[],
  }),
  actions: {
    loadManufacturers() {
      window.radio.getManufacturers();
    },

    loadModels(radioModuleId: string) {
      window.radio.getModels(radioModuleId);
    },
  },
});
