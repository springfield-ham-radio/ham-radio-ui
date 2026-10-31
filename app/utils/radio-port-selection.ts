import { serialPortOption, type SerialPortAlias, type SerialPortOption } from '~/utils/serial-port-list';

export interface RadioPortChoice extends SerialPortOption {
  disabled?: boolean;
}

/**
 * Ports for Read, Write, and CAT connect.
 *
 * A saved path that is plugged in is labeled "(saved)" and stays selected. A saved path that is not in
 * the live list is shown disabled and is not selected, so the dialog cannot
 * open a cable that is not connected. Another plugged-in port is not chosen
 * in its place: more than one cable may be attached.
 *
 * A plugged-in port that CAT already holds is still replaced by the first free
 * port, matching the previous Read / Write fallback.
 */
export function resolveRadioPortChoices(input: {
  livePorts: readonly SerialPortOption[];
  savedPort?: string;
  /** Selection to keep when it is still plugged in, such as after Refresh. */
  currentPort?: string;
  unavailablePorts?: readonly string[];
  aliases?: readonly SerialPortAlias[];
}): { ports: RadioPortChoice[]; selectedPort: string | undefined } {
  const unavailable = new Set(input.unavailablePorts ?? []);
  const aliases = input.aliases ?? [];
  const saved = input.savedPort?.trim() || undefined;
  const current = input.currentPort?.trim() || undefined;
  const ports: RadioPortChoice[] = input.livePorts.map((port) => ({ ...port }));
  const liveValues = new Set(ports.map((port) => port.value));

  if (saved && liveValues.has(saved)) {
    const index = ports.findIndex((port) => port.value === saved);
    const current = ports[index];

    if (current && !current.label.endsWith(' (saved)')) {
      ports[index] = { ...current, label: `${current.label} (saved)` };
    }
  }

  if (saved && !liveValues.has(saved)) {
    const option = serialPortOption(saved, aliases, { suffix: ' (saved)' });
    const disconnected = 'Not connected';

    ports.unshift({
      ...option,
      description: option.description ? `${option.description} · ${disconnected}` : disconnected,
      disabled: true,
    });
  }

  const preferred = [current, saved].find((path) => path !== undefined && liveValues.has(path));

  if (preferred && !unavailable.has(preferred)) {
    return { ports, selectedPort: preferred };
  }

  if (preferred && unavailable.has(preferred)) {
    return {
      ports,
      selectedPort: ports.find((port) => liveValues.has(port.value) && !unavailable.has(port.value))?.value,
    };
  }

  return { ports, selectedPort: undefined };
}
