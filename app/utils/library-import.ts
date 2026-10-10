import type { RadioChannelId, RadioTone } from '@springfield/ham-radio-api';
import { linkedNodesEqual, mergeLinkedNodes } from '~/utils/linked-nodes';
import {
  coordinatesFromPair,
  type SavedChannel,
  type SavedChannelRecordColumns,
  type SavedChannelSourceFormat,
} from '~/utils/saved-channels-db';

export interface LibraryImportPolicy {
  columns: SavedChannelRecordColumns;
  replaceLinkedNodes: boolean;
  replaceLinkedPresence: boolean;
  /** Stored when a changed row has no Last Update value in the file. */
  importedAt: string;
}

export interface LibraryImportPlan {
  insert: SavedChannel[];
  update: SavedChannel[];
  memberIds: RadioChannelId[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Fallback identity used only when a row has no source key.
 * Transmit frequency is included, so an offset change does not match this key.
 */
export function libraryImportKey(
  channel: Pick<SavedChannel, 'name' | 'kind' | 'callsign' | 'transmitFrequency' | 'receiveFrequency'>,
): string {
  const label = (channel.callsign || channel.name || '').trim().toLowerCase();
  return `${channel.kind}|${label}|${channel.transmitFrequency}|${channel.receiveFrequency}`;
}

export function formatLibraryImportSummary(added: number, updated: number, unchanged: number): string {
  return `${added} added, ${updated} updated, ${unchanged} unchanged`;
}

/**
 * Match incoming rows to the library by source key, then by the legacy frequency key.
 * A match updates tones, offset, status, modes, location, linked systems, and
 * coordinates when the new row has them. Name and notes are left as stored.
 * Rows that share a source key in one file collapse onto a single insert.
 */
export function planLibraryImport(
  existing: readonly SavedChannel[],
  incoming: readonly SavedChannel[],
  policy: LibraryImportPolicy,
): LibraryImportPlan {
  const bySource = new Map<string, SavedChannel>();
  const byLibrary = new Map<string, SavedChannel>();
  const originalById = new Map(existing.map((channel) => [String(channel.id), channel]));
  const pending = new Set<string>();
  const insert: SavedChannel[] = [];
  const update: SavedChannel[] = [];
  const memberIds: RadioChannelId[] = [];
  const touchedExisting: string[] = [];

  const index = (channel: SavedChannel): void => {
    if (channel.sourceKey) {
      bySource.set(channel.sourceKey, channel);
    }

    byLibrary.set(libraryImportKey(channel), channel);
  };

  const unindex = (channel: SavedChannel): void => {
    if (channel.sourceKey && bySource.get(channel.sourceKey)?.id === channel.id) {
      bySource.delete(channel.sourceKey);
    }

    const libraryKey = libraryImportKey(channel);

    if (byLibrary.get(libraryKey)?.id === channel.id) {
      byLibrary.delete(libraryKey);
    }
  };

  for (const channel of existing) {
    index(channel);
  }

  for (const model of incoming) {
    const match =
      (model.sourceKey ? bySource.get(model.sourceKey) : undefined) ?? byLibrary.get(libraryImportKey(model));

    if (!match) {
      const created = stampImportedRow(model, policy);
      insert.push(created);
      pending.add(String(created.id));
      index(created);
      memberIds.push(created.id);
      continue;
    }

    const next = mergeImportedChannel(match, model, policy);
    memberIds.push(match.id);

    if (!pending.has(String(match.id))) {
      touchedExisting.push(String(match.id));
    }

    if (importedChannelsEqual(next, match)) {
      continue;
    }

    unindex(match);
    const stored: SavedChannel = {
      ...next,
      id: match.id,
      createdAt: match.createdAt,
    };

    if (pending.has(String(match.id))) {
      const indexInInsert = insert.findIndex((row) => row.id === match.id);

      if (indexInInsert !== -1) {
        insert[indexInInsert] = stored;
      }
    } else {
      const indexInUpdate = update.findIndex((row) => row.id === match.id);

      if (indexInUpdate === -1) {
        update.push(stored);
      } else {
        update[indexInUpdate] = stored;
      }
    }

    index(stored);
  }

  const netUpdate = [...new Map(update.map((channel) => [channel.id, channel])).values()].flatMap((channel) => {
    const original = originalById.get(String(channel.id));

    if (!original) {
      return [channel];
    }

    const sameRecord = importedChannelsEqual({ ...channel, lastUpdate: original.lastUpdate }, original);

    if (sameRecord) {
      return [];
    }

    if (!policy.columns.lastUpdate) {
      return [{ ...channel, lastUpdate: policy.importedAt }];
    }

    return [channel];
  });
  const netUpdatedIds = new Set(netUpdate.map((channel) => String(channel.id)));
  let unchanged = 0;
  const seenExisting = new Set<string>();

  for (const id of touchedExisting) {
    if (seenExisting.has(id)) {
      continue;
    }

    seenExisting.add(id);

    if (!netUpdatedIds.has(id)) {
      unchanged += 1;
    }
  }

  return {
    insert,
    update: netUpdate,
    memberIds,
    added: insert.length,
    updated: netUpdate.length,
    unchanged,
  };
}

function stampImportedRow(model: SavedChannel, policy: LibraryImportPolicy): SavedChannel {
  return {
    ...model,
    lastUpdate: model.lastUpdate ?? policy.importedAt,
  };
}

function mergeImportedChannel(match: SavedChannel, model: SavedChannel, policy: LibraryImportPolicy): SavedChannel {
  const columns = policy.columns;
  const point = nextCoordinates(match, model);
  const callsignWasName =
    Boolean(model.callsign) &&
    !match.callsign &&
    match.name?.trim().toLowerCase() === model.callsign?.trim().toLowerCase();
  const nodes = mergeLinkedNodes(model, match, {
    replaceNumbers: policy.replaceLinkedNodes,
    replacePresence: policy.replaceLinkedPresence,
  });
  const next: SavedChannel = {
    ...match,
    name: callsignWasName ? undefined : match.name,
    notes: match.notes,
    callsign: model.callsign?.trim() || match.callsign,
    transmitFrequency: model.transmitFrequency,
    receiveFrequency: model.receiveFrequency,
    transmitTone: model.transmitTone,
    receiveTone: model.receiveTone,
    use: model.use ?? match.use,
    onAir: model.onAir ?? match.onAir,
    latitude: point.latitude,
    longitude: point.longitude,
    sourceKey: pickOptional(columns.sourceKey, model.sourceKey, match.sourceKey),
    sourceFormat: pickSourceFormat(columns.sourceFormat, model.sourceFormat, match.sourceFormat),
    city: pickOptional(columns.city, model.city, match.city),
    county: pickOptional(columns.county, model.county, match.county),
    state: pickOptional(columns.state, model.state, match.state),
    country: pickOptional(columns.country, model.country, match.country),
    landmark: pickOptional(columns.landmark, model.landmark, match.landmark),
    modes: pickOptional(columns.modes, model.modes, match.modes),
    ...nodes,
  };
  return {
    ...next,
    lastUpdate: columns.lastUpdate ? model.lastUpdate : match.lastUpdate,
  };
}

function nextCoordinates(
  match: SavedChannel,
  model: SavedChannel,
): { latitude?: number; longitude?: number } {
  const incoming = coordinatesFromPair(model.latitude, model.longitude);

  if (incoming.latitude !== undefined && incoming.longitude !== undefined) {
    return incoming;
  }

  return coordinatesFromPair(match.latitude, match.longitude);
}

function pickOptional(replace: boolean, incoming: string | undefined, existing: string | undefined): string | undefined {
  if (replace) {
    return incoming;
  }

  return incoming ?? existing;
}

function pickSourceFormat(
  replace: boolean,
  incoming: SavedChannelSourceFormat | undefined,
  existing: SavedChannelSourceFormat | undefined,
): SavedChannelSourceFormat | undefined {
  if (replace) {
    return incoming;
  }

  return incoming ?? existing;
}

function tonesEqual(left: RadioTone, right: RadioTone): boolean {
  return left.tone === right.tone && left.type === right.type;
}

function importedChannelsEqual(left: SavedChannel, right: SavedChannel): boolean {
  return (
    left.name === right.name &&
    left.notes === right.notes &&
    left.kind === right.kind &&
    left.callsign === right.callsign &&
    left.transmitFrequency === right.transmitFrequency &&
    left.receiveFrequency === right.receiveFrequency &&
    tonesEqual(left.transmitTone, right.transmitTone) &&
    tonesEqual(left.receiveTone, right.receiveTone) &&
    left.use === right.use &&
    left.onAir === right.onAir &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.sourceKey === right.sourceKey &&
    left.sourceFormat === right.sourceFormat &&
    left.city === right.city &&
    left.county === right.county &&
    left.state === right.state &&
    left.country === right.country &&
    left.landmark === right.landmark &&
    left.modes === right.modes &&
    left.lastUpdate === right.lastUpdate &&
    linkedNodesEqual(left, right)
  );
}
