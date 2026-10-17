import type { RadioId } from '@springfield/ham-radio-api';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import type { RadioErrorContext } from '~/utils/radio-error-report';
import { serialPortDeviceName } from '~/utils/radio-error-report';

export function radioErrorContextFromRadio(
  operation: string,
  step: string,
  input: {
    radioId?: RadioId;
    cardName?: string;
    config?: LoadedRadioConfig;
    port?: string;
  },
): RadioErrorContext {
  const model = input.radioId ? String(input.radioId.model) : undefined;

  return {
    operation,
    step,
    cardName: input.cardName ?? input.radioId?.name,
    manufacturer: input.radioId?.manufacturer ?? input.config?.id.manufacturer,
    model,
    moduleId: input.config?.metadata?.moduleId ?? model,
    moduleVersion: input.config?.metadata?.moduleVersion,
    port: serialPortDeviceName(input.port),
  };
}
