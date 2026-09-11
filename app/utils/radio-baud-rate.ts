export const PROGRAMMING_BAUD_RATES_STORAGE_KEY = 'ham-radio-programming-baud-rates';

const BAUD_RATE_MINIMUM = 1200;
const BAUD_RATE_MAXIMUM = 115200;

/**
 * Serial settings that may include a driver-provided baud rate list.
 *
 * `baudRates` is optional on published RadioSerialConfig until ham-radio-api
 * is released with that field; installed radio JSON already carries it.
 */
export interface ProgrammingSerialConfig {
  baudRate: number;
  baudRates?: unknown;
}

export interface RememberedBaudRates {
  [modelId: string]: number;
}

export interface BaudRateSelectItem {
  label: string;
  value: number;
}

function isProgrammingBaudRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= BAUD_RATE_MINIMUM && value <= BAUD_RATE_MAXIMUM;
}

/**
 * Baud rates the programming port may be opened at.
 *
 * Uses the driver `baudRates` list when present; otherwise the single default.
 */
export function listedProgrammingBaudRates(config: ProgrammingSerialConfig): number[] {
  const listed: number[] = [];
  const seen = new Set<number>();

  if (Array.isArray(config.baudRates)) {
    for (const entry of config.baudRates) {
      if (!isProgrammingBaudRate(entry) || seen.has(entry)) {
        continue;
      }

      seen.add(entry);
      listed.push(entry);
    }
  }

  if (listed.length > 0) {
    return listed;
  }

  return isProgrammingBaudRate(config.baudRate) ? [config.baudRate] : [];
}

/**
 * True when the import/write dialog should show a baud selector.
 */
export function shouldSelectProgrammingBaudRate(config: ProgrammingSerialConfig): boolean {
  return listedProgrammingBaudRates(config).length > 1;
}

/**
 * Driver default, or the first listed rate if the default is not in the list.
 */
export function defaultProgrammingBaudRate(config: ProgrammingSerialConfig): number {
  const listed = listedProgrammingBaudRates(config);

  if (listed.includes(config.baudRate)) {
    return config.baudRate;
  }

  return listed[0] ?? config.baudRate;
}

/**
 * Remembered rate for this radio when it is still valid; otherwise the default.
 */
export function resolveProgrammingBaudRate(config: ProgrammingSerialConfig, remembered: number | undefined): number {
  const listed = listedProgrammingBaudRates(config);

  if (remembered !== undefined && listed.includes(remembered)) {
    return remembered;
  }

  return defaultProgrammingBaudRate(config);
}

export function programmingBaudRateSelectItems(config: ProgrammingSerialConfig): BaudRateSelectItem[] {
  return listedProgrammingBaudRates(config).map((rate) => ({
    label: String(rate),
    value: rate,
  }));
}

export function parseRememberedBaudRates(raw: string | null): RememberedBaudRates {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const remembered: RememberedBaudRates = {};

    for (const [modelId, baudRate] of Object.entries(parsed as Record<string, unknown>)) {
      if (modelId.length === 0 || !isProgrammingBaudRate(baudRate)) {
        continue;
      }

      remembered[modelId] = baudRate;
    }

    return remembered;
  } catch {
    return {};
  }
}

export function serializeRememberedBaudRates(rates: RememberedBaudRates): string {
  return JSON.stringify(parseRememberedBaudRates(JSON.stringify(rates)));
}

export function readRememberedBaudRates(): RememberedBaudRates {
  if (!import.meta.client) {
    return {};
  }

  try {
    return parseRememberedBaudRates(localStorage.getItem(PROGRAMMING_BAUD_RATES_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function readRememberedBaudRate(modelId: string): number | undefined {
  return readRememberedBaudRates()[modelId];
}

/**
 * Persist the last programming baud the user chose for this radio model.
 */
export function writeRememberedBaudRate(modelId: string, baudRate: number): void {
  if (!import.meta.client || modelId.length === 0 || !isProgrammingBaudRate(baudRate)) {
    return;
  }

  const next = {
    ...readRememberedBaudRates(),
    [modelId]: baudRate,
  };

  localStorage.setItem(PROGRAMMING_BAUD_RATES_STORAGE_KEY, serializeRememberedBaudRates(next));
}
