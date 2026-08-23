import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const CSV_FILTER = { name: 'CSV', extensions: ['csv'] as string[] };

/**
 * Prompt for a destination and write channel-library CSV contents.
 */
export async function saveChannelLibraryCsvWithPicker(contents: string): Promise<string | undefined> {
  const defaultPath = 'channel-library.csv';

  if (!isTauriRuntime()) {
    return saveCsvInBrowser(contents, defaultPath);
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title: 'Export Channel Library',
    defaultPath,
    filters: [CSV_FILTER],
  });

  if (path == null) {
    return undefined;
  }

  const destination = path.toLowerCase().endsWith('.csv') ? path : `${path}.csv`;
  await invoke('save_text_file', { path: destination, contents });
  return destination;
}

/**
 * Prompt for a CSV file and return its text contents.
 */
export async function readChannelLibraryCsvWithPicker(): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return readCsvInBrowser();
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await open({
    title: 'Import Channel Library',
    multiple: false,
    directory: false,
    filters: [CSV_FILTER],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  return invoke<string>('load_text_file', { path });
}

async function saveCsvInBrowser(contents: string, defaultPath: string): Promise<string | undefined> {
  const picker = window as Window & {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  };

  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: defaultPath,
        types: [
          {
            description: 'CSV',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return undefined;
      }

      throw error;
    }
  }

  const blob = new Blob([contents], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultPath;
  link.click();
  URL.revokeObjectURL(url);
  return defaultPath;
}

function readCsvInBrowser(): Promise<string | undefined> {
  const picker = window as Window & {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  };

  if (picker.showOpenFilePicker) {
    return (async () => {
      try {
        const [handle] = await picker.showOpenFilePicker({
          types: [
            {
              description: 'CSV',
              accept: { 'text/csv': ['.csv'] },
            },
          ],
        });

        if (!handle) {
          return undefined;
        }

        const file = await handle.getFile();
        return file.text();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return undefined;
        }

        throw error;
      }
    })();
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';

    input.addEventListener('change', () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(undefined);
        return;
      }

      void file.text().then(resolve);
    });

    input.addEventListener('cancel', () => {
      resolve(undefined);
    });

    input.click();
  });
}
