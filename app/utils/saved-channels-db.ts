import {
  Frequency,
  RadioChannelId,
  RadioToneType,
  type GeoPoint,
  type RadioChannel,
  type RadioTone,
} from '@springfield/ham-radio-api';
// RadioChannel is used by createBlankRadioChannel and insert helpers.
import Database from '@tauri-apps/plugin-sql';
import { linkedNodeSearchText, linkedNodesForKind, type LinkedNodes } from '~/utils/linked-nodes';
import { locatedPoint } from '~/utils/location-format';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export const SAVED_CHANNELS_DATABASE = 'sqlite:ham-radio.db';

export type SavedToneType = 'CTCSS' | 'DCS';

export type SavedChannelKind = 'channel' | 'repeater';

/** Who may use a repeater. Ordinary channels leave this unset. */
export type RepeaterUse = 'open' | 'closed';

/** Which export a repeater row came from. */
export type SavedChannelSourceFormat = 'repeaterbook' | 'chirp';

/**
 * Which repeater-record columns an import file actually contains.
 * A missing column must not wipe a value stored from an earlier import.
 */
export interface SavedChannelRecordColumns {
  sourceKey: boolean;
  sourceFormat: boolean;
  city: boolean;
  county: boolean;
  state: boolean;
  country: boolean;
  landmark: boolean;
  modes: boolean;
  lastUpdate: boolean;
}

export interface SavedChannelRow {
  id: string;
  name: string | null;
  kind: string | null;
  transmit_frequency: number;
  receive_frequency: number;
  transmit_tone: number;
  transmit_tone_type: string;
  receive_tone: number;
  receive_tone_type: string;
  notes: string | null;
  use_type: string | null;
  on_air: number | null;
  callsign: string | null;
  latitude: number | null;
  longitude: number | null;
  allstar_node: string | null;
  echolink_node: string | null;
  irlp_node: string | null;
  wires_node: string | null;
  allstar_linked: number | null;
  echolink_linked: number | null;
  irlp_linked: number | null;
  wires_linked: number | null;
  source_key: string | null;
  source_format: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  country: string | null;
  landmark: string | null;
  modes: string | null;
  last_update: string | null;
  created_at: number;
  updated_at: number;
}

export interface SavedChannel extends RadioChannel, LinkedNodes {
  id: RadioChannelId;
  kind: SavedChannelKind;
  notes?: string;
  /** Access policy for a repeater. Unset on ordinary channels. */
  use?: RepeaterUse;
  /** Whether a repeater is currently on the air. Unset on ordinary channels. */
  onAir?: boolean;
  /** Repeater call sign. Unset on ordinary channels. */
  callsign?: string;
  /** Decimal degrees from an imported route or library CSV. Both are set, or neither is. */
  latitude?: number;
  longitude?: number;
  /**
   * Stable identity for re-import. RepeaterBook uses state id and repeater id when
   * the export has them, otherwise call sign, output frequency, and location.
   */
  sourceKey?: string;
  sourceFormat?: SavedChannelSourceFormat;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  landmark?: string;
  modes?: string;
  /**
   * The export's Last Update when that column is present. Otherwise the time this
   * row was imported or last changed by an import.
   */
  lastUpdate?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Keep a coordinate pair only when both values are in range.
 * The exact pair (0, 0) is Null Island: no ham repeater is there, so it is unlocated.
 * A single zero (the equator or the prime meridian) stays valid.
 */
export function coordinatesFromPair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Partial<GeoPoint> {
  const point = locatedPoint(latitude, longitude);

  if (!point) {
    return {};
  }

  return { latitude: point.latitude, longitude: point.longitude };
}

/**
 * SQL bindings for the latitude and longitude columns. Absent coordinates, and the
 * Null Island pair, are NULL rather than 0.
 */
export function coordinateColumnsForDb(channel: {
  latitude?: number | null;
  longitude?: number | null;
}): { latitude: number | null; longitude: number | null } {
  const point = coordinatesFromPair(channel.latitude, channel.longitude);

  return {
    latitude: point.latitude ?? null,
    longitude: point.longitude ?? null,
  };
}

export function sourceFormatFromDb(value: string | null | undefined): SavedChannelSourceFormat | undefined {
  if (value === 'repeaterbook' || value === 'chirp') {
    return value;
  }

  return undefined;
}

function textFromDb(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function savedChannelKindFromDb(value: string | null | undefined): SavedChannelKind {
  return value === 'repeater' ? 'repeater' : 'channel';
}

export function repeaterUseFromDb(value: string | null | undefined): RepeaterUse | undefined {
  if (value === 'open' || value === 'closed') {
    return value;
  }

  return undefined;
}

export function onAirFromDb(value: number | null | undefined): boolean | undefined {
  if (value === 1) {
    return true;
  }

  if (value === 0) {
    return false;
  }

  return undefined;
}

export function onAirToDb(value: boolean | undefined): number | null {
  if (value === true) {
    return 1;
  }

  if (value === false) {
    return 0;
  }

  return null;
}

/**
 * Repeater access and on-air status apply only to repeater rows.
 */
export function repeaterStatusForKind(
  kind: SavedChannelKind,
  use: RepeaterUse | undefined,
  onAir: boolean | undefined,
): { use?: RepeaterUse; onAir?: boolean } {
  if (kind !== 'repeater') {
    return {};
  }

  return { use, onAir };
}

let databasePromise: Promise<Database> | undefined;

export function assertSavedChannelsDatabaseAvailable(): void {
  if (!isTauriRuntime()) {
    throw new Error('The channel library requires the Tauri desktop app. Run yarn tauri:dev.');
  }
}

export async function getSavedChannelsDatabase(): Promise<Database> {
  assertSavedChannelsDatabaseAvailable();

  if (!databasePromise) {
    databasePromise = Database.load(SAVED_CHANNELS_DATABASE);
  }

  return databasePromise;
}

export function toneTypeToDb(type: RadioToneType): SavedToneType {
  return type === RadioToneType.DCS ? 'DCS' : 'CTCSS';
}

export function toneTypeFromDb(value: string): RadioToneType {
  return value === 'DCS' ? RadioToneType.DCS : RadioToneType.CTCSS;
}

export function radioToneFromDb(tone: number, type: string): RadioTone {
  return {
    tone,
    type: toneTypeFromDb(type),
  };
}

export function savedChannelRowToModel(row: SavedChannelRow): SavedChannel {
  const kind = savedChannelKindFromDb(row.kind);

  return {
    id: RadioChannelId(row.id),
    name: row.name ?? undefined,
    kind,
    transmitFrequency: Frequency(row.transmit_frequency),
    receiveFrequency: Frequency(row.receive_frequency),
    transmitTone: radioToneFromDb(row.transmit_tone, row.transmit_tone_type),
    receiveTone: radioToneFromDb(row.receive_tone, row.receive_tone_type),
    notes: row.notes ?? undefined,
    ...repeaterStatusForKind(kind, repeaterUseFromDb(row.use_type), onAirFromDb(row.on_air)),
    callsign: kind === 'repeater' ? row.callsign?.trim() || undefined : undefined,
    ...coordinatesFromPair(row.latitude, row.longitude),
    ...linkedNodesForKind(kind, {
      allstarNode: row.allstar_node ?? undefined,
      echolinkNode: row.echolink_node ?? undefined,
      irlpNode: row.irlp_node ?? undefined,
      wiresNode: row.wires_node ?? undefined,
      allstar: row.allstar_linked === 1,
      echolink: row.echolink_linked === 1,
      irlp: row.irlp_linked === 1,
      wires: row.wires_linked === 1,
    }),
    ...repeaterRecordForKind(kind, {
      sourceKey: textFromDb(row.source_key),
      sourceFormat: sourceFormatFromDb(row.source_format),
      city: textFromDb(row.city),
      county: textFromDb(row.county),
      state: textFromDb(row.state),
      country: textFromDb(row.country),
      landmark: textFromDb(row.landmark),
      modes: textFromDb(row.modes),
      lastUpdate: textFromDb(row.last_update),
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Repeater record fields apply only to repeater rows.
 */
export function repeaterRecordForKind(
  kind: SavedChannelKind,
  record: {
    sourceKey?: string;
    sourceFormat?: SavedChannelSourceFormat;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    landmark?: string;
    modes?: string;
    lastUpdate?: string;
  },
): {
  sourceKey?: string;
  sourceFormat?: SavedChannelSourceFormat;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  landmark?: string;
  modes?: string;
  lastUpdate?: string;
} {
  if (kind !== 'repeater') {
    return {};
  }

  return {
    sourceKey: textFromDb(record.sourceKey),
    sourceFormat: record.sourceFormat,
    city: textFromDb(record.city),
    county: textFromDb(record.county),
    state: textFromDb(record.state),
    country: textFromDb(record.country),
    landmark: textFromDb(record.landmark),
    modes: textFromDb(record.modes),
    lastUpdate: textFromDb(record.lastUpdate),
  };
}

export function radioChannelToSavedChannel(
  channel: RadioChannel,
  options: {
    id?: RadioChannelId;
    kind?: SavedChannelKind;
    notes?: string;
    use?: RepeaterUse;
    onAir?: boolean;
    callsign?: string;
    latitude?: number;
    longitude?: number;
    allstarNode?: string;
    echolinkNode?: string;
    irlpNode?: string;
    wiresNode?: string;
    allstar?: boolean;
    echolink?: boolean;
    irlp?: boolean;
    wires?: boolean;
    sourceKey?: string;
    sourceFormat?: SavedChannelSourceFormat;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    landmark?: string;
    modes?: string;
    lastUpdate?: string;
    createdAt?: number;
    updatedAt?: number;
  } = {},
): SavedChannel {
  const now = Date.now();
  const kind = options.kind ?? 'channel';

  return {
    id: options.id ?? RadioChannelId(crypto.randomUUID()),
    name: channel.name,
    kind,
    transmitFrequency: channel.transmitFrequency,
    receiveFrequency: channel.receiveFrequency,
    transmitTone: channel.transmitTone,
    receiveTone: channel.receiveTone,
    notes: options.notes,
    ...repeaterStatusForKind(kind, options.use, options.onAir),
    callsign: kind === 'repeater' ? options.callsign?.trim() || undefined : undefined,
    ...coordinatesFromPair(options.latitude, options.longitude),
    ...linkedNodesForKind(kind, options),
    ...repeaterRecordForKind(kind, options),
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
}

export async function listSavedChannels(): Promise<SavedChannel[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<SavedChannelRow[]>(
    `SELECT id, name, kind, transmit_frequency, receive_frequency,
            transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
            notes, use_type, on_air, callsign, latitude, longitude,
            allstar_node, echolink_node, irlp_node, wires_node,
            allstar_linked, echolink_linked, irlp_linked, wires_linked,
            source_key, source_format, city, county, state, country, landmark, modes, last_update,
            created_at, updated_at
     FROM saved_channels
     ORDER BY name COLLATE NOCASE ASC, receive_frequency ASC`,
  );

  return rows.map(savedChannelRowToModel);
}

export async function insertSavedChannelModels(channels: SavedChannel[]): Promise<SavedChannel[]> {
  if (channels.length === 0) {
    return [];
  }

  const database = await getSavedChannelsDatabase();

  for (const channel of channels) {
    const point = coordinateColumnsForDb(channel);

    await database.execute(
      `INSERT INTO saved_channels (
         id, name, kind, transmit_frequency, receive_frequency,
         transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
         notes, use_type, on_air, callsign, latitude, longitude,
         allstar_node, echolink_node, irlp_node, wires_node,
         allstar_linked, echolink_linked, irlp_linked, wires_linked,
         source_key, source_format, city, county, state, country, landmark, modes, last_update,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)`,
      [
        channel.id,
        channel.name ?? null,
        channel.kind,
        channel.transmitFrequency,
        channel.receiveFrequency,
        channel.transmitTone.tone,
        toneTypeToDb(channel.transmitTone.type),
        channel.receiveTone.tone,
        toneTypeToDb(channel.receiveTone.type),
        channel.notes ?? null,
        channel.use ?? null,
        onAirToDb(channel.onAir),
        channel.callsign ?? null,
        point.latitude,
        point.longitude,
        channel.allstarNode ?? null,
        channel.echolinkNode ?? null,
        channel.irlpNode ?? null,
        channel.wiresNode ?? null,
        channel.allstar ? 1 : 0,
        channel.echolink ? 1 : 0,
        channel.irlp ? 1 : 0,
        channel.wires ? 1 : 0,
        channel.sourceKey ?? null,
        channel.sourceFormat ?? null,
        channel.city ?? null,
        channel.county ?? null,
        channel.state ?? null,
        channel.country ?? null,
        channel.landmark ?? null,
        channel.modes ?? null,
        channel.lastUpdate ?? null,
        channel.createdAt,
        channel.updatedAt,
      ],
    );
  }

  return channels.map((channel) => {
    const point = coordinatesFromPair(channel.latitude, channel.longitude);

    return {
      ...channel,
      latitude: point.latitude,
      longitude: point.longitude,
    };
  });
}

export async function insertSavedChannels(channels: RadioChannel[]): Promise<SavedChannel[]> {
  return insertSavedChannelModels(channels.map((channel) => radioChannelToSavedChannel(channel)));
}

export async function updateSavedChannel(channel: SavedChannel): Promise<SavedChannel> {
  const database = await getSavedChannelsDatabase();
  const status = repeaterStatusForKind(channel.kind, channel.use, channel.onAir);
  const nodes = linkedNodesForKind(channel.kind, channel);
  const point = coordinatesFromPair(channel.latitude, channel.longitude);
  const updated: SavedChannel = {
    ...channel,
    use: status.use,
    onAir: status.onAir,
    callsign: channel.kind === 'repeater' ? channel.callsign?.trim() || undefined : undefined,
    latitude: point.latitude,
    longitude: point.longitude,
    allstarNode: nodes.allstarNode,
    echolinkNode: nodes.echolinkNode,
    irlpNode: nodes.irlpNode,
    wiresNode: nodes.wiresNode,
    allstar: nodes.allstar,
    echolink: nodes.echolink,
    irlp: nodes.irlp,
    wires: nodes.wires,
    ...repeaterRecordForKind(channel.kind, channel),
    updatedAt: Date.now(),
  };
  const columns = coordinateColumnsForDb(updated);

  await database.execute(
    `UPDATE saved_channels SET
       name = $1,
       kind = $2,
       transmit_frequency = $3,
       receive_frequency = $4,
       transmit_tone = $5,
       transmit_tone_type = $6,
       receive_tone = $7,
       receive_tone_type = $8,
       notes = $9,
       use_type = $10,
       on_air = $11,
       callsign = $12,
       latitude = $13,
       longitude = $14,
       allstar_node = $15,
       echolink_node = $16,
       irlp_node = $17,
       wires_node = $18,
       allstar_linked = $19,
       echolink_linked = $20,
       irlp_linked = $21,
       wires_linked = $22,
       source_key = $23,
       source_format = $24,
       city = $25,
       county = $26,
       state = $27,
       country = $28,
       landmark = $29,
       modes = $30,
       last_update = $31,
       updated_at = $32
     WHERE id = $33`,
    [
      updated.name ?? null,
      updated.kind,
      updated.transmitFrequency,
      updated.receiveFrequency,
      updated.transmitTone.tone,
      toneTypeToDb(updated.transmitTone.type),
      updated.receiveTone.tone,
      toneTypeToDb(updated.receiveTone.type),
      updated.notes ?? null,
      updated.use ?? null,
      onAirToDb(updated.onAir),
      updated.callsign ?? null,
      columns.latitude,
      columns.longitude,
      updated.allstarNode ?? null,
      updated.echolinkNode ?? null,
      updated.irlpNode ?? null,
      updated.wiresNode ?? null,
      updated.allstar ? 1 : 0,
      updated.echolink ? 1 : 0,
      updated.irlp ? 1 : 0,
      updated.wires ? 1 : 0,
      updated.sourceKey ?? null,
      updated.sourceFormat ?? null,
      updated.city ?? null,
      updated.county ?? null,
      updated.state ?? null,
      updated.country ?? null,
      updated.landmark ?? null,
      updated.modes ?? null,
      updated.lastUpdate ?? null,
      updated.updatedAt,
      updated.id,
    ],
  );

  return updated;
}

export async function deleteSavedChannels(ids: readonly RadioChannelId[]): Promise<void> {
  const unique = [...new Set(ids)];

  if (unique.length === 0) {
    return;
  }

  const database = await getSavedChannelsDatabase();
  const placeholders = unique.map((_, index) => `$${index + 1}`).join(', ');

  await database.execute(`DELETE FROM channel_group_members WHERE channel_id IN (${placeholders})`, [...unique]);
  await database.execute(`DELETE FROM saved_channels WHERE id IN (${placeholders})`, [...unique]);
}

export async function deleteSavedChannel(id: RadioChannelId): Promise<void> {
  await deleteSavedChannels([id]);
}

export function createBlankRadioChannel(): RadioChannel {
  return {
    name: '',
    transmitFrequency: Frequency(146_520_000),
    receiveFrequency: Frequency(146_520_000),
    transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    receiveTone: { tone: 0, type: RadioToneType.CTCSS },
  };
}

export function formatSavedTone(tone: RadioTone | undefined): string {
  if (!tone || !tone.tone) {
    return '';
  }

  if (tone.type === RadioToneType.DCS) {
    return `DCS ${tone.tone}`;
  }

  return `${(tone.tone / 10).toFixed(1)} CTCSS`;
}

export function matchesSavedChannelSearch(channel: SavedChannel, query: string): boolean {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return true;
  }

  const name = channel.name?.toLowerCase() ?? '';
  const callsign = channel.callsign?.toLowerCase() ?? '';
  const notes = channel.notes?.toLowerCase() ?? '';
  const location = [channel.city, channel.county, channel.state, channel.country, channel.landmark]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLowerCase();
  const linked = linkedNodeSearchText(channel);
  const useLabel = channel.use ?? '';
  const onAirLabel = channel.onAir === true ? 'on-air' : channel.onAir === false ? 'off-air' : '';
  const transmit = String(channel.transmitFrequency);
  const receive = String(channel.receiveFrequency);
  const transmitMhz = (channel.transmitFrequency / 1_000_000).toFixed(4);
  const receiveMhz = (channel.receiveFrequency / 1_000_000).toFixed(4);

  return (
    name.includes(trimmed) ||
    callsign.includes(trimmed) ||
    notes.includes(trimmed) ||
    location.includes(trimmed) ||
    linked.includes(trimmed) ||
    useLabel.includes(trimmed) ||
    onAirLabel.includes(trimmed) ||
    (channel.kind === 'repeater' && 'repeater'.startsWith(trimmed) && trimmed.length >= 3) ||
    transmit.includes(trimmed) ||
    receive.includes(trimmed) ||
    transmitMhz.includes(trimmed) ||
    receiveMhz.includes(trimmed)
  );
}
