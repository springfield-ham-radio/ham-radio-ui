/**
 * Read and write radio memory JSON using the native file dialog in Tauri,
 * with a browser fallback for `yarn dev` without the desktop shell.
 */

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Prompt for a file and return its text contents, or undefined if the user cancels.
 */
export async function readTextFileWithPicker(): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return pickTextFileInBrowser();
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await open({
    title: 'Open Radio Memory',
    multiple: false,
    directory: false,
    filters: [{ name: 'Radio Memory', extensions: ['json'] }],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  return invoke<string>('load_text_file', { path });
}

/**
 * Prompt for a destination and write text contents.
 *
 * @returns false when the user cancels the dialog.
 */
export async function writeTextFileWithPicker(contents: string, defaultFileName: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    downloadTextFile(contents, defaultFileName);
    return true;
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title: 'Save Radio Memory',
    defaultPath: defaultFileName,
    filters: [{ name: 'Radio Memory', extensions: ['json'] }],
  });

  if (path == null) {
    return false;
  }

  await invoke('save_text_file', { path, contents });
  return true;
}

function pickTextFileInBrowser(): Promise<string | undefined> {
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

      void file.text().then(resolve);
    });

    input.addEventListener('cancel', () => {
      resolve(undefined);
    });

    input.click();
  });
}

function downloadTextFile(contents: string, defaultFileName: string): void {
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = defaultFileName;
  link.click();
  URL.revokeObjectURL(url);
}
