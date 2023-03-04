import { defineStore } from 'pinia';

const radioModels = [
  { id: '1', modelName: 'UV-5RE Plus', manufacturerId: '1' },
  { id: '2', modelName: 'TM-D710GA', manufacturerId: '2' },
];

const radioManufacturers = [
  { id: '1', name: 'Baofeng' },
  { id: '2', name: 'Kenwood' },
];

export const useRadioStore = defineStore('radios', {
  state: () => ({
    manufacturers: radioManufacturers,
    models: radioModels,
    currentRadio: undefined,
  }),
});
