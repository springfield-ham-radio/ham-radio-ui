import { RadioConnection, RadioMemory, RadioId, RadioProgram, RadioModelId } from "@springfield/ham-radio-api";
import { RadioDriver } from "@springfield/ham-radio-driver";
import { ipcMain, BrowserWindow, dialog } from "electron";
import { ElectronRadioProgressIndicator } from "./radio-progress-indicator";
import fs from "fs";
import { ILogLayer } from 'loglayer';
import type { RegistryRadio } from '@springfield/ham-radio-registry';
import type { RegistryManager } from './registry-manager';

export class RadioManager {
  private mainWindow: BrowserWindow;
  private logger: ILogLayer;
  private radioProgressIndicator: ElectronRadioProgressIndicator;
  private registryManager: RegistryManager;
  
  constructor(mainWindow: BrowserWindow, logger: ILogLayer, registryManager: RegistryManager) {
    logger.debug('RadioManager');
    this.mainWindow = mainWindow;
    this.logger = logger;
    this.registryManager = registryManager;
    this.radioProgressIndicator = new ElectronRadioProgressIndicator(mainWindow.webContents);

    ipcMain.handle("radio:read", async (_event, connection: RadioConnection) => {
      this.logger.withMetadata(connection).debug('ipcMain received radio:read message');
      this.mainWindow.webContents.send("radio:showProgressDialog");
      const result = await this.read(connection);
      this.mainWindow.webContents.send("radio:hideProgressDialog");
      
      // If memory was successfully read, also decode it
      if (typeof result !== 'string') {
        const decodedProgram = await this.decodeMemory(connection.radio.model, result);
        this.mainWindow.webContents.send("radio:memory", connection.radio, result, decodedProgram);
      } else {
        this.mainWindow.webContents.send("radio:memory", connection.radio, result);
      }
      
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
    const driver = await this.getDriver(connection.radio);

    const memoryData = await driver.readRadio(connection.serialPortPath, this.radioProgressIndicator);

    if (memoryData == undefined) {
      return "Canceled";
    }

    // Convert the Uint8Array to RadioMemory format
    const memory: RadioMemory = {
      model: connection.radio.model,
      contents: memoryData
    };

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

  private async decodeMemory(modelId: RadioModelId, memory: RadioMemory): Promise<RadioProgram | undefined> {
    try {
      this.logger.withMetadata({ modelId }).info(`🔍 Decoding memory for model: ${modelId}`);
      
      const codec = await this.registryManager.getCodecDirect(modelId);
      if (!codec) {
        this.logger.withMetadata({ modelId }).warn(`⚠️ No codec found for ${modelId}`);
        return undefined;
      }
      
      this.logger.withMetadata({ modelId }).info(`✅ Got codec, decoding memory...`);
      const decodedProgram = codec.decode(memory);
      
      this.logger.withMetadata({ 
        modelId, 
        channelCount: decodedProgram.channels?.length || 0,
        settingsKeys: Object.keys(decodedProgram.settings || {}).length
      }).info(`📻 Successfully decoded memory`);
      
      return decodedProgram;
    } catch (error) {
      this.logger.withError(error).error(`💥 Failed to decode memory for ${modelId}`);
      return undefined;
    }
  }

  private async getDriver(id: RadioId): Promise<RadioDriver> {
    try {
      // Get the radio configuration from the registry manager
      const registryRadio = await this.registryManager.getConfigurationDirect(id.model);
      
      if (!registryRadio) {
        throw new Error(`Radio configuration for model ${id.model} not found in registry`);
      }
      
      // Convert RegistryRadio to Radio interface expected by RadioDriver
      const radio = this.convertRegistryRadioToRadio(registryRadio);
      
      // Create and return the RadioDriver with serial logging enabled
      const driver = new RadioDriver(radio, this.logger, undefined, true);
      
      // Log the serial log file path for user reference
      const logPath = driver.getSerialLogFilePath();
      if (logPath) {
        this.logger.info(`Serial logging enabled. Log file will be saved to: ${logPath}`);
      }
      
      return driver;
      
    } catch (error) {
      this.logger.withError(error).error(`Failed to get driver for radio ${id.model}`);
      throw new Error(`Failed to get driver for radio ${id.model}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private convertRegistryRadioToRadio(registryRadio: RegistryRadio): any {
    // Convert RegistryRadio to the Radio interface expected by RadioDriver
    // The RadioDriver expects the same structure, so we can mostly pass it through
    return {
      id: registryRadio.id,
      version: registryRadio.version,
      description: registryRadio.description,
      settingsSchema: registryRadio.settingsSchema,
      memoryConfig: registryRadio.memoryConfig,
      serialConfig: registryRadio.serialConfig,
      readMemory: registryRadio.readMemory,
      writeMemory: registryRadio.writeMemory
    };
  }
}
