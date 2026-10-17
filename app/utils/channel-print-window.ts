import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import type { ChannelPrintDocument } from '~/utils/channel-print';

/** One payload. A new print replaces it, and the print window deletes it when done. */
export const CHANNEL_PRINT_STORAGE_KEY = 'ham-radio-channel-print';

/** Stable label so a second print focuses this window instead of opening another. */
export const CHANNEL_PRINT_WINDOW_LABEL = 'channel-print';

export function storeChannelPrintDocument(document: ChannelPrintDocument): void {
  const json = JSON.stringify(document);

  try {
    localStorage.setItem(CHANNEL_PRINT_STORAGE_KEY, json);
  } catch (cause) {
    const quota =
      cause instanceof DOMException && (cause.name === 'QuotaExceededError' || cause.code === 22);

    if (quota) {
      throw new Error('This channel list is too large to print in one pass.');
    }

    throw cause;
  }
}

export function readChannelPrintDocument(): ChannelPrintDocument | undefined {
  const raw = localStorage.getItem(CHANNEL_PRINT_STORAGE_KEY);

  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as ChannelPrintDocument;
  } catch {
    return undefined;
  }
}

export function clearChannelPrintDocument(): void {
  localStorage.removeItem(CHANNEL_PRINT_STORAGE_KEY);
}

function printRouteUrl(): string {
  return `${window.location.origin}/print/channels`;
}

let opening = false;

export async function openChannelPrintWindow(document: ChannelPrintDocument): Promise<void> {
  if (opening) {
    return;
  }

  opening = true;

  try {
    const url = printRouteUrl();

    if (isTauriRuntime()) {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel(CHANNEL_PRINT_WINDOW_LABEL);

      if (existing) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 1000);
          void existing.once('tauri://destroyed', () => {
            clearTimeout(timeout);
            resolve();
          });
          void existing.close();
        });
      }

      storeChannelPrintDocument(document);

      const printWindow = new WebviewWindow(CHANNEL_PRINT_WINDOW_LABEL, {
        url,
        title: 'Print channels',
        width: 900,
        height: 700,
        center: true,
        resizable: true,
        decorations: true,
      });

      printWindow.once('tauri://error', () => {
        clearChannelPrintDocument();
      });

      return;
    }

    storeChannelPrintDocument(document);
    const popup = window.open(url, CHANNEL_PRINT_WINDOW_LABEL, 'width=900,height=700');

    if (!popup) {
      clearChannelPrintDocument();
      throw new Error('Allow pop-ups to print channels in the browser.');
    }
  } finally {
    opening = false;
  }
}
