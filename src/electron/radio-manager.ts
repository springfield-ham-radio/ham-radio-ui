import { RadioConnection, RadioDriver, RadioMemory, RadioModel, RadioModuleId} from "@springfield/ham-radio-api";
import { ipcMain, BrowserWindow, dialog } from "electron";
import { ElectronRadioProgressIndicator } from "./radio-progress-indicator";
import fs from "fs";
import { ILogLayer } from 'loglayer';
import { DriverProvider } from "@springfield/baofeng-driver";
import { MODULE_ID as BAOFENG_MODULE_ID } from "@springfield/baofeng-module";

export class RadioManager {
  private mainWindow: BrowserWindow;
  private logger: ILogLayer;
  private radioProgressIndicator: ElectronRadioProgressIndicator;
  private driverProvidersByModuleId: Map<RadioModuleId, DriverProvider> = new Map();
  constructor(mainWindow: BrowserWindow, logger: ILogLayer) {
    logger.debug('RadioManager');
    this.mainWindow = mainWindow;
    this.logger = logger;

    this.driverProvidersByModuleId.set(BAOFENG_MODULE_ID, new DriverProvider(logger));
    this.radioProgressIndicator = new ElectronRadioProgressIndicator(mainWindow.webContents);

    ipcMain.handle("radio:read", async (_event, connection: RadioConnection) => {
      this.logger.withMetadata(connection).debug('ipcMain received radio:read message');
      this.mainWindow.webContents.send("radio:showProgressDialog");
      const result = await this.read(connection);
      this.mainWindow.webContents.send("radio:hideProgressDialog");
      this.mainWindow.webContents.send("radio:memory", connection.model, result);
      return result;
    });

    ipcMain.handle("radio:saveToFile", async (_event, memory) => {
      this.saveToFile(memory);
    });

    ipcMain.handle("radio:cancel", async () => {
      this.logger.debug('ipcMain received radio:cancel message');
      this.cancelRadioOperation();
    });
  }

  private async read(connection: RadioConnection): Promise<RadioMemory | string> {
    this.radioProgressIndicator.reset();
    const driver = this.getDriver(connection.model);

    const memory = await driver.readRadio(connection.serialPortPath, this.radioProgressIndicator);

    if (memory == undefined) {
      return "Canceled";
    }

    return memory;
  }

  private async saveToFile(memory: RadioMemory) {
    const results = await dialog.showSaveDialog(this.mainWindow, {});

    if (results.filePath) {
      fs.writeFileSync(results.filePath, JSON.stringify(memory, null, 2));
    }
  }

  private cancelRadioOperation() {
    this.radioProgressIndicator.isCanceled = true;
  }

  private getDriver(model: RadioModel): RadioDriver {
    const driverProvider = this.driverProvidersByModuleId.get(model.getModuleId());

    if (driverProvider == undefined) {
      throw new Error(`Driver provider for module ${model.getModuleId()} not found`);
    }

    return driverProvider.getDriver(model.getId());
  }
}
