// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron', {
    radio: {
      listModels: () => ipcRenderer.invoke('list-radio-models'),
    },

    serialPort: {
      reset: (path: string) => ipcRenderer.invoke('reset-serialport', path),
      list: () => ipcRenderer.invoke('list-ports'),
    },
  }
);
