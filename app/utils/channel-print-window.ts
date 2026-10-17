import { emit } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import type { ChannelPrintDocument } from '~/utils/channel-print';

/** One payload. A new print replaces it, and the print window deletes it when done. */
export const CHANNEL_PRINT_STORAGE_KEY = 'ham-radio-channel-print';

/** Stable label so a second print focuses this window instead of opening another. */
export const CHANNEL_PRINT_WINDOW_LABEL = 'channel-print';

/** Site-root document. It is not a Nuxt route, so it loads no module scripts. */
export const CHANNEL_PRINT_PAGE = '/channel-print.html';

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

export const CHANNEL_PRINT_ERROR_EVENT = 'channel-print-error';

/** Tells an already-open print window to show the payload just stored. */
export const CHANNEL_PRINT_SHOW_EVENT = 'channel-print-show';

/**
 * A new card never closes the print window. Closing it while the macOS print
 * panel is attached dismisses the panel.
 */
export function printWindowAction(hasOpenWindow: boolean): 'focus' | 'create' {
  return hasOpenWindow ? 'focus' : 'create';
}

let browserPrintWindow: Window | null = null;

function printPageUrl(): string {
  return `${window.location.origin}${CHANNEL_PRINT_PAGE}`;
}

let opening = false;

export async function openChannelPrintWindow(document: ChannelPrintDocument): Promise<void> {
  if (opening) {
    return;
  }

  opening = true;

  try {
    const url = printPageUrl();
    storeChannelPrintDocument(document);

    if (isTauriRuntime()) {
      const existing = await WebviewWindow.getByLabel(CHANNEL_PRINT_WINDOW_LABEL);

      if (printWindowAction(Boolean(existing)) === 'focus' && existing) {
        await existing.setFocus().catch(() => undefined);
        await emit(CHANNEL_PRINT_SHOW_EVENT);
        return;
      }

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

    if (printWindowAction(Boolean(browserPrintWindow && !browserPrintWindow.closed)) === 'focus' && browserPrintWindow) {
      browserPrintWindow.focus();
      return;
    }

    const popup = window.open(url, CHANNEL_PRINT_WINDOW_LABEL, 'width=900,height=700');

    if (!popup) {
      clearChannelPrintDocument();
      throw new Error('Allow pop-ups to print channels in the browser.');
    }

    browserPrintWindow = popup;
  } finally {
    opening = false;
  }
}
