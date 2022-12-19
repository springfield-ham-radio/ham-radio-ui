import { defineStore } from 'pinia';

export const useRadiosStore = defineStore('radios', {
  state: () => ({
    manufacturers: [
      { id: '1', name: 'Baofeng' },
      { id: '2', name: 'Kenwood' },
    ],
    models: [
      { id: '1', name: 'UV-5RE Plus', manufacturerId: '1' },
      { id: '2', name: 'TM-D710GA', manufacturerId: '2' },
    ],
    currentRadio: undefined,
  }),
});
