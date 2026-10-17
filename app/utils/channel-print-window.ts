import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import type { ChannelPrintDocument } from '~/utils/channel-print';

export const CHANNEL_PRINT_STORAGE_PREFIX = 'ham-radio-channel-print:';

export function channelPrintStorageKey(id: string): string {
  return `${CHANNEL_PRINT_STORAGE_PREFIX}${id}`;
}

export function storeChannelPrintDocument(id: string, document: ChannelPrintDocument): void {
  sessionStorage.setItem(channelPrintStorageKey(id), JSON.stringify(document));
}

export function readChannelPrintDocument(id: string): ChannelPrintDocument | undefined {
  const raw = sessionStorage.getItem(channelPrintStorageKey(id));

  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as ChannelPrintDocument;
  } catch {
    return undefined;
  }
}

export function clearChannelPrintDocument(id: string): void {
  sessionStorage.removeItem(channelPrintStorageKey(id));
}

function printRouteUrl(id: string): string {
  const path = `/print/channels?id=${encodeURIComponent(id)}`;
  return `${window.location.origin}${path}`;
}

export async function openChannelPrintWindow(document: ChannelPrintDocument): Promise<void> {
  const id = crypto.randomUUID();
  storeChannelPrintDocument(id, document);
  const url = printRouteUrl(id);

  if (isTauriRuntime()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = `channel-print-${id}`;

    const window = new WebviewWindow(label, {
      url,
      title: 'Print channels',
      width: 900,
      height: 700,
      center: true,
      resizable: true,
      decorations: true,
    });

    window.once('tauri://error', () => {
      clearChannelPrintDocument(id);
    });

    return;
  }

  const popup = window.open(url, '_blank', 'noopener,noreferrer,width=900,height=700');

  if (!popup) {
    clearChannelPrintDocument(id);
    throw new Error('Allow pop-ups to print channels in the browser.');
  }
}
