import { RadioConnection, RadioMemory, RadioProgram} from "@springfield/ham-radio-api";
import { ipcMain, BrowserWindow, dialog } from "electron";
import { ElectronRadioProgressIndicator } from "./radio-progress-indicator";
import fs from "fs";
import { RadioModuleManager } from "./radio-module-manager";

export class RadioManager {
  private moduleManager: RadioModuleManager;
  private mainWindow: BrowserWindow;
  private radioProgressIndicator: ElectronRadioProgressIndicator;

  constructor(moduleManger: RadioModuleManager, mainWindow: BrowserWindow) {
    this.moduleManager = moduleManger;
    this.mainWindow = mainWindow;
    this.radioProgressIndicator = new ElectronRadioProgressIndicator(mainWindow.webContents);

    ipcMain.on("radio:read", async (_event, connection: RadioConnection) => {
      this.read(connection);
    });

    ipcMain.on("radio:saveToFile", async (_event, program, memory) => {
      this.saveToFile(program, memory);
    });

    ipcMain.on("radio:cancel", async () => {
      this.cancelRadioOperation();
    });
  }

  private async read(connection: RadioConnection) {
    this.radioProgressIndicator.reset();
    const module = this.moduleManager.getRadioModule(connection.manufacturerId);
    const driver = module?.getDriver(connection.model);

    if (driver == undefined) {
      this.mainWindow.webContents.send("radio:program", {
        ok: false,
        error: "No driver found",
      });
      return;
    }

    const memory = await driver.readRadio(
      connection.serialPortPath,
      this.radioProgressIndicator
    );

    if (memory == undefined) {
      this.mainWindow.webContents.send("radio:program", {
        ok: false,
        error: "Canceled",
      });
      return;
    }

    const program = driver.decodeMemory(memory);
    this.mainWindow.webContents.send("radio:program", { ok: true, program });
  }

  private async saveToFile(program: RadioProgram, memory: RadioMemory) {
    const results = await dialog.showSaveDialog(this.mainWindow, {});

    if (results.filePath) {
      fs.writeFileSync(
        results.filePath,
        JSON.stringify({ program, memory }, null, 2)
      );
    }
  }

  private cancelRadioOperation() {
    this.radioProgressIndicator.isCanceled = true;
  }
}
