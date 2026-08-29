import Database from '@tauri-apps/plugin-sql';
import { findBandByFrequency, displayBandName } from '~/utils/transmit-privileges';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export const STATION_LOG_DATABASE = 'sqlite:ham-radio.db';

export interface StationLogQsoRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  their_callsign: string;
  frequency_hz: number | null;
  band: string | null;
  mode: string;
  submode: string | null;
  rst_sent: string | null;
  rst_received: string | null;
  their_name: string | null;
  their_qth: string | null;
  their_gridsquare: string | null;
  tx_power_watts: number | null;
  comment: string | null;
  operator_callsign: string | null;
  station_callsign: string | null;
  my_gridsquare: string | null;
  adif_extra: string | null;
  created_at: number;
  updated_at: number;
}

export interface StationLogQso {
  id: string;
  startedAt: number;
  endedAt?: number;
  theirCallsign: string;
  frequencyHz?: number;
  band?: string;
  mode: string;
  submode?: string;
  rstSent?: string;
  rstReceived?: string;
  theirName?: string;
  theirQth?: string;
  theirGridsquare?: string;
  txPowerWatts?: number;
  comment?: string;
  operatorCallsign?: string;
  stationCallsign?: string;
  myGridsquare?: string;
  adifExtra?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export type StationLogQsoInput = Omit<StationLogQso, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};

/**
 * Maps FCC-style band names (e.g. "2 Meter", "70 Centimeter") to ADIF band tokens (e.g. "2m", "70cm").
 */
export function adifBandFromFrequencyHz(frequencyHz: number | undefined): string | undefined {
  if (frequencyHz === undefined) {
    return undefined;
  }

  const band = findBandByFrequency(frequencyHz);

  if (!band) {
    return undefined;
  }

  const name = displayBandName(band.name).toLowerCase();

  if (name.includes('gmrs') || name.includes('frs')) {
    return '70cm';
  }

  const centimeterMatch = /^(\d+(?:\.\d+)?)\s*centimeter/.exec(name);

  if (centimeterMatch) {
    const centimeters = Number(centimeterMatch[1]);

    if (centimeters === 1.25) {
      return '1.25cm';
    }

    return `${centimeters}cm`;
  }

  const meterMatch = /^(\d+(?:\.\d+)?)\s*meter/.exec(name);

  if (meterMatch) {
    return `${meterMatch[1]}m`;
  }

  return undefined;
}

let databasePromise: Promise<Database> | undefined;

export function assertStationLogDatabaseAvailable(): void {
  if (!isTauriRuntime()) {
    throw new Error('The station log requires the Tauri desktop app. Run yarn tauri:dev.');
  }
}

export async function getStationLogDatabase(): Promise<Database> {
  assertStationLogDatabaseAvailable();

  if (!databasePromise) {
    databasePromise = Database.load(STATION_LOG_DATABASE);
  }

  return databasePromise;
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

function parseAdifExtra(raw: string | null): Record<string, string> | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

export function stationLogQsoRowToModel(row: StationLogQsoRow): StationLogQso {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    theirCallsign: row.their_callsign,
    frequencyHz: row.frequency_hz ?? undefined,
    band: optionalText(row.band),
    mode: row.mode,
    submode: optionalText(row.submode),
    rstSent: optionalText(row.rst_sent),
    rstReceived: optionalText(row.rst_received),
    theirName: optionalText(row.their_name),
    theirQth: optionalText(row.their_qth),
    theirGridsquare: optionalText(row.their_gridsquare),
    txPowerWatts: row.tx_power_watts ?? undefined,
    comment: optionalText(row.comment),
    operatorCallsign: optionalText(row.operator_callsign),
    stationCallsign: optionalText(row.station_callsign),
    myGridsquare: optionalText(row.my_gridsquare),
    adifExtra: parseAdifExtra(row.adif_extra),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Build a StationLogQso model, filling defaults for id and timestamps.
 */
export function createStationLogQso(input: StationLogQsoInput): StationLogQso {
  const now = Date.now();
  const frequencyHz = input.frequencyHz;
  const band = optionalText(input.band) ?? adifBandFromFrequencyHz(frequencyHz);

  return {
    id: input.id ?? crypto.randomUUID(),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    theirCallsign: input.theirCallsign.trim().toUpperCase(),
    frequencyHz,
    band,
    mode: input.mode.trim().toUpperCase(),
    submode: optionalText(input.submode)?.toUpperCase(),
    rstSent: optionalText(input.rstSent),
    rstReceived: optionalText(input.rstReceived),
    theirName: optionalText(input.theirName),
    theirQth: optionalText(input.theirQth),
    theirGridsquare: optionalText(input.theirGridsquare)?.toUpperCase(),
    txPowerWatts: input.txPowerWatts,
    comment: optionalText(input.comment),
    operatorCallsign: optionalText(input.operatorCallsign)?.toUpperCase(),
    stationCallsign: optionalText(input.stationCallsign)?.toUpperCase(),
    myGridsquare: optionalText(input.myGridsquare)?.toUpperCase(),
    adifExtra: input.adifExtra,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function createBlankStationLogQso(options: {
  operatorCallsign?: string;
  stationCallsign?: string;
  myGridsquare?: string;
} = {}): StationLogQsoInput {
  return {
    startedAt: Date.now(),
    theirCallsign: '',
    mode: 'FM',
    operatorCallsign: options.operatorCallsign,
    stationCallsign: options.stationCallsign ?? options.operatorCallsign,
    myGridsquare: options.myGridsquare,
  };
}

export async function listStationLogQsos(): Promise<StationLogQso[]> {
  const database = await getStationLogDatabase();
  const rows = await database.select<StationLogQsoRow[]>(
    `SELECT id, started_at, ended_at, their_callsign, frequency_hz, band, mode, submode,
            rst_sent, rst_received, their_name, their_qth, their_gridsquare,
            tx_power_watts, comment, operator_callsign, station_callsign, my_gridsquare,
            adif_extra, created_at, updated_at
     FROM station_log_qsos
     ORDER BY started_at DESC`,
  );

  return rows.map(stationLogQsoRowToModel);
}

export async function insertStationLogQsos(qsos: StationLogQso[]): Promise<StationLogQso[]> {
  if (qsos.length === 0) {
    return [];
  }

  const database = await getStationLogDatabase();

  for (const qso of qsos) {
    await database.execute(
      `INSERT INTO station_log_qsos (
         id, started_at, ended_at, their_callsign, frequency_hz, band, mode, submode,
         rst_sent, rst_received, their_name, their_qth, their_gridsquare,
         tx_power_watts, comment, operator_callsign, station_callsign, my_gridsquare,
         adif_extra, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        qso.id,
        qso.startedAt,
        qso.endedAt ?? null,
        qso.theirCallsign,
        qso.frequencyHz ?? null,
        qso.band ?? null,
        qso.mode,
        qso.submode ?? null,
        qso.rstSent ?? null,
        qso.rstReceived ?? null,
        qso.theirName ?? null,
        qso.theirQth ?? null,
        qso.theirGridsquare ?? null,
        qso.txPowerWatts ?? null,
        qso.comment ?? null,
        qso.operatorCallsign ?? null,
        qso.stationCallsign ?? null,
        qso.myGridsquare ?? null,
        qso.adifExtra ? JSON.stringify(qso.adifExtra) : null,
        qso.createdAt,
        qso.updatedAt,
      ],
    );
  }

  return qsos;
}

export async function updateStationLogQso(qso: StationLogQso): Promise<StationLogQso> {
  const database = await getStationLogDatabase();
  const updated: StationLogQso = {
    ...qso,
    theirCallsign: qso.theirCallsign.trim().toUpperCase(),
    mode: qso.mode.trim().toUpperCase(),
    band: optionalText(qso.band) ?? adifBandFromFrequencyHz(qso.frequencyHz),
    updatedAt: Date.now(),
  };

  await database.execute(
    `UPDATE station_log_qsos SET
       started_at = $1,
       ended_at = $2,
       their_callsign = $3,
       frequency_hz = $4,
       band = $5,
       mode = $6,
       submode = $7,
       rst_sent = $8,
       rst_received = $9,
       their_name = $10,
       their_qth = $11,
       their_gridsquare = $12,
       tx_power_watts = $13,
       comment = $14,
       operator_callsign = $15,
       station_callsign = $16,
       my_gridsquare = $17,
       adif_extra = $18,
       updated_at = $19
     WHERE id = $20`,
    [
      updated.startedAt,
      updated.endedAt ?? null,
      updated.theirCallsign,
      updated.frequencyHz ?? null,
      updated.band ?? null,
      updated.mode,
      updated.submode ?? null,
      updated.rstSent ?? null,
      updated.rstReceived ?? null,
      updated.theirName ?? null,
      updated.theirQth ?? null,
      updated.theirGridsquare ?? null,
      updated.txPowerWatts ?? null,
      updated.comment ?? null,
      updated.operatorCallsign ?? null,
      updated.stationCallsign ?? null,
      updated.myGridsquare ?? null,
      updated.adifExtra ? JSON.stringify(updated.adifExtra) : null,
      updated.updatedAt,
      updated.id,
    ],
  );

  return updated;
}

export async function deleteStationLogQso(id: string): Promise<void> {
  const database = await getStationLogDatabase();
  await database.execute('DELETE FROM station_log_qsos WHERE id = $1', [id]);
}

export function matchesStationLogSearch(qso: StationLogQso, query: string): boolean {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return true;
  }

  const callsign = qso.theirCallsign.toLowerCase();
  const name = qso.theirName?.toLowerCase() ?? '';
  const mode = qso.mode.toLowerCase();
  const submode = qso.submode?.toLowerCase() ?? '';
  const frequency = qso.frequencyHz !== undefined ? String(qso.frequencyHz) : '';
  const frequencyMhz = qso.frequencyHz !== undefined ? (qso.frequencyHz / 1_000_000).toFixed(4) : '';
  const band = qso.band?.toLowerCase() ?? '';

  return (
    callsign.includes(trimmed) ||
    name.includes(trimmed) ||
    mode.includes(trimmed) ||
    submode.includes(trimmed) ||
    frequency.includes(trimmed) ||
    frequencyMhz.includes(trimmed) ||
    band.includes(trimmed)
  );
}
