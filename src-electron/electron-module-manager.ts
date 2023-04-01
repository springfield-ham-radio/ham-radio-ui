import { WebContents, ipcMain } from 'electron';
import BaofengModule from '@springfield/baofeng-driver';
import { RadioModule, RadioModel } from '@springfield/ham-radio-api';
import { Logger } from 'winston';

export class ElectronModuleManager {
  private radioModulesById: Map<string, RadioModule>;
  private radioModelsById: Map<string, RadioModel>;

  constructor(webContents: WebContents, logger: Logger) {
    this.radioModulesById = new Map<string, RadioModule>();
    this.radioModelsById = new Map<string, RadioModel>();

    const module = new BaofengModule(logger);
    this.radioModulesById.set(module.getId(), module);

    module.getModels().forEach((model) => {
      this.radioModelsById.set(model.getId(), model);
    });

    ipcMain.on('modules:getModels', () => {
      webContents.send('models', Array.from(this.radioModelsById.values()));
    });

    ipcMain.on('modules:getSchema', async (_event, modelId: string) => {
      const model = this.radioModelsById.get(modelId);

      if (model != undefined) {
        const module = this.radioModulesById.get(model.moduleId);

        if (module != undefined) {
          webContents.send('schema', await module.getSchema(modelId));
        }
      }
    });
  }

  public getRadioModule(moduleId: string): RadioModule | undefined {
    return this.radioModulesById.get(moduleId);
  }
}
