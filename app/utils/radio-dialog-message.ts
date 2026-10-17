import type { Radio } from '@springfield/ham-radio-api';

export type RadioDialogMessageKind = 'read' | 'write';

export interface RadioDialogMessageAlert {
  title: string;
  body: string;
  color: 'info' | 'warning';
  icon: string;
}

/** Map optional config read/write setup text to Nuxt UI UAlert props. */
export function radioDialogMessage(
  config: Pick<Radio, 'readMessage' | 'writeMessage'> | undefined | null,
  kind: RadioDialogMessageKind,
): RadioDialogMessageAlert | undefined {
  const message = kind === 'read' ? config?.readMessage : config?.writeMessage;

  if (!message) {
    return undefined;
  }

  const severity = message.severity ?? 'info';

  return {
    title: message.title,
    body: message.body,
    color: severity === 'warning' ? 'warning' : 'info',
    icon: severity === 'warning' ? 'i-lucide-triangle-alert' : 'i-lucide-info',
  };
}
