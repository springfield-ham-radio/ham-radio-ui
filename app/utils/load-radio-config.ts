import type { RegistryRadio } from '@springfield/ham-radio-registry';
import { hydrateRadioConfigFromDocuments } from '~/utils/radio-catalog-db';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

interface RefObject {
  $ref: string;
}

function isRefObject(value: unknown): value is RefObject {
  return typeof value === 'object' && value !== null && '$ref' in value && typeof (value as RefObject).$ref === 'string';
}

function collectRefs(value: unknown, refs: Set<string>): void {
  if (isRefObject(value)) {
    refs.add(value.$ref);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, refs);
    }

    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const nested of Object.values(value)) {
      collectRefs(nested, refs);
    }
  }
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '.' : normalized.slice(0, index);
}

function joinPath(base: string, relative: string): string {
  const baseParts = dirname(base).split('/').filter(Boolean);
  const relativeParts = relative.replace(/\\/g, '/').split('/');

  for (const part of relativeParts) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      baseParts.pop();
      continue;
    }

    baseParts.push(part);
  }

  const isAbsolute = base.startsWith('/');
  return `${isAbsolute ? '/' : ''}${baseParts.join('/')}`;
}

/**
 * Load a radio config JSON file and resolve relative `$ref` siblings when possible.
 */
export async function loadRadioConfigFromFile(path: string, text: string): Promise<RegistryRadio> {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Radio configuration must be a JSON object');
  }

  const refs = new Set<string>();
  collectRefs(parsed, refs);

  const documentsByRef: Record<string, unknown> = {};

  if (refs.size > 0 && isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');

    for (const ref of refs) {
      if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('#')) {
        continue;
      }

      const siblingPath = joinPath(path, ref);
      const siblingText = await invoke<string>('load_text_file', { path: siblingPath });
      documentsByRef[ref] = JSON.parse(siblingText);
    }
  } else if (refs.size > 0 && !isTauriRuntime()) {
    throw new Error(
      'This radio config references external JSON files. Open it in the Tauri desktop app so sibling $ref files can be loaded.',
    );
  }

  return hydrateRadioConfigFromDocuments(parsed as Record<string, unknown>, documentsByRef);
}

/**
 * Prompt for a radio configuration JSON file and hydrate it.
 */
export async function pickAndLoadRadioConfig(): Promise<{ radio: RegistryRadio; path: string } | undefined> {
  if (!isTauriRuntime()) {
    const picked = await pickRadioConfigInBrowser();

    if (!picked) {
      return undefined;
    }

    const radio = await loadRadioConfigFromFile(picked.path, picked.text);
    return { radio, path: picked.path };
  }

  const { open } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await open({
    title: 'Add Radio Configuration',
    multiple: false,
    directory: false,
    filters: [{ name: 'Radio Configuration', extensions: ['json'] }],
  });

  if (typeof path !== 'string') {
    return undefined;
  }

  const text = await invoke<string>('load_text_file', { path });
  const radio = await loadRadioConfigFromFile(path, text);
  return { radio, path };
}

async function pickRadioConfigInBrowser(): Promise<{ text: string; path: string } | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      document.body.removeChild(input);

      if (!file) {
        resolve(undefined);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          text: String(reader.result ?? ''),
          path: file.name,
        });
      };
      reader.onerror = () => resolve(undefined);
      reader.readAsText(file);
    });

    input.click();
  });
}
