import { RadioConnection, RadioModel } from '@springfield/ham-radio-api';

interface ElectronAPI {
  serialPort: {
    reset: (path: string) => Promise<void>;
    list: () => Promise<PortInfo[]>;
  };
}

interface RadioAPI {
  onShowImportDialog: (callback: () => void) => void;
  onShowProgressDialog: (callback: () => void) => void;
  onHideProgressDialog: (callback: () => void) => void;
  onRadioProgressIndicator: (
    callback: (event: IpcRendererEvent, value: number) => void
  ) => void;
  importFromRadio: (connection: RadioConnection) => Promise<void>;
  cancel: () => Promise<void>;
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
