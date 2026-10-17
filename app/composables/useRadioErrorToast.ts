import { ConsoleTransport, LogLayer } from 'loglayer';
import type { RadioErrorReport } from '~/utils/radio-error-report';
import { logRadioErrorReport, radioErrorToastActions } from '~/utils/radio-error-report';
import type { LogLayer as LogLayerType } from 'loglayer';

export const radioErrorLogger = new LogLayer({
  transport: [
    new ConsoleTransport({
      logger: console,
      level: 'debug',
    }),
  ],
});

export function showRadioErrorToast(
  toast: ReturnType<typeof useToast>,
  log: LogLayerType,
  input: {
    title: string;
    report: RadioErrorReport;
    color?: 'error' | 'warning';
    icon?: string;
    logMessage?: string;
  },
): void {
  logRadioErrorReport(log, input.report, input.logMessage);

  toast.add({
    title: input.title,
    description: input.report.summary,
    color: input.color ?? 'error',
    icon: input.icon ?? 'i-lucide-circle-alert',
    actions: radioErrorToastActions(input.report),
  });
}
