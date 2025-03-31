import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import { SerialPort } from 'serialport';
import { ConsoleTransport, LogLayer } from 'loglayer';
import { RadioModuleManager } from './electron/radio-module-manager';
import { RadioManager } from './electron/radio-manager';

// import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// if (started) {
//   app.quit();
// }

const logger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  new RadioManager(new RadioModuleManager(logger), mainWindow, logger);

  // Create the application menu
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Import From Radio...',
          accelerator: process.platform === 'darwin' ? 'Cmd+I' : 'Ctrl+I',
          click: () => {
            mainWindow.webContents.send('show-import-dialog');
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.handle("list-ports", async () => {
  try {
    return await SerialPort.list();
  } catch (error) {
    console.error("Error listing serial ports:", error);
    throw error;
  }
});

ipcMain.handle("reset-serialport", async (_, path: string) => {
  try {
    const port = new SerialPort({ path, baudRate: 9600 });
    await port.close();
    await port.open();
  } catch (error) {
    console.error("Error resetting serial port:", error);
    throw error;
  }
});
