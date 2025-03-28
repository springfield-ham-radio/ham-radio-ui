import { defineStore } from 'pinia';
import { RadioModel } from '@springfield/ham-radio-api';

export const useRadioStore = defineStore("radio-drivers", () => {
  const models: RadioModel[] = [];

  const initialize = async () => {
    models.push(...await window.electron.radio.listModels());
  }

  return { models, initialize };
});
