import { RadioConnection, RadioModel, RadioModelId, RadioMemory, RadioProgram } from '@springfield/ham-radio-api';
import type { RegistryRadio } from '@springfield/ham-radio-registry/dist/types/radio-config.js';

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
  onRadioMemory: (
    callback: (event: IpcRendererEvent, model: RadioModel, memory: RadioMemory, decodedProgram?: RadioProgram, serialLogData?: any) => void
  ) => void;
  onRadioError: (callback: (event: IpcRendererEvent, errorMessage: string) => void) => void;
  importFromRadio: (connection: RadioConnection) => Promise<void>;
  cancel: () => Promise<void>;
}

interface RadioModuleAPI {
  getModels: () => Promise<RadioModel[]>
}

interface RegistryAPI {
  discoverConfigurations: () => Promise<{ success: boolean; data?: RegistryRadio[]; error?: string }>;
  getManufacturers: () => Promise<{ success: boolean; data?: string[]; error?: string }>;
  getModelsByManufacturer: (manufacturer: string) => Promise<{ success: boolean; data?: { id: RadioModelId; name: string; config: RegistryRadio }[]; error?: string }>;
  getConfiguration: (modelId: RadioModelId) => Promise<{ success: boolean; data?: RegistryRadio; error?: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    modules: RadioModuleAPI;
    radio: RadioAPI;
    registry: RegistryAPI;
  }
}

export { };
