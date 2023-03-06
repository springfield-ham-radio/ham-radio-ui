/**
 * This file is used specifically for security reasons.
 * Here you can access Nodejs stuff and inject functionality into
 * the renderer thread (accessible there through the "window" object)
 *
 * WARNING!
 * If you import anything from node_modules, then make sure that the package is specified
 * in package.json > dependencies and NOT in devDependencies
 *
 * Example (injects window.myAPI.doAThing() into renderer thread):
 *
 *   import { contextBridge } from 'electron'
 *
 *   contextBridge.exposeInMainWorld('myAPI', {
 *     doAThing: () => {}
 *   })
 *
 * WARNING!
 * If accessing Node functionality (like importing @electron/remote) then in your
 * electron-main.ts you will need to set the following when you instantiate BrowserWindow:
 *
 * mainWindow = new BrowserWindow({
 *   // ...
 *   webPreferences: {
 *     // ...
 *     sandbox: false // <-- to be able to import @electron/remote in preload script
 *   }
 * }
 */

import { RadioProgram } from '@springfield/ham-radio-api';
import { contextBridge, ipcRenderer } from 'electron';
import { SerialPort } from 'serialport';

contextBridge.exposeInMainWorld('serialport', {
  list: () => {
    return new Promise<string[]>(async (resolve) => {
      const ports = await SerialPort.list();
      const paths = ports.map((port) => port.path);
      resolve(paths);
    });
  },

  reset: (path: string) => {
    return new Promise<void>((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
      port.open((error) => {
        port.close(() => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    });
  },
});

contextBridge.exposeInMainWorld('radio', {
  getManufacturers: () => {
    ipcRenderer.send('getRadios');
  },

  importFromRadio: (path: string) => {
    ipcRenderer.send('importFromRadio', path);
  },

  cancelImport: () => {
    ipcRenderer.send('radioCancel');
  },

  save: (program: RadioProgram) => {
    ipcRenderer.send('saveRadioProgram', program);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  onRadios: (callback) => ipcRenderer.on('radios', callback),
  onRenderRadioProgram: (callback) => ipcRenderer.on('renderRadioProgram', callback),
  onRadioProgressIndicator: (callback) => ipcRenderer.on('radioProgressIndicator', callback),
});
