import { app, BrowserWindow, nativeTheme, ipcMain, dialog } from 'electron';
import { ElectronRadioProgressIndicator } from './electron-radio-progress-indicator';
import path from 'path';
import os from 'os';
import fs from 'fs';
import BaofengModule from '@springfield/baofeng-driver';
import winston from 'winston';
import { strict as assert } from 'assert';
import { RadioConnection, RadioManufacturer, RadioModule } from '@springfield/ham-radio-api';
import { v4 as uuidv4 } from 'uuid';

// needed in case process is undefined under Linux
const platform = process.platform || os.platform();

try {
  if (platform === 'win32' && nativeTheme.shouldUseDarkColors === true) {
    require('fs').unlinkSync(path.join(app.getPath('userData'), 'DevTools Extensions'));
  }
} catch (_) {}

const logger = winston.createLogger({
  level: 'debug',
  transports: [new winston.transports.Console()],
  format: winston.format.simple(),
});

let mainWindow: BrowserWindow | undefined;

const modules = new Map<string, RadioModule>();
const manufacturers: RadioManufacturer[] = [];

const module = new BaofengModule(logger);

const manufacturer = module.getManufacturer();
manufacturer.id = uuidv4();

manufacturers.push(manufacturer);
modules.set(manufacturer.id, module);

function createWindow() {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    icon: path.resolve(__dirname, 'icons/icon.png'), // tray icon
    width: 1000,
    height: 600,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(__dirname, process.env.QUASAR_ELECTRON_PRELOAD),
    },
  });

  mainWindow.loadURL(process.env.APP_URL);
  const radioProgressIndicator = new ElectronRadioProgressIndicator(mainWindow.webContents);

  ipcMain.on('importFromRadio', async (_event, connection: RadioConnection) => {
    assert(mainWindow);
    radioProgressIndicator?.reset();
    const module = modules.get(connection.manufacturerId);
    const driver = module?.getDriver(connection.model);
    assert(driver);
    const program = await driver.importFromRadio(connection.serialPortPath, radioProgressIndicator);
    mainWindow.webContents.send('renderRadioProgram', program || null);
  });

  ipcMain.on('saveRadioProgram', async (_event, program) => {
    assert(mainWindow);
    const results = await dialog.showSaveDialog(mainWindow, {});

    if (results.filePath) {
      fs.writeFileSync(results.filePath, JSON.stringify(program, null, 2));
    }
  });

  ipcMain.on('getRadios', () => {
    mainWindow?.webContents.send('radios', manufacturers);
  });

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools();
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === undefined) {
    createWindow();
  }
});
