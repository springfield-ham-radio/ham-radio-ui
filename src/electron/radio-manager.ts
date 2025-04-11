import { RadioConnection, RadioMemory} from "@springfield/ham-radio-api";
import { ipcMain, BrowserWindow, dialog } from "electron";
import { ElectronRadioProgressIndicator } from "./radio-progress-indicator";
import fs from "fs";
import { RadioModuleManager } from "./radio-module-manager";
import { ILogLayer } from 'loglayer';

export class RadioManager {
  private moduleManager: RadioModuleManager;
  private mainWindow: BrowserWindow;
  private logger: ILogLayer;
  private radioProgressIndicator: ElectronRadioProgressIndicator;

  constructor(moduleManger: RadioModuleManager, mainWindow: BrowserWindow, logger: ILogLayer) {
    logger.debug('RadioManager');
    this.moduleManager = moduleManger;
    this.mainWindow = mainWindow;
    this.logger = logger;

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
    const module = this.moduleManager.getRadioModule(connection.model.module);
    const driver = module?.getDriver(connection.model.id);

    if (driver == undefined) {
      return "No driver found";
    }

    const memory = await driver.readRadio(
      connection.serialPortPath,
      this.radioProgressIndicator
    );

    if (memory == undefined) {
      return "Canceled";
    }

    return memory;
  }

  private async saveToFile(memory: RadioMemory) {
    const results = await dialog.showSaveDialog(this.mainWindow, {});

    if (results.filePath) {
      fs.writeFileSync(
        results.filePath,
        JSON.stringify(memory, null, 2)
      );
    }
  }

  private cancelRadioOperation() {
    this.radioProgressIndicator.isCanceled = true;
  }
}
