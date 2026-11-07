/**
 * TM-D710 family for setup copy.
 *
 * Port menus differ between the A/E/S generation and the G generation.
 * APRS menus 601 and 604 use the same numbers in both Kenwood instruction manuals.
 */
export type D710AprsFamily = 'a-e' | 'g' | 'unconfirmed';

export interface D710AprsMenus {
  family: D710AprsFamily;
  /** Control-head COM jack baud. Not the PC-port CAT baud. */
  comBaudMenu: string;
  /** TX/RX-unit PC jack baud. Programming and CAT. Not the TNC feed. */
  pcBaudMenu: string;
  /** Packet-mode internal TNC data band. */
  packetDataBandMenu: string;
  /** APRS-mode data band and RF packet speed. */
  aprsInternalTncMenu: string;
  /** Copies received APRS traffic to the COM jack. Default OFF. */
  comOutputMenu: string;
}

const A_E_MENUS: D710AprsMenus = {
  family: 'a-e',
  comBaudMenu: '528',
  pcBaudMenu: '519',
  packetDataBandMenu: '529',
  aprsInternalTncMenu: '601',
  comOutputMenu: '604',
};

const G_MENUS: D710AprsMenus = {
  family: 'g',
  comBaudMenu: '929',
  pcBaudMenu: '920',
  packetDataBandMenu: '930',
  aprsInternalTncMenu: '601',
  comOutputMenu: '604',
};

/**
 * Classify a catalog model id or display name.
 *
 * `kenwood-tm-d710g` / GA / GE / GS use the 9xx port menus.
 * A, E, and S use the 5xx port menus.
 * A bare TM-D710 name stays unconfirmed so both menu sets are shown.
 */
export function d710AprsFamily(model: string | undefined, name?: string): D710AprsFamily | undefined {
  const text = `${model ?? ''} ${name ?? ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');

  if (!text.includes('d710')) {
    return undefined;
  }

  if (text.includes('d710g')) {
    return 'g';
  }

  if (text.includes('d710a') || text.includes('d710e') || text.includes('d710s')) {
    return 'a-e';
  }

  return 'unconfirmed';
}

export function d710AprsMenus(family: D710AprsFamily): D710AprsMenus {
  if (family === 'g') {
    return G_MENUS;
  }

  if (family === 'a-e') {
    return A_E_MENUS;
  }

  return {
    family: 'unconfirmed',
    comBaudMenu: '528 (A/E/S) or 929 (G/GA/GE/GS)',
    pcBaudMenu: '519 (A/E/S) or 920 (G/GA/GE/GS)',
    packetDataBandMenu: '529 (A/E/S) or 930 (G/GA/GE/GS)',
    aprsInternalTncMenu: '601',
    comOutputMenu: '604',
  };
}

/** COM-port baud choices from the Kenwood menu. Default is 9600. */
export const APRS_COM_BAUD_RATES = [9600, 19200, 38400, 57600] as const;

export type AprsComBaudRate = (typeof APRS_COM_BAUD_RATES)[number];

export function isAprsComBaudRate(value: number): value is AprsComBaudRate {
  return (APRS_COM_BAUD_RATES as readonly number[]).includes(value);
}

/** One line for the radio preferences form. Full menu steps stay in docs/aprs.md. */
export function d710AprsPreferenceHelp(family: D710AprsFamily): string {
  const menus = d710AprsMenus(family);

  return `Control-head COM jack (PG-5G), not the memory or CAT port. Match COM baud menu ${menus.comBaudMenu}. Menu ${menus.comOutputMenu} OUTPUT must be ON on the radio. HamBench does not change it.`;
}

export function aprsPortMissingMessage(path: string): string {
  return `APRS port ${path} is not connected. Plug in that adapter or choose another port under Preferences → Radios. The memory port was left unchanged.`;
}

/**
 * First-tab storage, keyed by saved-radio id.
 * Folded into the saved radio once, then removed for ids that were claimed.
 */
export const LEGACY_APRS_BAUD_STORAGE_KEY = 'ham-radio-aprs-com-baud';
export const LEGACY_APRS_PORT_STORAGE_KEY = 'ham-radio-aprs-com-port';

export interface LegacyAprsRadio {
  id: string;
  serialPort: string;
  baudRate?: number;
  aprsSerialPort?: string;
  aprsBaudRate?: number;
}

/**
 * Copy a legacy COM port and baud onto the matching saved radio.
 *
 * Fills only missing APRS fields. Never writes `serialPort` or `baudRate`.
 * Legacy entries for radios already in the list are dropped so a later edit
 * cannot put them back onto the memory port.
 */
export function adoptLegacyAprsConnection<T extends LegacyAprsRadio>(
  radios: readonly T[],
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): { radios: T[]; changed: boolean } {
  const ports = readAprsStringMap(storage, LEGACY_APRS_PORT_STORAGE_KEY);
  const bauds = readAprsBaudMap(storage);
  const known = new Set(radios.map((radio) => radio.id));
  let changed = false;
  const next = radios.map((radio) => {
    const legacyPort = ports[radio.id];
    const legacyBaud = bauds[radio.id];
    let copy = radio;

    if (legacyPort && !radio.aprsSerialPort) {
      copy = { ...copy, aprsSerialPort: legacyPort };
      changed = true;
    }

    if (legacyBaud !== undefined && copy.aprsBaudRate === undefined) {
      copy = { ...copy, aprsBaudRate: legacyBaud };
      changed = true;
    }

    return copy;
  });

  for (const id of known) {
    delete ports[id];
    delete bauds[id];
  }

  writeAprsStringMap(storage, LEGACY_APRS_PORT_STORAGE_KEY, ports);
  writeAprsBaudMap(storage, bauds);

  return { radios: changed ? next : [...radios], changed };
}

function readAprsStringMap(storage: Pick<Storage, 'getItem'>, key: string): Record<string, string> {
  const raw = storage.getItem(key);

  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const entries: Record<string, string> = {};

    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        entries[id] = value.trim();
      }
    }

    return entries;
  } catch {
    return {};
  }
}

function readAprsBaudMap(storage: Pick<Storage, 'getItem'>): Record<string, AprsComBaudRate> {
  const raw = storage.getItem(LEGACY_APRS_BAUD_STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const entries: Record<string, AprsComBaudRate> = {};

    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && isAprsComBaudRate(value)) {
        entries[id] = value;
      }
    }

    return entries;
  } catch {
    return {};
  }
}

function writeAprsStringMap(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, entries: Record<string, string>): void {
  if (Object.keys(entries).length === 0) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, JSON.stringify(entries));
}

function writeAprsBaudMap(storage: Pick<Storage, 'setItem' | 'removeItem'>, entries: Record<string, number>): void {
  if (Object.keys(entries).length === 0) {
    storage.removeItem(LEGACY_APRS_BAUD_STORAGE_KEY);
    return;
  }

  storage.setItem(LEGACY_APRS_BAUD_STORAGE_KEY, JSON.stringify(entries));
}
