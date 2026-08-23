/**
 * Read and write radio memory JSON using the native file dialog in Tauri,
 * with a browser fallback for `yarn dev` without the desktop shell.
 */

import { memoryFileDisplayName, withJsonExtension } from '~/utils/radio-memory-file';

export interface PickedTextFile {
  text: string;
  /** Absolute path in Tauri, or the file name in the browser fallback. */
  path: string;
}

interface BrowserSaveFilePicker {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
}

let browserFileHandle: FileSystemFileHandle | undefined;

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Drop any browser File System Access handle, used when memory no longer maps to a file.
 */
export function clearBrowserFileHandle(): void {
  browserFileHandle = undefined;
}

/**
 * Prompt for a file and return its text contents, or undefined if the user cancels.
 */
export async function readTextFileWithPicker(): Promise<PickedTextFile | undefined> {
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

  const text = await invoke<string>('load_text_file', { path });
  return { text, path };
}

/**
 * Write text contents to a known destination without prompting.
 */
export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (!isTauriRuntime()) {
    await writeTextFileInBrowser(path, contents);
    return;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('save_text_file', { path: withJsonExtension(path), contents });
}

/**
 * Prompt for a destination and write text contents.
 *
 * @returns the chosen path, or undefined when the user cancels the dialog.
 */
export async function writeTextFileWithPicker(contents: string, defaultPath: string): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return saveTextFileInBrowser(contents, defaultPath);
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title: 'Save Radio Memory',
    defaultPath,
    filters: [{ name: 'Radio Memory', extensions: ['json'] }],
  });

  if (path == null) {
    return undefined;
  }

  const destination = withJsonExtension(path);
  await invoke('save_text_file', { path: destination, contents });
  return destination;
}

export interface SaveJsonFileOptions {
  title: string;
  filterName: string;
}

/**
 * Prompt for a JSON destination without replacing the open memory file handle.
 */
export async function saveJsonFileWithPicker(
  contents: string,
  defaultPath: string,
  options: SaveJsonFileOptions,
): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return saveStandaloneJsonFileInBrowser(contents, defaultPath, options.filterName);
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title: options.title,
    defaultPath,
    filters: [{ name: options.filterName, extensions: ['json'] }],
  });

  if (path == null) {
    return undefined;
  }

  const destination = withJsonExtension(path);
  await invoke('save_text_file', { path: destination, contents });
  return destination;
}

async function pickTextFileInBrowser(): Promise<PickedTextFile | undefined> {
  const picker = window as Window & BrowserSaveFilePicker;

  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({
        types: [
          {
            description: 'Radio Memory',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      if (!handle) {
        return undefined;
      }

      browserFileHandle = handle;
      const file = await handle.getFile();
      return { text: await file.text(), path: handle.name };
    } catch (error) {
      if (isAbortError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  return pickTextFileWithInput();
}

function pickTextFileWithInput(): Promise<PickedTextFile | undefined> {
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

      browserFileHandle = undefined;
      void file.text().then((text) => {
        resolve({ text, path: file.name });
      });
    });

    input.addEventListener('cancel', () => {
      resolve(undefined);
    });

    input.click();
  });
}

async function saveStandaloneJsonFileInBrowser(
  contents: string,
  defaultPath: string,
  filterName: string,
): Promise<string | undefined> {
  const picker = window as Window & BrowserSaveFilePicker;
  const suggestedName = withJsonExtension(memoryFileDisplayName(defaultPath));

  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: filterName,
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (isAbortError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  downloadTextFile(contents, suggestedName);
  return suggestedName;
}

async function saveTextFileInBrowser(contents: string, defaultPath: string): Promise<string | undefined> {
  const picker = window as Window & BrowserSaveFilePicker;
  const suggestedName = withJsonExtension(memoryFileDisplayName(defaultPath));

  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Radio Memory',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      browserFileHandle = handle;
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return handle.name;
    } catch (error) {
      if (isAbortError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  downloadTextFile(contents, suggestedName);
  return suggestedName;
}

async function writeTextFileInBrowser(path: string, contents: string): Promise<void> {
  if (browserFileHandle) {
    const writable = await browserFileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
    return;
  }

  downloadTextFile(contents, withJsonExtension(memoryFileDisplayName(path)));
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
