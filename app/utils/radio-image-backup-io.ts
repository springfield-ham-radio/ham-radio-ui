/**
 * Read and write radio image backups in the Tauri app data directory.
 */

import {
  type RadioImageBackupListing,
  type RadioImageBackupStore,
} from '~/utils/radio-image-backup';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

interface RadioImageBackupEntry {
  fileName: string;
  modifiedAtMs: number;
}

export function createTauriRadioImageBackupStore(): RadioImageBackupStore {
  return {
    list: listRadioImageBackups,
    save: saveRadioImageBackup,
    remove: deleteRadioImageBackups,
  };
}

export async function listRadioImageBackups(): Promise<RadioImageBackupListing[]> {
  const entries = await invokeBackupCommand<RadioImageBackupEntry[]>('list_radio_image_backups');
  return entries.map((entry) => ({
    fileName: entry.fileName,
    modifiedAtMs: entry.modifiedAtMs,
  }));
}

export async function saveRadioImageBackup(fileName: string, image: Uint8Array): Promise<void> {
  await invokeBackupCommand('save_radio_image_backup', {
    fileName,
    contents: Array.from(image),
  });
}

export async function loadRadioImageBackup(fileName: string): Promise<Uint8Array> {
  const contents = await invokeBackupCommand<number[]>('load_radio_image_backup', { fileName });
  return new Uint8Array(contents);
}

export async function deleteRadioImageBackups(fileNames: string[]): Promise<void> {
  if (fileNames.length === 0) {
    return;
  }

  await invokeBackupCommand('delete_radio_image_backups', { fileNames });
}

/**
 * Open the backup folder in the system file manager.
 * Creates the folder when it does not exist yet.
 */
export async function showRadioImageBackups(): Promise<void> {
  await invokeBackupCommand('open_radio_image_backups_directory');
}

async function invokeBackupCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Radio image backups are saved by the HamBench desktop app.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}
