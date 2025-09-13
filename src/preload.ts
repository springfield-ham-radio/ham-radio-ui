// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { RadioConnection, RadioMemory, RadioId, RadioProgram } from '@springfield/ham-radio-api';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld("modules", {
  getModels: () => ipcRenderer.invoke("modules:getModels"),
});

contextBridge.exposeInMainWorld("registry", {
  discoverConfigurations: () => ipcRenderer.invoke("registry:discover-configurations"),
  getManufacturers: () => ipcRenderer.invoke("registry:get-manufacturers"),
  getModelsByManufacturer: (manufacturer: string) => ipcRenderer.invoke("registry:get-models-by-manufacturer", manufacturer),
  getConfiguration: (modelId: string) => ipcRenderer.invoke("registry:get-configuration", modelId),
});

contextBridge.exposeInMainWorld("radio", {
  onShowImportDialog: (callback: () => void) => {
    ipcRenderer.on("radio:showImportDialog", callback);
  },

  onShowProgressDialog: (callback: () => void) => {
    ipcRenderer.on("radio:showProgressDialog", callback);
  },

  onHideProgressDialog: (callback: () => void) => {
    ipcRenderer.on("radio:hideProgressDialog", callback);
  },

  onRadioProgressIndicator: (
    callback: (event: IpcRendererEvent, value: number) => void
  ) => ipcRenderer.on("radio:updateProgressIndicator", callback),

  onRadioMemory: (
    callback: (event: IpcRendererEvent, radioId: RadioId, memory: RadioMemory, program?: RadioProgram, serialLogData?: any) => void
  ) => {
    ipcRenderer.on("radio:memory", (event, radioId, memory, program, serialLogData) => {
      callback(event, radioId, memory, program, serialLogData);
    });
  },

  importFromRadio: (connection: RadioConnection) => {
    ipcRenderer.invoke("radio:read", connection);
  },

  cancel: () => {
    ipcRenderer.invoke("radio:cancel");
  },
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  serialPort: {
    reset: (path: string) => ipcRenderer.invoke("reset-serialport", path),
    list: () => ipcRenderer.invoke("list-ports"),
  },

  dialog: {
  },

  onFileOpen: (callback: (event: IpcRendererEvent, data: { filePath: string }) => void) => {
    ipcRenderer.on("file-open", callback);
  },

  readFile: (filePath: string) => {
    return ipcRenderer.invoke("read-file", filePath);
  },
});
