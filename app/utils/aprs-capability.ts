import {
  APRS_COM_BAUD_RATES,
  d710AprsFamily,
  d710AprsPreferenceHelp,
  isAprsComBaudRate,
  type AprsComBaudRate,
} from '~/utils/aprs-d710';
import { d710AprsHostProfile } from '~/utils/aprs-d710-host';
import { parseAprsHostProfile, type AprsHostProfile } from '~/utils/aprs-host-profile';

/**
 * Receive-only TNC feed declared by a radio module.
 *
 * User port and baud are not part of this block. Those stay on the saved radio.
 * HamBench opens 8N1 with RTS and DTR deasserted even if a module says otherwise.
 */
export interface RadioAprsReceiveConfig {
  mode?: unknown;
  baudRate?: unknown;
  baudRates?: unknown;
  help?: unknown;
  rts?: unknown;
  dtr?: unknown;
  rtscts?: unknown;
}

export interface AprsReceiveProfile {
  /** `driver` when the module set `capabilities.aprsReceive`. Otherwise the TM-D710 name fallback. */
  source: 'driver' | 'fallback';
  baudRate: AprsComBaudRate;
  baudRates: AprsComBaudRate[];
  /** One line under the preferences fields. */
  help: string;
  /** Shown with the passive monitor. Not a command. */
  monitorNote: string;
  /** Present only when this radio's module, or the D710 compatibility fallback, supplies one. */
  host?: AprsHostProfile;
}

const DRIVER_HELP = 'Receive-only TNC port from this radio\'s driver. It is not the memory or CAT port. HamBench does not change radio menus.';
const DRIVER_MONITOR = 'Passive monitor text from this radio\'s driver. HamBench does not change radio menus.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listedBauds(value: unknown): AprsComBaudRate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const listed: AprsComBaudRate[] = [];

  for (const entry of value) {
    if (typeof entry === 'number' && isAprsComBaudRate(entry) && !listed.includes(entry)) {
      listed.push(entry);
    }
  }

  return listed;
}

/**
 * Whether this radio gets an APRS tab and which COM baud choices to offer.
 *
 * An explicit `capabilities.aprsReceive: false` hides the tab. `true` uses the
 * module `aprs` block when its baud list is usable. A missing flag still matches
 * a TM-D710 model id until that module publishes the capability.
 */
export function aprsReceiveProfile(input: { config?: unknown; model?: string; name?: string }): AprsReceiveProfile | undefined {
  const config = isRecord(input.config) ? input.config : undefined;
  const capabilities = config && isRecord(config.capabilities) ? config.capabilities : undefined;
  const declared = capabilities?.aprsReceive;
  const model = input.model ?? (config && isRecord(config.id) && typeof config.id.model === 'string' ? config.id.model : undefined);
  const name = input.name ?? (config && isRecord(config.id) && typeof config.id.name === 'string' ? config.id.name : undefined);

  if (declared === false) {
    return undefined;
  }

  if (declared === true) {
    const block = config?.aprs;

    if (isRecord(block) && block.mode !== undefined && block.mode !== 'monitor') {
      return undefined;
    }

    return profileFromDriver(block) ?? {
      source: 'driver',
      baudRate: 9600,
      baudRates: [...APRS_COM_BAUD_RATES],
      help: DRIVER_HELP,
      monitorNote: DRIVER_MONITOR,
    };
  }

  const family = d710AprsFamily(model, name);

  if (!family) {
    return undefined;
  }

  const menus = family === 'g' ? '929' : family === 'a-e' ? '528' : '528 or 929';

  return {
    source: 'fallback',
    baudRate: 9600,
    baudRates: [...APRS_COM_BAUD_RATES],
    help: d710AprsPreferenceHelp(family),
    monitorNote: `Menu 604 OUTPUT must be ON before this port copies heard packets. COM baud is menu ${menus}. HamBench does not change those menus.`,
    host: d710AprsHostProfile(),
  };
}

function profileFromDriver(value: unknown): AprsReceiveProfile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value.mode !== undefined && value.mode !== 'monitor') {
    return undefined;
  }

  const baudRates = listedBauds(value.baudRates);
  const baudRate = typeof value.baudRate === 'number' && isAprsComBaudRate(value.baudRate) ? value.baudRate : undefined;
  const rates = baudRates.length > 0 ? baudRates : baudRate ? [baudRate] : [];

  if (rates.length === 0 || (baudRate !== undefined && !rates.includes(baudRate))) {
    return undefined;
  }

  const help = typeof value.help === 'string' && value.help.trim().length > 0 ? value.help.trim() : DRIVER_HELP;

  return {
    source: 'driver',
    baudRate: baudRate ?? rates[0]!,
    baudRates: rates,
    help,
    monitorNote: typeof value.monitorNote === 'string' && value.monitorNote.trim().length > 0 ? value.monitorNote.trim() : DRIVER_MONITOR,
    host: parseAprsHostProfile(value.host),
  };
}
