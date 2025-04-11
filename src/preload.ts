// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { RadioConnection, RadioMemory, RadioModel } from '@springfield/ham-radio-api';
import { RadioMemorySegment, RadioSegmentedMemory } from '@springfield/ham-radio-driver-utils';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// These interfaces help document the shape of the serialized data
interface SerializedRadioMemorySegment {
  startAddress: number;
  length: number;
  data: Uint8Array;
}

interface SerializedRadioSegmentedMemory {
  segments: SerializedRadioMemorySegment[];
}

contextBridge.exposeInMainWorld("modules", {
  getModels: () => ipcRenderer.invoke("modules:getModels"),
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
    callback: (event: IpcRendererEvent, model: RadioModel, memory: RadioMemory) => void
  ) => {
    ipcRenderer.on("radio:memory", (event, model, memory) => {
      callback(event, model, memory);
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
});
