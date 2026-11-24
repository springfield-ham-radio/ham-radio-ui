import type { MenuCaptureSessionState } from '~/utils/menu-capture';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

async function invokeCapture<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Menu capture sessions are saved by the HamBench desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function loadMenuCaptureSession(savedRadioId: string): Promise<MenuCaptureSessionState | undefined> {
  const text = await invokeCapture<string | null>('menu_capture_load_session', { savedRadioId });

  if (!text) {
    return undefined;
  }

  return JSON.parse(text) as MenuCaptureSessionState;
}

export async function saveMenuCaptureSession(savedRadioId: string, session: MenuCaptureSessionState): Promise<void> {
  await invokeCapture('menu_capture_save_session', {
    savedRadioId,
    contents: `${JSON.stringify(session)}\n`,
  });
}

export async function saveMenuCaptureBaseline(savedRadioId: string, image: Uint8Array): Promise<void> {
  await invokeCapture('menu_capture_save_baseline', {
    savedRadioId,
    contents: Array.from(image),
  });
}

export async function loadMenuCaptureBaseline(savedRadioId: string): Promise<Uint8Array> {
  const bytes = await invokeCapture<number[]>('menu_capture_load_baseline', { savedRadioId });
  return new Uint8Array(bytes);
}

export async function saveMenuCaptureStepImage(savedRadioId: string, fileName: string, image: Uint8Array): Promise<void> {
  await invokeCapture('menu_capture_save_step_image', {
    savedRadioId,
    fileName,
    contents: Array.from(image),
  });
}

export async function loadMenuCaptureStepImage(savedRadioId: string, fileName: string): Promise<Uint8Array> {
  const bytes = await invokeCapture<number[]>('menu_capture_load_step_image', { savedRadioId, fileName });
  return new Uint8Array(bytes);
}

export async function deleteMenuCaptureImages(savedRadioId: string, fileNames: string[]): Promise<void> {
  if (fileNames.length === 0) {
    return;
  }

  await invokeCapture('menu_capture_delete_images', { savedRadioId, fileNames });
}

export async function discardMenuCaptureSession(savedRadioId: string): Promise<void> {
  await invokeCapture('menu_capture_discard_session', { savedRadioId });
}

export async function saveBinaryFileWithPicker(bytes: Uint8Array, defaultPath: string, title: string): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    throw new Error('Save the capture file from the HamBench desktop app.');
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { invoke } = await import('@tauri-apps/api/core');
  const path = await save({
    title,
    defaultPath,
    filters: [{ name: 'Menu capture', extensions: ['hmenucap'] }],
  });

  if (path == null) {
    return undefined;
  }

  await invoke('save_binary_file', { path, contents: Array.from(bytes) });
  return path;
}