interface ElectronAPI {
  radio: {
    listModels: () => Promise<RadioModel[]>;
  },

  serialPort: {
    reset: (path: string) => Promise<void>;
    list: () => Promise<PortInfo[]>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export { };
