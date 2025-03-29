import { RadioProgram } from "@springfield/ham-radio-api";
import { contextBridge, ipcRenderer } from "electron";
import { SerialPort } from "serialport";

contextBridge.exposeInMainWorld("serialport", {
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

contextBridge.exposeInMainWorld("db", {});

contextBridge.exposeInMainWorld("modules", {
  getManufacturers: () => {
    ipcRenderer.send("modules:getManufacturers");
  },

  getModels: (moduleId: string) => {
    ipcRenderer.send("modules:getModels", moduleId);
  },
});

contextBridge.exposeInMainWorld("radio", {
  importFromRadio: (path: string) => {
    ipcRenderer.send("radio:read", path);
  },

  cancelImport: () => {
    ipcRenderer.send("radio:cancel");
  },

  save: (program: RadioProgram) => {
    ipcRenderer.send("radio:saveToFile", program);
  },
});

contextBridge.exposeInMainWorld("electronAPI", {
  onManufacturers: (callback) => ipcRenderer.on("manufacturers", callback),
  onModels: (callback) => ipcRenderer.on("models", callback),
  onRenderRadioProgram: (callback) =>
    ipcRenderer.on("renderRadioProgram", callback),
  onRadioProgressIndicator: (callback) =>
    ipcRenderer.on("radioProgressIndicator", callback),
  onDatabaseConnection: (callback) =>
    ipcRenderer.on("databaseConnection", callback),
});
