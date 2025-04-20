import { defineStore } from 'pinia';
import { RadioModel } from '@springfield/ham-radio-api';
import { ModelProvider } from "@springfield/baofeng-module";
import { ConsoleTransport, LogLayer } from 'loglayer';

export const useRadioStore = defineStore("radio-drivers", () => {
  const models: RadioModel[] = [];
const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: "debug",
    }),
  ],
});
  const initialize = async () => {
    const modelProvider = new ModelProvider(logger); // TODO: load modules dynamically

    models.push(...modelProvider.getModels());
  }

  return { models, initialize };
});
