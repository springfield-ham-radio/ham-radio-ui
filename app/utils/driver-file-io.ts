import { saveJsonFileWithPicker, isTauriRuntime } from '~/utils/radio-memory-file-io';

/**
 * Open a driver JSON file without touching the radio-memory file handle.
 */
export async function openDriverJsonFile(): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return openDriverJsonInBrowser();
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await open({
    title: 'Open Driver',
    multiple: false,
    directory: false,
    filters: [{ name: 'Radio driver', extensions: ['json'] }],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  return invoke<string>('load_text_file', { path });
}

/**
 * Save driver JSON. Uses the shared picker so a driver save does not replace the open memory file.
 */
export async function saveDriverJsonFile(contents: string, defaultPath: string): Promise<string | undefined> {
  return saveJsonFileWithPicker(contents, defaultPath, {
    title: 'Save Driver',
    filterName: 'Radio driver',
  });
}

function openDriverJsonInBrowser(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.addEventListener('change', () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(undefined);
        return;
      }

      void file.text().then((text) => {
        resolve(text);
      });
    });

    input.addEventListener('cancel', () => {
      resolve(undefined);
    });

    input.click();
  });
}
