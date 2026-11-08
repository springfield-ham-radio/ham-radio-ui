import { formatAx25Call, type Ax25UiFrame } from '~/utils/aprs-ax25';

/**
 * Decode TNC2 monitor lines and APRS information fields.
 *
 * Positions, course, speed, altitude, messages, and weather are filled only
 * from fields the packet actually contains. Unknown data types stay on the
 * raw line with an explicit unsupported reason.
 *
 * Mic-E latitude flags follow APRS Protocol Reference 1.0.1 chapter 10:
 * destination character 4 selects N/S, character 5 the +100° longitude offset,
 * and character 6 E/W. Course 0 on Mic-E means unknown and is omitted.
 */

export type AprsPacketKind =
  | 'position'
  | 'mic-e'
  | 'message'
  | 'status'
  | 'object'
  | 'item'
  | 'weather'
  | 'unsupported'
  | 'unparsed'
  | 'nmea';

export interface AprsPosition {
  latitude: number;
  longitude: number;
  /** Degrees and decimal minutes, with hemisphere. */
  label: string;
  symbolTable: string;
  symbolCode: string;
}

export interface AprsWeather {
  windDirectionDegrees?: number;
  windSpeedMph?: number;
  gustMph?: number;
  temperatureFahrenheit?: number;
  rainLastHourInches?: number;
  rainLast24HoursInches?: number;
  rainSinceMidnightInches?: number;
  humidityPercent?: number;
  pressureHpa?: number;
}

export interface AprsDecodedPacket {
  kind: AprsPacketKind;
  /** AX.25 source, including SSID when present. */
  source?: string;
  destination?: string;
  path: string[];
  raw: string;
  comment?: string;
  position?: AprsPosition;
  /** Object or item position, which is not the transmitting station. */
  reportedName?: string;
  reportedPosition?: AprsPosition;
  reportedActive?: boolean;
  messageAddressee?: string;
  messageText?: string;
  messageKind?: 'text' | 'ack' | 'rej';
  statusText?: string;
  packetTime?: string;
  courseDegrees?: number;
  speedKnots?: number;
  /** Already labeled with the unit carried in the packet. */
  altitude?: string;
  weather?: AprsWeather;
  /** Mic-E standard/custom position comment, when the destination encodes one. */
  positionComment?: string;
  unsupportedReason?: string;
}

const CALL = String.raw`[A-Za-z0-9]{1,6}(?:-\d{1,2})?`;
const PATH_HOP = String.raw`[A-Za-z0-9]{1,6}(?:-\d{1,2})?\*?`;
const MONITOR_LINE = new RegExp(`^(${CALL})>(${CALL})((?:,${PATH_HOP})*)(?::([\\s\\S]*))?$`);

export function decodeAprsMonitorLine(line: string): AprsDecodedPacket {
  const trimmed = line.replace(/[ \t]+$/u, '');

  if (trimmed.startsWith('$')) {
    return { kind: 'nmea', path: [], raw: line, unsupportedReason: 'NMEA sentence, not an APRS packet' };
  }

  if (/^cmd:/i.test(trimmed)) {
    return { kind: 'unparsed', path: [], raw: line, unsupportedReason: 'TNC command prompt' };
  }

  const match = MONITOR_LINE.exec(trimmed);

  if (!match) {
    return { kind: 'unparsed', path: [], raw: line, unsupportedReason: 'Not a TNC2 monitor line' };
  }

  const source = normalizeCall(match[1] ?? '');
  const destination = normalizeCall(match[2] ?? '');
  const path = (match[3] ?? '')
    .split(',')
    .filter((hop) => hop.length > 0)
    .map((hop) => hop.toUpperCase());
  const info = match[4];

  if (source === undefined || destination === undefined) {
    return { kind: 'unparsed', path: [], raw: line, unsupportedReason: 'Callsign or SSID is outside AX.25 limits' };
  }

  if (info === undefined) {
    return {
      kind: 'unparsed',
      source,
      destination,
      path,
      raw: line,
      unsupportedReason: 'TNC2 header without an information field',
    };
  }

  const decoded = decodeAprsInfo(destination, info);

  return {
    ...decoded,
    source,
    destination,
    path,
    raw: line,
  };
}

/**
 * Decode one parsed AX.25 UI frame with the same information-field rules as a TNC2 line.
 *
 * Source, destination, and path come from the address fields. A digipeater H bit
 * is the trailing star. No position is invented when the information field is not one.
 */
export function decodeAx25UiAprs(frame: Ax25UiFrame): AprsDecodedPacket {
  const source = formatAx25Call(frame.source);
  const destination = formatAx25Call(frame.destination);
  const path = frame.path.map((hop) => `${formatAx25Call(hop)}${hop.repeated ? '*' : ''}`);
  const via = path.length > 0 ? `,${path.join(',')}` : '';
  const decoded = decodeAprsInfo(destination, frame.info);

  return {
    ...decoded,
    source,
    destination,
    path,
    raw: `${source}>${destination}${via}:${frame.info}`,
  };
}

export function decodeAprsInfo(destination: string, info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  if (info.length === 0) {
    return { kind: 'unsupported', unsupportedReason: 'Empty information field' };
  }

  const type = info[0] ?? '';

  if (type === '`' || type === "'" || type === '\u001c' || type === '\u001d') {
    return decodeMicE(destination, info);
  }

  if (type === '!' || type === '=' || type === '/' || type === '@') {
    return decodePositionReport(info);
  }

  if (type === ':') {
    return decodeMessage(info);
  }

  if (type === ';') {
    return decodeObject(info);
  }

  if (type === ')') {
    return decodeItem(info);
  }

  if (type === '>') {
    return decodeStatus(info);
  }

  if (type === '_') {
    const weather = parseWeather(info.slice(1));
    if (!weather) {
      return { kind: 'unsupported', unsupportedReason: 'Weather report did not include a decoded field' };
    }

    return { kind: 'weather', weather };
  }

  if (type === 'T') {
    return { kind: 'unsupported', unsupportedReason: 'Telemetry is not decoded' };
  }

  if (type === '?') {
    return { kind: 'unsupported', unsupportedReason: 'APRS query is not decoded' };
  }

  if (type === '}') {
    return { kind: 'unsupported', unsupportedReason: 'Third-party packet is not decoded' };
  }

  if (type === '{') {
    return { kind: 'unsupported', unsupportedReason: 'User-defined data is not decoded' };
  }

  if (type === '<') {
    return { kind: 'unsupported', unsupportedReason: 'Station capabilities are not decoded' };
  }

  if (type === '$') {
    return { kind: 'nmea', unsupportedReason: 'Raw GPS sentence inside an APRS frame' };
  }

  return { kind: 'unsupported', unsupportedReason: `Unsupported APRS data type ${printableType(type)}` };
}

function decodePositionReport(info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  let rest = info.slice(1);
  let packetTime: string | undefined;

  if (info[0] === '/' || info[0] === '@') {
    const stamped = takeTimestamp(rest);

    if (!stamped) {
      return { kind: 'unsupported', unsupportedReason: 'Position timestamp is missing or malformed' };
    }

    packetTime = stamped.label;
    rest = stamped.rest;
  }

  if (rest.startsWith('/')) {
    const compressed = parseCompressedPosition(rest);

    if (!compressed) {
      return { kind: 'unsupported', packetTime, unsupportedReason: 'Compressed position is malformed' };
    }

    return {
      kind: 'position',
      packetTime,
      position: compressed.position,
      courseDegrees: compressed.courseDegrees,
      speedKnots: compressed.speedKnots,
      altitude: compressed.altitude,
      comment: emptyToUndefined(compressed.comment),
    };
  }

  const uncompressed = parseUncompressedPosition(rest);

  if (!uncompressed) {
    return { kind: 'unsupported', packetTime, unsupportedReason: 'Uncompressed position is malformed or ambiguous' };
  }

  return {
    kind: 'position',
    packetTime,
    position: uncompressed.position,
    courseDegrees: uncompressed.courseDegrees,
    speedKnots: uncompressed.speedKnots,
    altitude: uncompressed.altitude,
    weather: uncompressed.weather,
    comment: emptyToUndefined(uncompressed.comment),
  };
}

function decodeMicE(destination: string, info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  if (info.length < 9) {
    return { kind: 'unsupported', unsupportedReason: 'Mic-E information field is shorter than 9 bytes' };
  }

  const call = destination.split('-')[0] ?? '';

  if (call.length !== 6) {
    return { kind: 'unsupported', unsupportedReason: 'Mic-E destination is not 6 characters' };
  }

  if (/[KLZ]/u.test(call)) {
    return { kind: 'unsupported', unsupportedReason: 'Mic-E position ambiguity is not expanded' };
  }

  const latitude = decodeMicELatitude(call);

  if (!latitude) {
    return { kind: 'unsupported', unsupportedReason: 'Mic-E destination is not a latitude' };
  }

  const degreesRaw = info.charCodeAt(1) - 28;
  const minutesRaw = info.charCodeAt(2) - 28;
  const hundredths = info.charCodeAt(3) - 28;
  let degrees = degreesRaw + (latitude.longitudeOffset ? 100 : 0);

  if (degrees >= 180 && degrees <= 189) {
    degrees -= 80;
  } else if (degrees >= 190 && degrees <= 199) {
    degrees -= 190;
  }

  const minutes = minutesRaw >= 60 ? minutesRaw - 60 : minutesRaw;

  if (degrees < 0 || degrees > 180 || minutes < 0 || minutes > 59 || hundredths < 0 || hundredths > 99) {
    return { kind: 'unsupported', unsupportedReason: 'Mic-E longitude is outside the valid range' };
  }

  let longitude = degrees + (minutes + hundredths / 100) / 60;

  if (latitude.west) {
    longitude = -longitude;
  }

  const speedTens = info.charCodeAt(4) - 28;
  const courseMixed = info.charCodeAt(5) - 28;
  const courseUnits = info.charCodeAt(6) - 28;
  let speedKnots = speedTens * 10 + Math.floor(courseMixed / 10);
  let courseDegrees = (courseMixed % 10) * 100 + courseUnits;

  if (speedKnots >= 800) {
    speedKnots -= 800;
  }

  if (courseDegrees >= 400) {
    courseDegrees -= 400;
  }

  const symbolCode = info[7] ?? '';
  const symbolTable = info[8] ?? '';
  const tail = decodeMicETail(info.slice(9));

  return {
    kind: 'mic-e',
    position: {
      latitude: latitude.degrees,
      longitude,
      label: formatCoordinatePair(latitude.degrees, longitude),
      symbolTable,
      symbolCode,
    },
    comment: emptyToUndefined(tail.comment),
    altitude: tail.altitude,
    courseDegrees: courseDegrees === 0 ? undefined : courseDegrees,
    speedKnots,
    positionComment: latitude.comment,
  };
}

function decodeMicELatitude(call: string): { degrees: number; west: boolean; longitudeOffset: boolean; comment?: string } | undefined {
  const digits: number[] = [];
  const bits: number[] = [];
  const sets: Array<'standard' | 'custom' | 'zero'> = [];

  for (let index = 0; index < 6; index += 1) {
    const char = call[index] ?? '';
    const code = char.charCodeAt(0);
    let digit = 0;
    let bit = 0;
    let set: 'standard' | 'custom' | 'zero' = 'zero';

    if (code >= 48 && code <= 57) {
      digit = code - 48;
      bit = 0;
      set = 'zero';
    } else if (code >= 65 && code <= 74) {
      digit = code - 65;
      bit = 1;
      set = 'custom';
    } else if (char === 'K') {
      digit = 0;
      bit = 1;
      set = 'custom';
    } else if (char === 'L') {
      digit = 0;
      bit = 0;
      set = 'zero';
    } else if (code >= 80 && code <= 89) {
      digit = code - 80;
      bit = 1;
      set = 'standard';
    } else if (char === 'Z') {
      digit = 0;
      bit = 1;
      set = 'standard';
    } else {
      return undefined;
    }

    if (index >= 3 && (char === 'K' || (code >= 65 && code <= 74))) {
      return undefined;
    }

    digits.push(digit);
    bits.push(bit);
    sets.push(set);
  }

  const latitudeMagnitude = (digits[0] ?? 0) * 10 + (digits[1] ?? 0) + (((digits[2] ?? 0) * 10 + (digits[3] ?? 0)) + ((digits[4] ?? 0) * 10 + (digits[5] ?? 0)) / 100) / 60;
  const north = (bits[3] ?? 0) === 1;
  const messageBits = sets.slice(0, 3);
  const standard = messageBits.some((set) => set === 'standard');
  const custom = messageBits.some((set) => set === 'custom');
  let comment: string | undefined;

  if (standard && custom) {
    comment = 'Mic-E message bits mix standard and custom sets';
  } else {
    comment = micEMessageLabel((bits[0] ?? 0) * 4 + (bits[1] ?? 0) * 2 + (bits[2] ?? 0), standard);
  }

  return {
    degrees: north ? latitudeMagnitude : -latitudeMagnitude,
    west: (bits[5] ?? 0) === 1,
    longitudeOffset: (bits[4] ?? 0) === 1,
    comment,
  };
}

function micEMessageLabel(value: number, standard: boolean): string {
  const standardNames = ['Emergency', 'M6: Priority', 'M5: Special', 'M4: Committed', 'M3: Returning', 'M2: In Service', 'M1: En Route', 'M0: Off Duty'];
  const customNames = ['Emergency', 'C6: Custom-6', 'C5: Custom-5', 'C4: Custom-4', 'C3: Custom-3', 'C2: Custom-2', 'C1: Custom-1', 'C0: Custom-0'];
  const names = standard || value === 0 ? standardNames : customNames;
  return names[value] ?? 'Mic-E message';
}

function decodeMicETail(tail: string): { comment?: string; altitude?: string } {
  let comment = tail;
  const device = comment[0];

  if (device === '>' || device === ']' || device === '`' || device === "'") {
    comment = comment.slice(1);
  }

  if (comment.length >= 4 && comment[3] === '}' && isBase91(comment.slice(0, 3))) {
    const meters = base91(comment.slice(0, 3)) - 10_000;
    return {
      altitude: formatMeters(meters),
      comment: emptyToUndefined(comment.slice(4)),
    };
  }

  return { comment: emptyToUndefined(tail) };
}

interface ParsedPositionBody {
  position: AprsPosition;
  courseDegrees?: number;
  speedKnots?: number;
  altitude?: string;
  comment?: string;
  weather?: AprsWeather;
}

function parseUncompressedPosition(body: string): ParsedPositionBody | undefined {
  const match = /^(\d{2})(\d{2})\.(\d{2})([NS])([\x21-\x7e])(\d{3})(\d{2})\.(\d{2})([EW])([\x21-\x7e])([\s\S]*)$/u.exec(body);

  if (!match) {
    return undefined;
  }

  const latitude = coordinate(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    match[4] === 'S',
  );
  const longitude = coordinate(
    Number(match[6]),
    Number(match[7]),
    Number(match[8]),
    match[9] === 'W',
    180,
  );

  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }

  const symbolTable = match[5] ?? '/';
  const symbolCode = match[10] ?? '/';
  let rest = match[11] ?? '';
  let courseDegrees: number | undefined;
  let speedKnots: number | undefined;
  const course = /^(\d{3})\/(\d{3})([\s\S]*)$/u.exec(rest);

  if (course) {
    courseDegrees = Number(course[1]);
    speedKnots = Number(course[2]);
    rest = course[3] ?? '';

    if (courseDegrees > 360 || speedKnots > 999) {
      courseDegrees = undefined;
      speedKnots = undefined;
      rest = match[11] ?? '';
    }
  }

  const altitude = takeAltitudeFeet(rest);
  rest = altitude.rest;
  const weather = symbolCode === '_' ? parseWeather(rest) : undefined;

  if (weather) {
    rest = '';
  }

  return {
    position: {
      latitude,
      longitude,
      label: formatCoordinatePair(latitude, longitude),
      symbolTable,
      symbolCode,
    },
    courseDegrees,
    speedKnots,
    altitude: altitude.label,
    comment: emptyToUndefined(rest),
    weather,
  };
}

function parseCompressedPosition(body: string): ParsedPositionBody | undefined {
  if (body.length < 13 || !isBase91(body.slice(1, 9))) {
    return undefined;
  }

  const latitude = 90 - base91(body.slice(1, 5)) / 380926;
  const longitude = -180 + base91(body.slice(5, 9)) / 190463;
  const symbolTable = body[0] ?? '/';
  const symbolCode = body[9] ?? '/';
  const courseByte = body.charCodeAt(10) - 33;
  const speedByte = body.charCodeAt(11) - 33;
  const typeByte = body.charCodeAt(12);
  let courseDegrees: number | undefined;
  let speedKnots: number | undefined;
  let altitude: string | undefined;

  if (body[10] !== ' ' && courseByte >= 0 && speedByte >= 0) {
    if ((typeByte & 0x18) === 0x10) {
      altitude = formatFeet(Math.pow(1.002, courseByte * 91 + speedByte));
    } else if (body[10] !== '{') {
      courseDegrees = courseByte * 4;
      speedKnots = Math.pow(1.08, speedByte) - 1;
    }
  }

  return {
    position: {
      latitude,
      longitude,
      label: formatCoordinatePair(latitude, longitude),
      symbolTable,
      symbolCode,
    },
    courseDegrees,
    speedKnots,
    altitude,
    comment: emptyToUndefined(body.slice(13)),
  };
}

function decodeMessage(info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  const match = /^:([^:]{9}):([\s\S]*)$/u.exec(info);

  if (!match) {
    return { kind: 'unsupported', unsupportedReason: 'Message address is malformed' };
  }

  const addressee = (match[1] ?? '').trim();
  const body = match[2] ?? '';
  const ack = /^ack([A-Za-z0-9}]{1,5})$/u.exec(body);
  const rej = /^rej([A-Za-z0-9}]{1,5})$/u.exec(body);

  if (addressee.length === 0) {
    return { kind: 'unsupported', unsupportedReason: 'Message has no addressee' };
  }

  if (ack) {
    return { kind: 'message', messageAddressee: addressee, messageText: ack[1], messageKind: 'ack' };
  }

  if (rej) {
    return { kind: 'message', messageAddressee: addressee, messageText: rej[1], messageKind: 'rej' };
  }

  const text = body.replace(/\{[A-Za-z0-9]{1,5}$/u, '');
  return { kind: 'message', messageAddressee: addressee, messageText: text, messageKind: 'text' };
}

function decodeObject(info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  if (info.length < 18) {
    return { kind: 'unsupported', unsupportedReason: 'Object report is too short' };
  }

  const name = info.slice(1, 10).trim();
  const alive = info[10];

  if ((alive !== '*' && alive !== '_') || name.length === 0) {
    return { kind: 'unsupported', unsupportedReason: 'Object name or live flag is malformed' };
  }

  const stamped = takeTimestamp(info.slice(11));

  if (!stamped) {
    return { kind: 'unsupported', unsupportedReason: 'Object timestamp is malformed' };
  }

  const position = stamped.rest.startsWith('/') ? parseCompressedPosition(stamped.rest) : parseUncompressedPosition(stamped.rest);

  if (!position) {
    return { kind: 'unsupported', packetTime: stamped.label, unsupportedReason: 'Object position is malformed' };
  }

  return {
    kind: 'object',
    reportedName: name,
    reportedActive: alive === '*',
    reportedPosition: position.position,
    packetTime: stamped.label,
    comment: position.comment,
    courseDegrees: position.courseDegrees,
    speedKnots: position.speedKnots,
    altitude: position.altitude,
  };
}

function decodeItem(info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  const match = /^\)([^!_]{3,9})([!_])([\s\S]+)$/u.exec(info);

  if (!match) {
    return { kind: 'unsupported', unsupportedReason: 'Item report is malformed' };
  }

  const position = (match[3] ?? '').startsWith('/') ? parseCompressedPosition(match[3] ?? '') : parseUncompressedPosition(match[3] ?? '');

  if (!position) {
    return { kind: 'unsupported', unsupportedReason: 'Item position is malformed' };
  }

  return {
    kind: 'item',
    reportedName: (match[1] ?? '').trim(),
    reportedActive: match[2] === '!',
    reportedPosition: position.position,
    comment: position.comment,
    altitude: position.altitude,
  };
}

function decodeStatus(info: string): Omit<AprsDecodedPacket, 'source' | 'destination' | 'path' | 'raw'> {
  const stamped = takeTimestamp(info.slice(1));

  if (stamped) {
    return { kind: 'status', packetTime: stamped.label, statusText: stamped.rest };
  }

  return { kind: 'status', statusText: info.slice(1) };
}

function parseWeather(body: string): AprsWeather | undefined {
  const weather: AprsWeather = {};
  const wind = /c(\d{3})/u.exec(body);
  const speed = /s(\d{3})/u.exec(body);
  const gust = /g(\d{3})/u.exec(body);
  const temperature = /t(\d{3}|-\d{2})/u.exec(body);
  const rainHour = /r(\d{3})/u.exec(body);
  const rainDay = /p(\d{3})/u.exec(body);
  const rainMidnight = /P(\d{3})/u.exec(body);
  const humidity = /h(\d{2})/u.exec(body);
  const pressure = /b(\d{5})/u.exec(body);

  if (wind) {
    weather.windDirectionDegrees = Number(wind[1]);
  }

  if (speed) {
    weather.windSpeedMph = Number(speed[1]);
  }

  if (gust) {
    weather.gustMph = Number(gust[1]);
  }

  if (temperature) {
    weather.temperatureFahrenheit = Number(temperature[1]);
  }

  if (rainHour) {
    weather.rainLastHourInches = Number(rainHour[1]) / 100;
  }

  if (rainDay) {
    weather.rainLast24HoursInches = Number(rainDay[1]) / 100;
  }

  if (rainMidnight) {
    weather.rainSinceMidnightInches = Number(rainMidnight[1]) / 100;
  }

  if (humidity) {
    const value = Number(humidity[1]);
    weather.humidityPercent = value === 0 ? 100 : value;
  }

  if (pressure) {
    weather.pressureHpa = Number(pressure[1]) / 10;
  }

  return Object.keys(weather).length > 0 ? weather : undefined;
}

function takeTimestamp(body: string): { label: string; rest: string } | undefined {
  const day = /^(\d{2})(\d{2})(\d{2})([zh/])([\s\S]*)$/u.exec(body);

  if (day) {
    const zone = day[4] === 'h' || day[4] === 'z' ? 'UTC' : 'local';
    return {
      label: `day ${day[1]} ${day[2]}:${day[3]} ${zone}`,
      rest: day[5] ?? '',
    };
  }

  const clock = /^(\d{2})(\d{2})(\d{2})h([\s\S]*)$/u.exec(body);

  if (clock) {
    return {
      label: `${clock[1]}:${clock[2]}:${clock[3]} UTC`,
      rest: clock[4] ?? '',
    };
  }

  return undefined;
}

function takeAltitudeFeet(comment: string): { label?: string; rest: string } {
  const match = /\/A=(\d{6})/u.exec(comment);

  if (!match || match[1] === undefined) {
    return { rest: comment };
  }

  return {
    label: formatFeet(Number(match[1])),
    rest: `${comment.slice(0, match.index)}${comment.slice(match.index + match[0].length)}`.trim(),
  };
}

function coordinate(degrees: number, minutes: number, hundredths: number, negative: boolean, maxDegrees = 90): number | undefined {
  if (degrees > maxDegrees || minutes > 59 || hundredths > 99) {
    return undefined;
  }

  const value = degrees + (minutes + hundredths / 100) / 60;
  return negative ? -value : value;
}

function formatCoordinatePair(latitude: number, longitude: number): string {
  return `${formatAxis(latitude, 'N', 'S')} ${formatAxis(longitude, 'E', 'W')}`;
}

function formatAxis(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute + 1e-9);
  const minutes = (absolute - degrees) * 60;
  const minuteText = minutes.toFixed(2).padStart(5, '0');
  return `${degrees}° ${minuteText}′ ${hemisphere}`;
}

function formatFeet(feet: number): string {
  return `${Math.round(feet).toLocaleString('en-US')} ft`;
}

function formatMeters(meters: number): string {
  return `${Math.round(meters).toLocaleString('en-US')} m`;
}

function base91(text: string): number {
  let value = 0;

  for (const char of text) {
    value = value * 91 + (char.charCodeAt(0) - 33);
  }

  return value;
}

function isBase91(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  for (const char of text) {
    const digit = char.charCodeAt(0) - 33;

    if (digit < 0 || digit > 90) {
      return false;
    }
  }

  return true;
}

function normalizeCall(call: string): string | undefined {
  const [name, ssidText] = call.toUpperCase().split('-');

  if (!name || name.length < 1 || name.length > 6) {
    return undefined;
  }

  if (ssidText === undefined) {
    return name;
  }

  const ssid = Number(ssidText);

  if (!Number.isInteger(ssid) || ssid < 0 || ssid > 15) {
    return undefined;
  }

  return ssid === 0 ? name : `${name}-${ssid}`;
}

function printableType(type: string): string {
  const code = type.charCodeAt(0);
  return code >= 32 && code <= 126 ? `'${type}'` : `0x${code.toString(16).padStart(2, '0')}`;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
