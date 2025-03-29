import { ipcMain } from "electron";
import BaofengModule from "@springfield/baofeng-driver";
import { RadioModule, RadioModel } from "@springfield/ham-radio-api";
import { ILogLayer } from "loglayer";

export class RadioModuleManager {
  private radioModulesById: Map<string, RadioModule>;
  private radioModelsById: Map<string, RadioModel>;

  constructor(logger: ILogLayer) {
    this.radioModulesById = new Map<string, RadioModule>();
    this.radioModelsById = new Map<string, RadioModel>();

    const module = new BaofengModule(logger); // TODO: load modules dynamically
    this.radioModulesById.set(module.getId(), module);

    module.getModels().forEach((model) => {
      this.radioModelsById.set(model.id, model);
    });

    ipcMain.handle("modules:getModels", () => {
      const models = Array.from(this.radioModelsById.values());
      console.log("getModels main", models);
      return models;
    });

    ipcMain.handle("modules:getSchema", async (_event, modelId: string) => {
      return this.radioModelsById.get(modelId)?.getSchema();
    });
  }

  public getRadioModule(moduleId: string): RadioModule | undefined {
    return this.radioModulesById.get(moduleId);
  }
}
