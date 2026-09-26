import {
  Frequency,
  RadioChannelId,
  RadioToneType,
  type RadioChannel,
  type RadioTone,
} from '@springfield/ham-radio-api';
// RadioChannel is used by createBlankRadioChannel and insert helpers.
import Database from '@tauri-apps/plugin-sql';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export const SAVED_CHANNELS_DATABASE = 'sqlite:ham-radio.db';

export type SavedToneType = 'CTCSS' | 'DCS';

export type SavedChannelKind = 'channel' | 'repeater';

/** Who may use a repeater. Ordinary channels leave this unset. */
export type RepeaterUse = 'open' | 'closed';

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
  created_at: number;
  updated_at: number;
}

export interface SavedChannel extends RadioChannel {
  id: RadioChannelId;
  kind: SavedChannelKind;
  notes?: string;
  /** Access policy for a repeater. Unset on ordinary channels. */
  use?: RepeaterUse;
  /** Whether a repeater is currently on the air. Unset on ordinary channels. */
  onAir?: boolean;
  /** Repeater call sign. Unset on ordinary channels. */
  callsign?: string;
  createdAt: number;
  updatedAt: number;
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
  return {
    id: RadioChannelId(row.id),
    name: row.name ?? undefined,
    kind: savedChannelKindFromDb(row.kind),
    transmitFrequency: Frequency(row.transmit_frequency),
    receiveFrequency: Frequency(row.receive_frequency),
    transmitTone: radioToneFromDb(row.transmit_tone, row.transmit_tone_type),
    receiveTone: radioToneFromDb(row.receive_tone, row.receive_tone_type),
    notes: row.notes ?? undefined,
    ...repeaterStatusForKind(savedChannelKindFromDb(row.kind), repeaterUseFromDb(row.use_type), onAirFromDb(row.on_air)),
    callsign: savedChannelKindFromDb(row.kind) === 'repeater' ? row.callsign?.trim() || undefined : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
}

export async function listSavedChannels(): Promise<SavedChannel[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<SavedChannelRow[]>(
    `SELECT id, name, kind, transmit_frequency, receive_frequency,
            transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
            notes, use_type, on_air, callsign, created_at, updated_at
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
    await database.execute(
      `INSERT INTO saved_channels (
         id, name, kind, transmit_frequency, receive_frequency,
         transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
         notes, use_type, on_air, callsign, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
        channel.createdAt,
        channel.updatedAt,
      ],
    );
  }

  return channels;
}

export async function insertSavedChannels(channels: RadioChannel[]): Promise<SavedChannel[]> {
  return insertSavedChannelModels(channels.map((channel) => radioChannelToSavedChannel(channel)));
}

export async function updateSavedChannel(channel: SavedChannel): Promise<SavedChannel> {
  const database = await getSavedChannelsDatabase();
  const status = repeaterStatusForKind(channel.kind, channel.use, channel.onAir);
  const updated: SavedChannel = {
    ...channel,
    use: status.use,
    onAir: status.onAir,
    callsign: channel.kind === 'repeater' ? channel.callsign?.trim() || undefined : undefined,
    updatedAt: Date.now(),
  };

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
       updated_at = $13
     WHERE id = $14`,
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
    useLabel.includes(trimmed) ||
    onAirLabel.includes(trimmed) ||
    (channel.kind === 'repeater' && 'repeater'.startsWith(trimmed) && trimmed.length >= 3) ||
    transmit.includes(trimmed) ||
    receive.includes(trimmed) ||
    transmitMhz.includes(trimmed) ||
    receiveMhz.includes(trimmed)
  );
}
