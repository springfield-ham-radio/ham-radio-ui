import { reportChannelPrintError } from '~/utils/channel-print-window';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

function printFailureMessage(reason: unknown): string | undefined {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string'
          ? reason.message
          : String(reason);

  if (!/print/i.test(message) && !/not allowed/i.test(message)) {
    return undefined;
  }

  return message;
}

function closePrintWindow(): void {
  if (isTauriRuntime()) {
    void import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      void WebviewWindow.getCurrent().close();
    });
    return;
  }

  window.close();
}

export default defineNuxtPlugin(() => {
  const route = useRoute();

  if (!route.path.startsWith('/print/')) {
    return;
  }

  window.addEventListener('unhandledrejection', (event) => {
    const message = printFailureMessage(event.reason);

    if (!message) {
      return;
    }

    event.preventDefault();
    void reportChannelPrintError(message).finally(() => {
      closePrintWindow();
    });
  });
});
