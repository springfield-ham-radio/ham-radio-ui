import {
  adifBandFromFrequencyHz,
  createStationLogQso,
  type StationLogQso,
  type StationLogQsoInput,
} from '~/utils/station-log-db';

/** ADIF field names we map to first-class QSO columns. */
const MAPPED_TAGS = new Set([
  'CALL',
  'QSO_DATE',
  'TIME_ON',
  'TIME_OFF',
  'FREQ',
  'BAND',
  'MODE',
  'SUBMODE',
  'RST_SENT',
  'RST_RCVD',
  'NAME',
  'QTH',
  'GRIDSQUARE',
  'TX_PWR',
  'COMMENT',
  'OPERATOR',
  'STATION_CALLSIGN',
  'MY_GRIDSQUARE',
]);

const FIELD_PATTERN = /<([A-Za-z0-9_]+)(?::(\d+))(?::([A-Za-z]))?>([^<]*)/g;

export interface ParsedStationLogAdif {
  qsos: StationLogQsoInput[];
  skipped: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Format a UTC timestamp as ADIF QSO_DATE (YYYYMMDD).
 */
export function formatAdifDate(ms: number): string {
  const date = new Date(ms);

  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

/**
 * Format a UTC timestamp as ADIF TIME_ON / TIME_OFF (HHMMSS).
 */
export function formatAdifTime(ms: number): string {
  const date = new Date(ms);

  return `${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}`;
}

/**
 * Parse ADIF QSO_DATE (YYYYMMDD) plus optional TIME (HHMM or HHMMSS) into UTC ms.
 */
export function parseAdifDateTime(date: string, time?: string): number | undefined {
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(date.trim());

  if (!dateMatch) {
    return undefined;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (time) {
    const trimmed = time.trim();
    const timeMatch = /^(\d{2})(\d{2})(\d{2})?$/.exec(trimmed);

    if (!timeMatch) {
      return undefined;
    }

    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2]);
    seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
  }

  const ms = Date.UTC(year, month - 1, day, hours, minutes, seconds);

  if (Number.isNaN(ms)) {
    return undefined;
  }

  return ms;
}

/**
 * ADIF FREQ is in MHz; convert to Hz.
 */
export function parseAdifFrequencyMhz(value: string): number | undefined {
  const mhz = Number(value.trim());

  if (!Number.isFinite(mhz) || mhz <= 0) {
    return undefined;
  }

  return Math.round(mhz * 1_000_000);
}

/**
 * Format frequency Hz as ADIF FREQ (MHz string).
 */
export function formatAdifFrequencyMhz(frequencyHz: number): string {
  const mhz = frequencyHz / 1_000_000;

  if (Number.isInteger(mhz)) {
    return String(mhz);
  }

  return mhz.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function emitField(tag: string, value: string): string {
  return `<${tag}:${value.length}>${value}`;
}

function parseRecordFields(recordText: string): Map<string, string> {
  const fields = new Map<string, string>();
  FIELD_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = FIELD_PATTERN.exec(recordText)) !== null) {
    const tag = match[1]!.toUpperCase();
    const length = Number(match[2]);
    const rawValue = match[4] ?? '';
    const value = rawValue.slice(0, length);

    if (tag === 'EOR' || tag === 'EOH') {
      continue;
    }

    fields.set(tag, value);
  }

  return fields;
}

function recordToQsoInput(fields: Map<string, string>): StationLogQsoInput | undefined {
  const call = fields.get('CALL')?.trim();
  const qsoDate = fields.get('QSO_DATE')?.trim();

  if (!call || !qsoDate) {
    return undefined;
  }

  const startedAt = parseAdifDateTime(qsoDate, fields.get('TIME_ON'));

  if (startedAt === undefined) {
    return undefined;
  }

  const mode = fields.get('MODE')?.trim() || 'FM';
  const frequencyHz = fields.get('FREQ') ? parseAdifFrequencyMhz(fields.get('FREQ')!) : undefined;
  const band = fields.get('BAND')?.trim() || adifBandFromFrequencyHz(frequencyHz);
  let endedAt: number | undefined;

  if (fields.get('TIME_OFF')) {
    endedAt = parseAdifDateTime(qsoDate, fields.get('TIME_OFF'));
  }

  const txPowerRaw = fields.get('TX_PWR')?.trim();
  const txPowerWatts = txPowerRaw && Number.isFinite(Number(txPowerRaw)) ? Number(txPowerRaw) : undefined;

  const adifExtra: Record<string, string> = {};

  for (const [tag, value] of fields) {
    if (!MAPPED_TAGS.has(tag) && tag !== 'APP_HAMBENCH_ID') {
      adifExtra[tag] = value;
    }
  }

  return {
    startedAt,
    endedAt,
    theirCallsign: call,
    frequencyHz,
    band,
    mode,
    submode: fields.get('SUBMODE')?.trim(),
    rstSent: fields.get('RST_SENT')?.trim(),
    rstReceived: fields.get('RST_RCVD')?.trim(),
    theirName: fields.get('NAME')?.trim(),
    theirQth: fields.get('QTH')?.trim(),
    theirGridsquare: fields.get('GRIDSQUARE')?.trim(),
    txPowerWatts,
    comment: fields.get('COMMENT')?.trim(),
    operatorCallsign: fields.get('OPERATOR')?.trim(),
    stationCallsign: fields.get('STATION_CALLSIGN')?.trim(),
    myGridsquare: fields.get('MY_GRIDSQUARE')?.trim(),
    adifExtra: Object.keys(adifExtra).length > 0 ? adifExtra : undefined,
  };
}

/**
 * Parse an ADI (text ADIF) document into station-log QSO inputs.
 * Records missing CALL or QSO_DATE are skipped.
 */
export function parseStationLogAdif(text: string): ParsedStationLogAdif {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const body = /<EOH>/i.test(normalized) ? normalized.split(/<EOH>/i).slice(1).join('<EOH>') : normalized;
  const recordChunks = body.split(/<EOR>/i);
  const qsos: StationLogQsoInput[] = [];
  let skipped = 0;

  for (const chunk of recordChunks) {
    if (!/<[A-Za-z0-9_]+(?::\d+)/.test(chunk)) {
      continue;
    }

    const fields = parseRecordFields(chunk);
    const input = recordToQsoInput(fields);

    if (!input) {
      skipped += 1;
      continue;
    }

    qsos.push(input);
  }

  return { qsos, skipped };
}

/**
 * Serialize station-log QSOs to an ADI document with a HamBench header.
 */
export function serializeStationLogAdif(qsos: StationLogQso[]): string {
  const lines: string[] = [
    'ADIF export from HamBench',
    emitField('ADIF_VER', '3.1.4'),
    emitField('PROGRAMID', 'HamBench'),
    '<EOH>',
    '',
  ];

  for (const qso of qsos) {
    const fields: string[] = [
      emitField('CALL', qso.theirCallsign),
      emitField('QSO_DATE', formatAdifDate(qso.startedAt)),
      emitField('TIME_ON', formatAdifTime(qso.startedAt)),
    ];

    if (qso.endedAt !== undefined) {
      fields.push(emitField('TIME_OFF', formatAdifTime(qso.endedAt)));
    }

    if (qso.frequencyHz !== undefined) {
      fields.push(emitField('FREQ', formatAdifFrequencyMhz(qso.frequencyHz)));
    }

    const band = qso.band ?? adifBandFromFrequencyHz(qso.frequencyHz);

    if (band) {
      fields.push(emitField('BAND', band));
    }

    fields.push(emitField('MODE', qso.mode));

    if (qso.submode) {
      fields.push(emitField('SUBMODE', qso.submode));
    }

    if (qso.rstSent) {
      fields.push(emitField('RST_SENT', qso.rstSent));
    }

    if (qso.rstReceived) {
      fields.push(emitField('RST_RCVD', qso.rstReceived));
    }

    if (qso.theirName) {
      fields.push(emitField('NAME', qso.theirName));
    }

    if (qso.theirQth) {
      fields.push(emitField('QTH', qso.theirQth));
    }

    if (qso.theirGridsquare) {
      fields.push(emitField('GRIDSQUARE', qso.theirGridsquare));
    }

    if (qso.txPowerWatts !== undefined) {
      fields.push(emitField('TX_PWR', String(qso.txPowerWatts)));
    }

    if (qso.comment) {
      fields.push(emitField('COMMENT', qso.comment));
    }

    if (qso.operatorCallsign) {
      fields.push(emitField('OPERATOR', qso.operatorCallsign));
    }

    if (qso.stationCallsign) {
      fields.push(emitField('STATION_CALLSIGN', qso.stationCallsign));
    }

    if (qso.myGridsquare) {
      fields.push(emitField('MY_GRIDSQUARE', qso.myGridsquare));
    }

    if (qso.adifExtra) {
      for (const [tag, value] of Object.entries(qso.adifExtra)) {
        fields.push(emitField(tag.toUpperCase(), value));
      }
    }

    fields.push('<EOR>');
    lines.push(fields.join(''));
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Convert parsed ADIF inputs into persistable StationLogQso models.
 */
export function adifInputsToStationLogQsos(inputs: StationLogQsoInput[]): StationLogQso[] {
  return inputs.map((input) => createStationLogQso(input));
}
