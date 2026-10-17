import { closeChannelPrintWindow, reportChannelPrintError } from '~/utils/channel-print-window';

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
      closeChannelPrintWindow();
    });
  });
});
