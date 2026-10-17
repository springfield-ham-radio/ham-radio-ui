import type { ChannelPrintDocument } from '~/utils/channel-print';
import { openChannelPrintWindow } from '~/utils/channel-print-window';

export interface ChannelPrintDialogState {
  open: boolean;
  surface: 'radio' | 'library';
  title: string;
  subtitle: string;
  rowCount: number;
  hasFiltersActive: boolean;
  hasSelection: boolean;
  callSignOptions: Array<{ label: string; value: string }>;
  defaultCallSign?: string;
  buildDocument: (options: {
    layout: 'full' | 'wallet';
    matchVisibleColumns: boolean;
    callSign?: string;
    libraryScope: 'visible' | 'whole-tab';
    selectedOnly: boolean;
  }) => ChannelPrintDocument | undefined;
}

const closedDialog = (): ChannelPrintDialogState => ({
  open: false,
  surface: 'radio',
  title: 'Print channels',
  subtitle: '',
  rowCount: 0,
  hasFiltersActive: false,
  hasSelection: false,
  callSignOptions: [],
  buildDocument: () => undefined,
});

type RadioPrintProvider = () => Omit<ChannelPrintDialogState, 'open'> | null;
type LibraryPrintProvider = () => Omit<ChannelPrintDialogState, 'open'> | null;

export function useChannelPrint() {
  const toast = useToast();
  const dialog = useState<ChannelPrintDialogState>('channel-print-dialog', closedDialog);
  const radioProvider = useState<RadioPrintProvider | undefined>('channel-print-radio-provider', () => undefined);
  const libraryProvider = useState<LibraryPrintProvider | undefined>('channel-print-library-provider', () => undefined);

  function registerRadioProvider(provider: RadioPrintProvider): void {
    radioProvider.value = provider;
  }

  function unregisterRadioProvider(provider: RadioPrintProvider): void {
    if (radioProvider.value === provider) {
      radioProvider.value = undefined;
    }
  }

  function registerLibraryProvider(provider: LibraryPrintProvider): void {
    libraryProvider.value = provider;
  }

  function unregisterLibraryProvider(provider: LibraryPrintProvider): void {
    if (libraryProvider.value === provider) {
      libraryProvider.value = undefined;
    }
  }

  function openPrintDialog(context: Omit<ChannelPrintDialogState, 'open'>): void {
    dialog.value = {
      ...context,
      open: true,
    };
  }

  function closePrintDialog(): void {
    dialog.value = {
      ...dialog.value,
      open: false,
    };
  }

  async function confirmPrint(options: {
    layout: 'full' | 'wallet';
    matchVisibleColumns: boolean;
    callSign?: string;
    libraryScope: 'visible' | 'whole-tab';
    selectedOnly: boolean;
  }): Promise<void> {
    const document = dialog.value.buildDocument(options);

    if (!document) {
      toast.add({
        title: 'Nothing to print',
        description: 'There are no channels to print.',
        color: 'warning',
        icon: 'i-lucide-printer',
      });
      return;
    }

    closePrintDialog();

    try {
      await openChannelPrintWindow(document);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not open the print window';
      toast.add({
        title: 'Print failed',
        description: message,
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    }
  }

  function requestPrintFromMenu(routePath: string): void {
    if (dialog.value.open) {
      return;
    }

    if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      return;
    }

    if (routePath === '/channels') {
      const context = libraryProvider.value?.();

      if (context && context.rowCount > 0) {
        openPrintDialog(context);
        return;
      }

      toast.add({
        title: 'Nothing to print',
        description: context?.rowCount === 0 ? 'There are no channels in this library view.' : 'Open the channel library to print.',
        color: 'warning',
        icon: 'i-lucide-printer',
      });
      return;
    }

    if (routePath === '/') {
      const context = radioProvider.value?.();

      if (context && context.rowCount > 0) {
        openPrintDialog(context);
        return;
      }

      toast.add({
        title: 'Nothing to print',
        description: 'Open a radio with programmed memory channels first.',
        color: 'warning',
        icon: 'i-lucide-printer',
      });
      return;
    }

    toast.add({
      title: 'Print channels',
      description: 'Open a radio card or the Channels page to print a channel list.',
      color: 'neutral',
      icon: 'i-lucide-printer',
    });
  }

  return {
    dialog,
    openPrintDialog,
    closePrintDialog,
    confirmPrint,
    requestPrintFromMenu,
    registerRadioProvider,
    unregisterRadioProvider,
    registerLibraryProvider,
    unregisterLibraryProvider,
  };
}
