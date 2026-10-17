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

/** Manufacturer and model line without repeating the manufacturer when the catalog label already includes it. */
export function radioTransferManufacturerModelLine(
  display: Pick<RadioTransferTargetDisplay, 'manufacturer' | 'modelLabel'>,
): string {
  const manufacturer = display.manufacturer;
  const modelLabel = display.modelLabel;

  if (modelLabel.length === 0) {
    return manufacturer;
  }

  if (modelLabel.toLowerCase().startsWith(manufacturer.toLowerCase())) {
    return modelLabel;
  }

  return `${manufacturer} · ${modelLabel}`;
}

export function radioTransferDialogTitle(action: 'read' | 'write', cardName?: string | null): string {
  const trimmed = cardName?.trim();

  if (!trimmed) {
    return action === 'read' ? 'Read from Radio' : 'Write to Radio';
  }

  return action === 'read' ? `Read from ${trimmed}` : `Write to ${trimmed}`;
}

export function radioTransferDialogDescription(action: 'read' | 'write', cardName?: string | null): string {
  const trimmed = cardName?.trim();

  if (!trimmed) {
    return 'Choose the serial port for this radio.';
  }

  if (action === 'read') {
    return `Read memory from ${trimmed}. Pick the serial port on the cable connected to this radio.`;
  }

  return `Write the loaded memory to ${trimmed}. Pick the serial port on the cable connected to this radio.`;
}

/**
 * Target radio for a transfer dialog. Uses the pinned transfer card id, not the focused card.
 */
export function resolveRadioTransferTarget(
  transferCardId: string | undefined,
  radioById: (id: string) => RadioTransferTarget | undefined,
  cardById: (id: string) => { guest?: GuestRadio } | undefined,
): RadioTransferTarget | undefined {
  if (!transferCardId) {
    return undefined;
  }

  return radioById(transferCardId) ?? cardById(transferCardId)?.guest;
}
