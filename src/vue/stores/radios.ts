import { defineStore } from 'pinia';
import { Radio, RadioModelId } from '@springfield/ham-radio-api';
import { BaofengModule } from "@springfield/baofeng-module";
import { ConsoleTransport, LogLayer } from 'loglayer';

export const useRadioStore = defineStore("radio-drivers", () => {
  const radiosById: Map<RadioModelId, Radio> = new Map();
  const logger = new LogLayer({
    transport: [
      new ConsoleTransport({
        logger: console,
        level: "debug",
      }),
    ],
  });

  const initialize = async () => {
    const module = new BaofengModule(logger); // TODO: load modules dynamically

    for (const radio of module.getRadios()) {
      radiosById.set(radio.getId().model, radio);
    }
  }

  return { radiosById, initialize };
});
