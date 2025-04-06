import { RadioConnection, RadioModel } from '@springfield/ham-radio-api';

interface ElectronAPI {
  dialog: {
    onShowImportDialog: (callback: () => void) => void;
    onShowImportProgressDialog: (callback: () => void) => void;
    onHideImportProgressDialog: (callback: () => void) => void;
    onRadioProgressIndicator: (
      callback: (event: IpcRendererEvent, value: number) => void
    ) => void;
  };

  serialPort: {
    reset: (path: string) => Promise<void>;
    list: () => Promise<PortInfo[]>;
  };
}

interface RadioAPI {
  importFromRadio: (connection: RadioConnection) => Promise<void>
  cancelImport: () => Promise<void>
}

interface RadioModuleAPI {
  getModels: () => Promise<RadioModel[]>
}

declare global {
  interface Window {
    electron: ElectronAPI;
    modules: RadioModuleAPI;
    radio: RadioAPI;
  }
}

export { };
