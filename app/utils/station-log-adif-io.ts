import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const ADI_FILTER = { name: 'ADIF', extensions: ['adi', 'adif'] as string[] };

/**
 * Prompt for a destination and write station-log ADI contents.
 */
export async function saveStationLogAdifWithPicker(contents: string): Promise<string | undefined> {
  const defaultPath = 'station-log.adi';

  if (!isTauriRuntime()) {
    return saveAdiInBrowser(contents, defaultPath);
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title: 'Export Station Log',
    defaultPath,
    filters: [ADI_FILTER],
  });

  if (path == null) {
    return undefined;
  }

  const lower = path.toLowerCase();
  const destination = lower.endsWith('.adi') || lower.endsWith('.adif') ? path : `${path}.adi`;
  await invoke('save_text_file', { path: destination, contents });
  return destination;
}

/**
 * Prompt for an ADI file and return its text contents.
 */
export async function readStationLogAdifWithPicker(): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return readAdiInBrowser();
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await open({
    title: 'Import Station Log',
    multiple: false,
    directory: false,
    filters: [ADI_FILTER],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  return invoke<string>('load_text_file', { path });
}

async function saveAdiInBrowser(contents: string, defaultPath: string): Promise<string | undefined> {
  const picker = window as Window & {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  };

  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: defaultPath,
        types: [
          {
            description: 'ADIF',
            accept: { 'text/plain': ['.adi', '.adif'] },
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

  const blob = new Blob([contents], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultPath;
  link.click();
  URL.revokeObjectURL(url);
  return defaultPath;
}

function readAdiInBrowser(): Promise<string | undefined> {
  const picker = window as Window & {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  };

  if (picker.showOpenFilePicker) {
    return (async () => {
      try {
        const [handle] = await picker.showOpenFilePicker({
          types: [
            {
              description: 'ADIF',
              accept: { 'text/plain': ['.adi', '.adif'] },
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
    input.accept = '.adi,.adif,text/plain';

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
