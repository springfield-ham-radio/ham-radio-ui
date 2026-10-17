import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import type { GuestRadio } from '~/utils/radio-board';
import { savedRadioModelLabel, type SavedRadio } from '~/utils/saved-radios';

export type RadioTransferTarget = Pick<SavedRadio, 'name' | 'manufacturer' | 'model'> | GuestRadio;

export interface RadioTransferTargetDisplay {
  cardName: string;
  manufacturer: string;
  modelLabel: string;
}

/** Labels for the radio card targeted by Read from Radio or Write to Radio. */
export function radioTransferTargetDisplay(
  radio: RadioTransferTarget,
  configurations: readonly LoadedRadioConfig[],
): RadioTransferTargetDisplay {
  const normalized = {
    ...radio,
    name: radio.name.trim(),
    manufacturer: radio.manufacturer.trim(),
  };

  return {
    cardName: normalized.name,
    manufacturer: normalized.manufacturer,
    modelLabel: savedRadioModelLabel(normalized, configurations),
  };
}
