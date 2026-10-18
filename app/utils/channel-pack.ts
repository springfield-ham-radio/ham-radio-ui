import { Frequency, RadioChannelId, RadioToneType, type RadioTone } from '@springfield/ham-radio-api';
import { CHANNEL_GROUP_NAME_MAX_LENGTH } from '~/utils/channel-groups';
import {
  coordinatesFromPair,
  type RepeaterUse,
  type SavedChannel,
  type SavedChannelKind,
  type SavedChannelSourceFormat,
} from '~/utils/saved-channels-db';

export const CHANNEL_PACK_SCHEMA_VERSION = 1;
export const CHANNEL_PACK_FILE_EXTENSION = 'hpack';
/** Checked before JSON.parse so a hostile file cannot force a huge allocation. */
export const CHANNEL_PACK_MAX_CHARS = 1_000_000;
export const CHANNEL_PACK_MAX_CHANNELS = 5_000;
/** Above any amateur allocation, and still a safe integer. */
const MAX_FREQUENCY_HZ = 10_000_000_000_000;
const PACK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChannelPackTone {
  type: 'ctcss' | 'dcs';
  hz?: number;
  code?: number;
}

export interface ChannelPackChannel {
  id: string;
  name?: string;
  kind: SavedChannelKind;
  callsign?: string;
  rxHz: number;
  txHz: number;
  rxTone?: ChannelPackTone;
  txTone?: ChannelPackTone;
  notes?: string;
  use?: RepeaterUse;
  onAir?: boolean;
  latitude?: number;
  longitude?: number;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  landmark?: string;
  modes?: string;
  sourceKey?: string;
  provenance?: 'repeaterbook';
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
  allstar?: boolean;
  echolink?: boolean;
  irlp?: boolean;
  wires?: boolean;
}

export interface ChannelPackDocument {
  schemaVersion: typeof CHANNEL_PACK_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  updated: string;
  source?: string;
  channels: ChannelPackChannel[];
}

export interface ChannelPackMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version: string;
  updated: string;
  source?: string;
}

/** Library row plus the pack slug stored for re-import matching (PR 2 persists this). */
export type SavedChannelWithPackId = SavedChannel & {
  packChannelId?: string;
};

export interface ChannelPackBuildOptions {
  /** When false, rows with `sourceFormat === 'repeaterbook'` are omitted. Default false. */
  includeRepeaterBook?: boolean;
}

const PACK_ROOT_KEYS: readonly (keyof ChannelPackDocument)[] = [
  'schemaVersion',
  'id',
  'name',
  'description',
  'author',
  'version',
  'updated',
  'source',
  'channels',
];

const PACK_CHANNEL_KEYS: readonly (keyof ChannelPackChannel)[] = [
  'id',
  'name',
  'kind',
  'callsign',
  'rxHz',
  'txHz',
  'rxTone',
  'txTone',
  'notes',
  'use',
  'onAir',
  'latitude',
  'longitude',
  'city',
  'county',
  'state',
  'country',
  'landmark',
  'modes',
  'sourceKey',
  'provenance',
  'allstarNode',
  'echolinkNode',
  'irlpNode',
  'wiresNode',
  'allstar',
  'echolink',
  'irlp',
  'wires',
];

export function countRepeaterBookChannels(channels: readonly { sourceFormat?: string | null }[]): number {
  return channels.filter((channel) => channel.sourceFormat === 'repeaterbook').length;
}

/** Mint missing pack channel slugs before export or database write. */
export function ensurePackChannelIds(channels: readonly SavedChannelWithPackId[]): SavedChannelWithPackId[] {
  const usedIds = new Set<string>();

  for (const channel of channels) {
    const stored = channel.packChannelId?.trim();

    if (stored) {
      usedIds.add(stored);
    }
  }

  return channels.map((channel) => {
    const stored = channel.packChannelId?.trim();

    if (stored && /^[a-z0-9][a-z0-9-]*$/.test(stored) && stored.length <= 64) {
      return { ...channel, packChannelId: stored };
    }

    const packChannelId = mintPackChannelId(channel, usedIds);
    usedIds.add(packChannelId);
    return { ...channel, packChannelId };
  });
}

export function defaultPackFileName(groupName: string): string {
  const slug = groupName
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${slug || 'channel-pack'}.${CHANNEL_PACK_FILE_EXTENSION}`;
}

export function buildChannelPackDocument(
  metadata: ChannelPackMetadata,
  channels: readonly SavedChannelWithPackId[],
  options: ChannelPackBuildOptions = {},
): ChannelPackDocument {
  const includeRepeaterBook = options.includeRepeaterBook === true;
  const usedIds = new Set<string>();
  const packChannels: ChannelPackChannel[] = [];

  for (const channel of channels) {
    if (channel.sourceFormat === 'repeaterbook' && !includeRepeaterBook) {
      continue;
    }

    packChannels.push(savedChannelToPackChannel(channel, usedIds));
    usedIds.add(packChannels[packChannels.length - 1]!.id);
  }

  return {
    schemaVersion: CHANNEL_PACK_SCHEMA_VERSION,
    id: metadata.id,
    name: metadata.name,
    description: trimOptional(metadata.description),
    author: trimOptional(metadata.author),
    version: metadata.version.trim(),
    updated: metadata.updated,
    source: trimOptional(metadata.source),
    channels: packChannels,
  };
}

export function serializeChannelPack(document: ChannelPackDocument): string {
  const payload = packDocumentToJsonObject(document);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseChannelPack(text: string): ChannelPackDocument {
  if (text.length > CHANNEL_PACK_MAX_CHARS) {
    throw new Error(`Channel pack is too large (maximum ${CHANNEL_PACK_MAX_CHARS} characters)`);
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Channel pack is not valid JSON');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Channel pack must be a JSON object');
  }

  const record = raw as Record<string, unknown>;
  const schemaVersion = record.schemaVersion;

  if (schemaVersion !== CHANNEL_PACK_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported channel pack schemaVersion ${String(schemaVersion)}: this app accepts only version ${CHANNEL_PACK_SCHEMA_VERSION}`,
    );
  }

  const id = requirePackId(record.id);
  const name = requireNonEmptyString(record.name, 'name');

  if (name.length > CHANNEL_GROUP_NAME_MAX_LENGTH) {
    throw new Error(`Channel pack name must be ${CHANNEL_GROUP_NAME_MAX_LENGTH} characters or fewer`);
  }

  const version = requireNonEmptyString(record.version, 'version');
  const updated = requireNonEmptyString(record.updated, 'updated');

  if (!Array.isArray(record.channels)) {
    throw new Error('Channel pack channels must be an array');
  }

  if (record.channels.length > CHANNEL_PACK_MAX_CHANNELS) {
    throw new Error(`Channel pack has too many channels (maximum ${CHANNEL_PACK_MAX_CHANNELS})`);
  }

  const seenChannelIds = new Set<string>();
  const channels: ChannelPackChannel[] = [];

  for (const [index, entry] of record.channels.entries()) {
    const channel = parsePackChannel(entry, index);
    if (seenChannelIds.has(channel.id)) {
      throw new Error(`Duplicate channel id "${channel.id}" in channel pack`);
    }

    seenChannelIds.add(channel.id);
    channels.push(channel);
  }

  return {
    schemaVersion: CHANNEL_PACK_SCHEMA_VERSION,
    id,
    name,
    description: optionalString(record.description),
    author: optionalString(record.author),
    version,
    updated,
    source: optionalString(record.source),
    channels,
  };
}

/** Convert a parsed pack into library rows. New rows get fresh ids unless `createId` is supplied. */
export function packChannelsToSavedChannels(
  channels: readonly ChannelPackChannel[],
  createId: () => RadioChannelId = () => RadioChannelId(crypto.randomUUID()),
): SavedChannelWithPackId[] {
  const now = Date.now();

  return channels.map((channel) => packChannelToSavedChannel(channel, createId(), now));
}

function savedChannelToPackChannel(channel: SavedChannelWithPackId, usedIds: Set<string>): ChannelPackChannel {
  const packId = takePackChannelId(channel, usedIds);
  const point = coordinatesFromPair(channel.latitude, channel.longitude);
  const pack: ChannelPackChannel = {
    id: packId,
    kind: channel.kind,
    rxHz: channel.receiveFrequency,
    txHz: channel.transmitFrequency,
  };

  if (channel.name) {
    pack.name = channel.name;
  }

  if (channel.kind === 'repeater' && channel.callsign) {
    pack.callsign = channel.callsign;
  }

  const rxTone = packToneFromRadio(channel.receiveTone);
  const txTone = packToneFromRadio(channel.transmitTone);

  if (rxTone) {
    pack.rxTone = rxTone;
  }

  if (txTone) {
    pack.txTone = txTone;
  }

  if (channel.notes) {
    pack.notes = channel.notes;
  }

  if (channel.kind === 'repeater') {
    if (channel.use) {
      pack.use = channel.use;
    }

    if (channel.onAir !== undefined) {
      pack.onAir = channel.onAir;
    }

    if (point.latitude !== undefined && point.longitude !== undefined) {
      pack.latitude = point.latitude;
      pack.longitude = point.longitude;
    }

    for (const field of ['city', 'county', 'state', 'country', 'landmark', 'modes', 'sourceKey'] as const) {
      if (channel[field]) {
        pack[field] = channel[field];
      }
    }

    if (channel.sourceFormat === 'repeaterbook') {
      pack.provenance = 'repeaterbook';
    }

    assignLinkedNodesToPack(channel, pack);
  }

  return pack;
}

function packChannelToSavedChannel(channel: ChannelPackChannel, id: RadioChannelId, now: number): SavedChannelWithPackId {
  const point = coordinatesFromPair(channel.latitude, channel.longitude);
  const sourceFormat = packSourceFormat(channel);
  const kind = channel.kind;

  const saved: SavedChannelWithPackId = {
    id,
    packChannelId: channel.id,
    kind,
    name: channel.name,
    transmitFrequency: Frequency(channel.txHz),
    receiveFrequency: Frequency(channel.rxHz),
    transmitTone: radioToneFromPack(channel.txTone),
    receiveTone: radioToneFromPack(channel.rxTone),
    notes: trimOptional(channel.notes),
    createdAt: now,
    updatedAt: now,
  };

  if (sourceFormat) {
    saved.sourceFormat = sourceFormat;
  }

  if (kind === 'repeater') {
    saved.callsign = trimOptional(channel.callsign);
    saved.use = channel.use;
    saved.onAir = channel.onAir;
    saved.latitude = point.latitude;
    saved.longitude = point.longitude;
    saved.city = trimOptional(channel.city);
    saved.county = trimOptional(channel.county);
    saved.state = trimOptional(channel.state);
    saved.country = trimOptional(channel.country);
    saved.landmark = trimOptional(channel.landmark);
    saved.modes = trimOptional(channel.modes);
    saved.sourceKey = trimOptional(channel.sourceKey);
    saved.allstarNode = trimOptional(channel.allstarNode);
    saved.echolinkNode = trimOptional(channel.echolinkNode);
    saved.irlpNode = trimOptional(channel.irlpNode);
    saved.wiresNode = trimOptional(channel.wiresNode);
    saved.allstar = channel.allstar;
    saved.echolink = channel.echolink;
    saved.irlp = channel.irlp;
    saved.wires = channel.wires;
  }

  return saved;
}

function packSourceFormat(channel: ChannelPackChannel): SavedChannelSourceFormat | undefined {
  if (channel.provenance === 'repeaterbook') {
    return 'repeaterbook';
  }

  return undefined;
}

function assignLinkedNodesToPack(channel: SavedChannel, pack: ChannelPackChannel): void {
  if (channel.allstarNode) {
    pack.allstarNode = channel.allstarNode;
  }

  if (channel.echolinkNode) {
    pack.echolinkNode = channel.echolinkNode;
  }

  if (channel.irlpNode) {
    pack.irlpNode = channel.irlpNode;
  }

  if (channel.wiresNode) {
    pack.wiresNode = channel.wiresNode;
  }

  if (channel.allstar) {
    pack.allstar = true;
  }

  if (channel.echolink) {
    pack.echolink = true;
  }

  if (channel.irlp) {
    pack.irlp = true;
  }

  if (channel.wires) {
    pack.wires = true;
  }
}

function packToneFromRadio(tone: RadioTone | undefined): ChannelPackTone | undefined {
  if (!tone || !tone.tone) {
    return undefined;
  }

  if (tone.type === RadioToneType.DCS) {
    return { type: 'dcs', code: tone.tone };
  }

  return { type: 'ctcss', hz: tone.tone / 10 };
}

function radioToneFromPack(tone: ChannelPackTone | undefined): RadioTone {
  if (!tone) {
    return { tone: 0, type: RadioToneType.CTCSS };
  }

  if (tone.type === 'dcs') {
    const code = tone.code;

    if (typeof code === 'number' && Number.isFinite(code) && code > 0) {
      return { tone: code, type: RadioToneType.DCS };
    }

    return { tone: 0, type: RadioToneType.DCS };
  }

  const hz = tone.hz;

  if (typeof hz === 'number' && Number.isFinite(hz) && hz > 0) {
    return { tone: Math.round(hz * 10), type: RadioToneType.CTCSS };
  }

  return { tone: 0, type: RadioToneType.CTCSS };
}

function parsePackChannel(raw: unknown, index: number): ChannelPackChannel {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Channel pack channels[${index}] must be an object`);
  }

  const record = raw as Record<string, unknown>;
  const id = requirePackChannelId(record.id, index);
  const kind = parseKind(record.kind, index);
  const rxHz = requirePositiveInteger(record.rxHz, `channels[${index}].rxHz`);
  const txHz = requirePositiveInteger(record.txHz, `channels[${index}].txHz`);
  const latitude = optionalFiniteNumber(record.latitude);
  const longitude = optionalFiniteNumber(record.longitude);
  assertCoordinatePair(latitude, longitude, index);

  const channel: ChannelPackChannel = { id, kind, rxHz, txHz };
  channel.name = optionalString(record.name);
  channel.callsign = optionalString(record.callsign);
  channel.notes = optionalString(record.notes);
  channel.use = parseUse(record.use, index);
  channel.onAir = optionalBoolean(record.onAir);
  channel.latitude = latitude;
  channel.longitude = longitude;
  channel.city = optionalString(record.city);
  channel.county = optionalString(record.county);
  channel.state = optionalString(record.state);
  channel.country = optionalString(record.country);
  channel.landmark = optionalString(record.landmark);
  channel.modes = optionalString(record.modes);
  channel.sourceKey = optionalString(record.sourceKey);
  channel.provenance = parseProvenance(record.provenance, index);
  channel.rxTone = parsePackTone(record.rxTone, `channels[${index}].rxTone`);
  channel.txTone = parsePackTone(record.txTone, `channels[${index}].txTone`);
  channel.allstarNode = optionalString(record.allstarNode);
  channel.echolinkNode = optionalString(record.echolinkNode);
  channel.irlpNode = optionalString(record.irlpNode);
  channel.wiresNode = optionalString(record.wiresNode);
  channel.allstar = optionalBoolean(record.allstar);
  channel.echolink = optionalBoolean(record.echolink);
  channel.irlp = optionalBoolean(record.irlp);
  channel.wires = optionalBoolean(record.wires);

  return channel;
}

function packDocumentToJsonObject(document: ChannelPackDocument): Record<string, unknown> {
  const values: Record<keyof ChannelPackDocument, unknown> = {
    schemaVersion: document.schemaVersion,
    id: document.id,
    name: document.name,
    description: document.description,
    author: document.author,
    version: document.version,
    updated: document.updated,
    source: document.source,
    channels: document.channels.map((channel) => packChannelToJsonObject(channel)),
  };
  const root: Record<string, unknown> = {};

  for (const key of PACK_ROOT_KEYS) {
    const value = values[key];

    if (key === 'schemaVersion' || key === 'channels') {
      root[key] = value;
      continue;
    }

    if (typeof value === 'string' && value.length > 0) {
      root[key] = value;
    }
  }

  return root;
}

function packChannelToJsonObject(channel: ChannelPackChannel): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  for (const key of PACK_CHANNEL_KEYS) {
    const value = channel[key];

    if (value === undefined) {
      continue;
    }

    object[key] = value;
  }

  return object;
}

function takePackChannelId(channel: SavedChannelWithPackId, usedIds: Set<string>): string {
  const stored = channel.packChannelId?.trim();

  if (stored && /^[a-z0-9][a-z0-9-]*$/.test(stored) && stored.length <= 64 && !usedIds.has(stored)) {
    return stored;
  }

  return mintPackChannelId(channel, usedIds);
}

function mintPackChannelId(channel: SavedChannel, usedIds: Set<string>): string {
  const seed = (channel.callsign || channel.name || 'channel').trim().toLowerCase();
  let base = seed
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 48);

  if (!base || !/^[a-z0-9]/.test(base)) {
    base = `ch-${base || 'channel'}`.replaceAll(/^-+/, '');
  }

  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function requirePackChannelId(value: unknown, index: number): string {
  const id = requireNonEmptyString(value, `channels[${index}].id`);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id.length > 64) {
    throw new Error(`Channel pack channels[${index}].id is not a valid pack channel id`);
  }

  return id;
}

function parseKind(value: unknown, index: number): SavedChannelKind {
  if (value === 'channel' || value === 'repeater') {
    return value;
  }

  throw new Error(`Channel pack channels[${index}].kind must be "channel" or "repeater"`);
}

function parseUse(value: unknown, index: number): RepeaterUse | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === 'open' || value === 'closed') {
    return value;
  }

  throw new Error(`Channel pack channels[${index}].use must be "open" or "closed"`);
}

function parseProvenance(value: unknown, index: number): 'repeaterbook' | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value === 'repeaterbook') {
    return value;
  }

  throw new Error(`Channel pack channels[${index}].provenance is not supported`);
}

function parsePackTone(value: unknown, label: string): ChannelPackTone | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Channel pack ${label} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const type = record.type;

  if (type === 'dcs') {
    const code = record.code;

    if (typeof code !== 'number' || !Number.isFinite(code) || code <= 0) {
      throw new Error(`Channel pack ${label} DCS code must be a positive number`);
    }

    return { type: 'dcs', code: Math.trunc(code) };
  }

  if (type === 'ctcss') {
    const hz = record.hz;

    if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) {
      throw new Error(`Channel pack ${label} CTCSS hz must be a positive number`);
    }

    return { type: 'ctcss', hz };
  }

  throw new Error(`Channel pack ${label} type must be "ctcss" or "dcs"`);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Channel pack ${label} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Channel pack ${label} cannot be blank`);
  }

  return trimmed;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requirePackId(value: unknown): string {
  const id = requireNonEmptyString(value, 'id');

  if (!PACK_ID_PATTERN.test(id)) {
    throw new Error('Channel pack id must be a UUID');
  }

  return id;
}

function assertCoordinatePair(latitude: number | undefined, longitude: number | undefined, index: number): void {
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;

  if (hasLatitude !== hasLongitude) {
    throw new Error(`Channel pack channels[${index}] latitude and longitude must both be set`);
  }

  if (!hasLatitude || !hasLongitude || latitude === undefined || longitude === undefined) {
    return;
  }

  if (latitude === 0 && longitude === 0) {
    throw new Error(`Channel pack channels[${index}] cannot use the coordinate pair (0, 0)`);
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error(`Channel pack channels[${index}] coordinates are out of range`);
  }
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_FREQUENCY_HZ) {
    throw new Error(`Channel pack ${label} must be a positive integer`);
  }

  return value;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

/** Stable key order for tests and git diffs. */
export function channelPackRootKeyOrder(): readonly string[] {
  return PACK_ROOT_KEYS;
}
