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

const BAUD_STORAGE_KEY = 'ham-radio-aprs-com-baud';

export function readAprsComBaud(storage: Pick<Storage, 'getItem'>, radioId: string): AprsComBaudRate {
  const raw = storage.getItem(BAUD_STORAGE_KEY);

  if (!raw) {
    return 9600;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[radioId] : undefined;
    return typeof value === 'number' && isAprsComBaudRate(value) ? value : 9600;
  } catch {
    return 9600;
  }
}

const PORT_STORAGE_KEY = 'ham-radio-aprs-com-port';

/** Remember the COM-port adapter separately from the radio's PC-port programming cable. */
export function readAprsComPort(storage: Pick<Storage, 'getItem'>, radioId: string): string | undefined {
  return readAprsStringMap(storage, PORT_STORAGE_KEY)[radioId];
}

export function writeAprsComPort(storage: Pick<Storage, 'getItem' | 'setItem'>, radioId: string, path: string): void {
  const current = readAprsStringMap(storage, PORT_STORAGE_KEY);
  current[radioId] = path;
  storage.setItem(PORT_STORAGE_KEY, JSON.stringify(current));
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
        entries[id] = value;
      }
    }

    return entries;
  } catch {
    return {};
  }
}

export function writeAprsComBaud(storage: Pick<Storage, 'getItem' | 'setItem'>, radioId: string, baud: AprsComBaudRate): void {
  let current: Record<string, number> = {};
  const raw = storage.getItem(BAUD_STORAGE_KEY);

  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);

      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'number' && isAprsComBaudRate(value)) {
            current[key] = value;
          }
        }
      }
    } catch {
      current = {};
    }
  }

  current[radioId] = baud;
  storage.setItem(BAUD_STORAGE_KEY, JSON.stringify(current));
}
