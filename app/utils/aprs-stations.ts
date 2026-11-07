import type { AprsDecodedPacket, AprsPosition, AprsWeather } from '~/utils/aprs-decode';

/** Oldest stations past this count are dropped. */
export const APRS_STATION_LIMIT = 300;

/** Oldest raw lines past this count are dropped. */
export const APRS_LOG_LIMIT = 500;

export interface AprsTimed<T> {
  value: T;
  heardAt: string;
}

export interface AprsStation {
  callsign: string;
  packetCount: number;
  lastHeardAt: string;
  position?: AprsTimed<AprsPosition>;
  comment?: AprsTimed<string>;
  message?: AprsTimed<{ addressee: string; text: string; kind: 'text' | 'ack' | 'rej' }>;
  weather?: AprsTimed<AprsWeather>;
  courseDegrees?: AprsTimed<number>;
  speedKnots?: AprsTimed<number>;
  altitude?: AprsTimed<string>;
  statusText?: AprsTimed<string>;
  positionComment?: AprsTimed<string>;
  reportedName?: AprsTimed<string>;
  reportedPosition?: AprsTimed<AprsPosition>;
  lastPacket: AprsDecodedPacket;
}

export interface AprsLogLine {
  id: number;
  receivedAt: string;
  text: string;
  disposition: 'decoded' | 'unsupported' | 'unparsed' | 'nmea';
  note?: string;
}

export interface AprsFoldState {
  stations: AprsStation[];
  log: AprsLogLine[];
  nextLogId: number;
}

export function createAprsFoldState(): AprsFoldState {
  return { stations: [], log: [], nextLogId: 1 };
}

/**
 * Fold one finished line into the station list and the raw log.
 *
 * A later packet replaces only the fields it actually carries. A message
 * keeps the earlier position. An object position is stored separately and
 * does not replace the transmitting station's position.
 */
export function foldAprsLine(state: AprsFoldState, text: string, packet: AprsDecodedPacket, receivedAt: string): void {
  state.log.push({
    id: state.nextLogId,
    receivedAt,
    text,
    disposition: logDisposition(packet),
    note: packet.unsupportedReason,
  });
  state.nextLogId += 1;

  if (state.log.length > APRS_LOG_LIMIT) {
    state.log.splice(0, state.log.length - APRS_LOG_LIMIT);
  }

  if (!packet.source) {
    return;
  }

  const existing = state.stations.find((station) => station.callsign === packet.source);
  const station: AprsStation = existing ?? {
    callsign: packet.source,
    packetCount: 0,
    lastHeardAt: receivedAt,
    lastPacket: packet,
  };

  station.packetCount += 1;
  station.lastHeardAt = receivedAt;
  station.lastPacket = packet;
  replaceField(station, 'comment', packet.comment, receivedAt);
  replaceField(station, 'positionComment', packet.positionComment, receivedAt);
  replaceField(station, 'courseDegrees', packet.courseDegrees, receivedAt);
  replaceField(station, 'speedKnots', packet.speedKnots, receivedAt);
  replaceField(station, 'altitude', packet.altitude, receivedAt);
  replaceField(station, 'statusText', packet.statusText, receivedAt);
  replaceField(station, 'reportedName', packet.reportedName, receivedAt);

  if (packet.position) {
    station.position = { value: packet.position, heardAt: receivedAt };
  }

  if (packet.reportedPosition) {
    station.reportedPosition = { value: packet.reportedPosition, heardAt: receivedAt };
  }

  if (packet.weather) {
    station.weather = { value: packet.weather, heardAt: receivedAt };
  }

  if (packet.messageAddressee !== undefined && packet.messageText !== undefined && packet.messageKind) {
    station.message = {
      value: { addressee: packet.messageAddressee, text: packet.messageText, kind: packet.messageKind },
      heardAt: receivedAt,
    };
  }

  if (!existing) {
    state.stations.push(station);
  }

  state.stations.sort((left, right) => right.lastHeardAt.localeCompare(left.lastHeardAt) || left.callsign.localeCompare(right.callsign));

  if (state.stations.length > APRS_STATION_LIMIT) {
    state.stations.length = APRS_STATION_LIMIT;
  }
}

function replaceField<K extends 'comment' | 'positionComment' | 'courseDegrees' | 'speedKnots' | 'altitude' | 'statusText' | 'reportedName'>(
  station: AprsStation,
  key: K,
  value: AprsStation[K] extends AprsTimed<infer V> | undefined ? V : never,
  heardAt: string,
): void {
  if (value === undefined) {
    return;
  }

  station[key] = { value, heardAt } as AprsStation[K];
}

function logDisposition(packet: AprsDecodedPacket): AprsLogLine['disposition'] {
  if (packet.kind === 'unparsed') {
    return 'unparsed';
  }

  if (packet.kind === 'nmea') {
    return 'nmea';
  }

  if (packet.kind === 'unsupported' || packet.unsupportedReason) {
    return 'unsupported';
  }

  return 'decoded';
}
