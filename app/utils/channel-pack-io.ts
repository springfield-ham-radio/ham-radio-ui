import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { CHANNEL_PACK_FILE_EXTENSION } from '~/utils/channel-pack';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

const PACK_FILTER = { name: 'Channel pack', extensions: [CHANNEL_PACK_FILE_EXTENSION] as string[] };

export async function saveChannelPackWithPicker(contents: string, suggestedName: string): Promise<string | undefined> {
  const defaultPath = suggestedName.endsWith(`.${CHANNEL_PACK_FILE_EXTENSION}`)
    ? suggestedName
    : `${suggestedName}.${CHANNEL_PACK_FILE_EXTENSION}`;

  if (!isTauriRuntime()) {
    return savePackInBrowser(contents, defaultPath);
  }

  const path = await save({
    title: 'Export Channel Pack',
    defaultPath,
    filters: [PACK_FILTER],
  });

  if (path == null) {
    return undefined;
  }

  const destination = path.toLowerCase().endsWith(`.${CHANNEL_PACK_FILE_EXTENSION}`)
    ? path
    : `${path}.${CHANNEL_PACK_FILE_EXTENSION}`;
  await invoke('save_text_file', { path: destination, contents });
  return destination;
}

export async function readChannelPackWithPicker(): Promise<{ text: string; name?: string } | undefined> {
  if (!isTauriRuntime()) {
    const text = await readPackInBrowser();

    if (text === undefined) {
      return undefined;
    }

    return { text, name: 'channel-pack.hpack' };
  }

  const path = await open({
    title: 'Import Channel Pack',
    multiple: false,
    directory: false,
    filters: [PACK_FILTER],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  const text = await invoke<string>('load_text_file', { path });
  const name = path.replaceAll('\\', '/').split('/').pop();
  return { text, name };
}

async function savePackInBrowser(contents: string, defaultPath: string): Promise<string | undefined> {
  const picker = window as Window & {
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>;
  };

  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: defaultPath,
        types: [
          {
            description: 'Channel pack',
            accept: { 'application/json': [`.${CHANNEL_PACK_FILE_EXTENSION}`] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return handle.name;
    } catch {
      return undefined;
    }
  }

  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultPath;
  anchor.click();
  URL.revokeObjectURL(url);
  return defaultPath;
}

async function readPackInBrowser(): Promise<string | undefined> {
  const picker = window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> };

  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Channel pack',
            accept: { 'application/json': [`.${CHANNEL_PACK_FILE_EXTENSION}`] },
          },
        ],
      });

      const file = await handle.getFile();
      return await file.text();
    } catch {
      return undefined;
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `.${CHANNEL_PACK_FILE_EXTENSION},application/json`;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];

      if (!file) {
        resolve(undefined);
        return;
      }

      resolve(await file.text());
    });
    input.click();
  });
}
