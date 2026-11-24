import type { MenuCaptureSessionState } from '~/utils/menu-capture';

/** File name of the radio image to use as the pre-restore prewrite backup, when any kept step exists. */
export function menuCapturePrewriteBackupStepImageFileName(
  steps: MenuCaptureSessionState['steps'] | undefined,
): string | undefined {
  const last = steps?.at(-1);

  if (!last?.imageFileName?.trim()) {
    return undefined;
  }

  return last.imageFileName;
}

/** When true, restore should copy the last kept step image into `backups/` instead of reading the radio. */
export function menuCaptureUseStepImageForPrewriteBackup(
  steps: MenuCaptureSessionState['steps'] | undefined,
  stepImage: Uint8Array | undefined,
): boolean {
  return Boolean(menuCapturePrewriteBackupStepImageFileName(steps) && stepImage && stepImage.length > 0);
}