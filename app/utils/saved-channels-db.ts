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

export interface SavedChannelRow {
  id: string;
  name: string | null;
  transmit_frequency: number;
  receive_frequency: number;
  transmit_tone: number;
  transmit_tone_type: string;
  receive_tone: number;
  receive_tone_type: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface SavedChannel extends RadioChannel {
  id: RadioChannelId;
  notes?: string;
  createdAt: number;
  updatedAt: number;
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
    transmitFrequency: Frequency(row.transmit_frequency),
    receiveFrequency: Frequency(row.receive_frequency),
    transmitTone: radioToneFromDb(row.transmit_tone, row.transmit_tone_type),
    receiveTone: radioToneFromDb(row.receive_tone, row.receive_tone_type),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function radioChannelToSavedChannel(
  channel: RadioChannel,
  options: { id?: RadioChannelId; notes?: string; createdAt?: number; updatedAt?: number } = {},
): SavedChannel {
  const now = Date.now();

  return {
    id: options.id ?? RadioChannelId(crypto.randomUUID()),
    name: channel.name,
    transmitFrequency: channel.transmitFrequency,
    receiveFrequency: channel.receiveFrequency,
    transmitTone: channel.transmitTone,
    receiveTone: channel.receiveTone,
    notes: options.notes,
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
}

export async function listSavedChannels(): Promise<SavedChannel[]> {
  const database = await getSavedChannelsDatabase();
  const rows = await database.select<SavedChannelRow[]>(
    `SELECT id, name, transmit_frequency, receive_frequency,
            transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
            notes, created_at, updated_at
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
         id, name, transmit_frequency, receive_frequency,
         transmit_tone, transmit_tone_type, receive_tone, receive_tone_type,
         notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        channel.id,
        channel.name ?? null,
        channel.transmitFrequency,
        channel.receiveFrequency,
        channel.transmitTone.tone,
        toneTypeToDb(channel.transmitTone.type),
        channel.receiveTone.tone,
        toneTypeToDb(channel.receiveTone.type),
        channel.notes ?? null,
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
  const updated: SavedChannel = {
    ...channel,
    updatedAt: Date.now(),
  };

  await database.execute(
    `UPDATE saved_channels SET
       name = $1,
       transmit_frequency = $2,
       receive_frequency = $3,
       transmit_tone = $4,
       transmit_tone_type = $5,
       receive_tone = $6,
       receive_tone_type = $7,
       notes = $8,
       updated_at = $9
     WHERE id = $10`,
    [
      updated.name ?? null,
      updated.transmitFrequency,
      updated.receiveFrequency,
      updated.transmitTone.tone,
      toneTypeToDb(updated.transmitTone.type),
      updated.receiveTone.tone,
      toneTypeToDb(updated.receiveTone.type),
      updated.notes ?? null,
      updated.updatedAt,
      updated.id,
    ],
  );

  return updated;
}

export async function deleteSavedChannel(id: RadioChannelId): Promise<void> {
  const database = await getSavedChannelsDatabase();
  await database.execute('DELETE FROM saved_channels WHERE id = $1', [id]);
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
  const transmit = String(channel.transmitFrequency);
  const receive = String(channel.receiveFrequency);
  const transmitMhz = (channel.transmitFrequency / 1_000_000).toFixed(4);
  const receiveMhz = (channel.receiveFrequency / 1_000_000).toFixed(4);

  return (
    name.includes(trimmed) ||
    transmit.includes(trimmed) ||
    receive.includes(trimmed) ||
    transmitMhz.includes(trimmed) ||
    receiveMhz.includes(trimmed)
  );
}
