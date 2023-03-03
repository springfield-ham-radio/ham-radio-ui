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

import { contextBridge, ipcRenderer } from 'electron';
import { SerialPort } from 'serialport';

contextBridge.exposeInMainWorld('serialport', {
  list: () => {
    return SerialPort.list();
  },

  reset: (path: string) => {
    return new Promise<void>((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
      port.open((error) => {
        if (error) {
          reject(error);
        }

        port.close(() => {
          resolve();
        });
      });
    });
  },
});

contextBridge.exposeInMainWorld('radio', {
  importFromRadio: (path: string) => {
    ipcRenderer.send('importFromRadio', path);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  onRenderRadioProgram: (callback) => ipcRenderer.on('renderRadioProgram', callback),
  onRadioProgressIndicator: (callback) => ipcRenderer.on('radioProgressIndicator', callback),
});
