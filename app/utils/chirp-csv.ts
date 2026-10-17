import { RadioToneType, type RadioTone } from '@springfield/ham-radio-api';
import type { SavedChannel } from '~/utils/saved-channels-db';
import { bandNameForFrequency } from '~/utils/transmit-privileges';

/**
 * Columns CHIRP's generic CSV driver knows, in `Memory.CSV_FORMAT` order.
 * Power and D-STAR call columns are omitted: CHIRP fills those defaults when
 * the header leaves them out. Empty cells in a present column are not defaults.
 */
export const CHIRP_CSV_HEADER =
  'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Comment';

const DEFAULT_CTCSS_HZ = '88.5';
const DEFAULT_DTCS = '023';
const DEFAULT_POLARITY = 'NN';
const DEFAULT_CROSS = 'Tone->Tone';
const DEFAULT_TSTEP = '5.00';

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatChirpFrequencyMHz(frequencyHz: number): string {
  const sign = frequencyHz < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(frequencyHz));
  const mhz = Math.trunc(absolute / 1_000_000);
  const fraction = String(absolute % 1_000_000).padStart(6, '0');

  return `${sign}${mhz}.${fraction}`;
}

function toneActive(tone: RadioTone | undefined): boolean {
  return Boolean(tone && tone.tone > 0);
}

function ctcssHz(tone: RadioTone | undefined): string | undefined {
  if (!tone || tone.tone <= 0 || tone.type !== RadioToneType.CTCSS) {
    return undefined;
  }

  return (tone.tone / 10).toFixed(1);
}

function dtcsCode(tone: RadioTone | undefined): string | undefined {
  if (!tone || tone.tone <= 0 || tone.type !== RadioToneType.DCS) {
    return undefined;
  }

  return String(Math.trunc(tone.tone)).padStart(3, '0');
}

function preferredLocation(channel: SavedChannel): number | undefined {
  const key = channel.sourceKey;

  if (channel.sourceFormat !== 'chirp' || !key?.startsWith('chirp:')) {
    return undefined;
  }

  const parts = key.split(':');

  if (parts.length < 3) {
    return undefined;
  }

  const location = parts[1]!;
  const receivePart = parts[2]!;

  if (!/^\d+$/.test(location) || location === receivePart) {
    return undefined;
  }

  const number = Number(location);

  if (!Number.isSafeInteger(number) || number < 0 || number > 9999) {
    return undefined;
  }

  return number;
}

function assignLocations(channels: readonly SavedChannel[]): string[] {
  const preferred = channels.map(preferredLocation);
  const assigned: string[] = [];
  const taken = new Set<number>();
  let next = 1;

  for (const value of preferred) {
    if (value !== undefined && !taken.has(value)) {
      taken.add(value);
      assigned.push(String(value));
      continue;
    }

    while (taken.has(next)) {
      next += 1;
    }

    taken.add(next);
    assigned.push(String(next));
    next += 1;
  }

  return assigned;
}

function chirpName(channel: SavedChannel): string {
  return channel.name?.trim() || channel.callsign?.trim() || '';
}

function chirpMode(modes: string | undefined): 'FM' | 'NFM' {
  const tokens = (modes ?? '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0);

  if (tokens.includes('NFM') || tokens.includes('FMN') || tokens.includes('NARROW')) {
    return 'NFM';
  }

  return 'FM';
}

/**
 * CHIRP duplex:
 * blank simplex (offset ignored, written as 0),
 * + / - with a positive offset,
 * split when transmit is on another band (offset is the transmit frequency),
 * off when there is no transmit frequency.
 */
function chirpDuplexAndOffset(receiveHz: number, transmitHz: number): { duplex: string; offsetMHz: string } {
  if (transmitHz <= 0) {
    return { duplex: 'off', offsetMHz: '0.000000' };
  }

  if (receiveHz === transmitHz) {
    return { duplex: '', offsetMHz: '0.000000' };
  }

  const receiveBand = bandNameForFrequency(receiveHz);
  const transmitBand = bandNameForFrequency(transmitHz);

  if (receiveBand && transmitBand && receiveBand !== transmitBand) {
    return { duplex: 'split', offsetMHz: formatChirpFrequencyMHz(transmitHz) };
  }

  if (transmitHz > receiveHz) {
    return { duplex: '+', offsetMHz: formatChirpFrequencyMHz(transmitHz - receiveHz) };
  }

  return { duplex: '-', offsetMHz: formatChirpFrequencyMHz(receiveHz - transmitHz) };
}

function chirpToneColumns(
  transmitTone: RadioTone | undefined,
  receiveTone: RadioTone | undefined,
): {
  tone: string;
  rToneFreq: string;
  cToneFreq: string;
  dtcsCode: string;
  rxDtcsCode: string;
  dtcsPolarity: string;
  crossMode: string;
} {
  const txCtcss = ctcssHz(transmitTone);
  const rxCtcss = ctcssHz(receiveTone);
  const txDcs = dtcsCode(transmitTone);
  const rxDcs = dtcsCode(receiveTone);
  const txOn = toneActive(transmitTone);
  const rxOn = toneActive(receiveTone);

  const defaults = {
    rToneFreq: DEFAULT_CTCSS_HZ,
    cToneFreq: DEFAULT_CTCSS_HZ,
    dtcsCode: DEFAULT_DTCS,
    rxDtcsCode: DEFAULT_DTCS,
    dtcsPolarity: DEFAULT_POLARITY,
    crossMode: DEFAULT_CROSS,
  };

  if (!txOn && !rxOn) {
    return { tone: '', ...defaults };
  }

  if (txCtcss && !txDcs && !rxOn) {
    return { tone: 'Tone', ...defaults, rToneFreq: txCtcss, cToneFreq: txCtcss };
  }

  if (txCtcss && rxCtcss && !txDcs && !rxDcs) {
    return { tone: 'TSQL', ...defaults, rToneFreq: txCtcss, cToneFreq: rxCtcss };
  }

  if (txDcs && !txCtcss && !rxOn) {
    return { tone: 'DTCS', ...defaults, dtcsCode: txDcs, rxDtcsCode: txDcs };
  }

  if (txDcs && rxDcs && txDcs === rxDcs && !txCtcss && !rxCtcss) {
    return { tone: 'DTCS', ...defaults, dtcsCode: txDcs, rxDtcsCode: txDcs };
  }

  let crossMode = DEFAULT_CROSS;

  if (txCtcss && rxDcs && !txDcs) {
    crossMode = 'Tone->DTCS';
  } else if (txDcs && rxCtcss && !rxDcs) {
    crossMode = 'DTCS->Tone';
  } else if (txDcs && rxDcs) {
    crossMode = 'DTCS->DTCS';
  } else if (txCtcss && rxCtcss) {
    crossMode = 'Tone->Tone';
  } else if (txCtcss) {
    crossMode = 'Tone->';
  } else if (rxCtcss) {
    crossMode = '->Tone';
  } else if (txDcs) {
    crossMode = 'DTCS->';
  } else if (rxDcs) {
    crossMode = '->DTCS';
  }

  return {
    tone: 'Cross',
    rToneFreq: txCtcss ?? DEFAULT_CTCSS_HZ,
    cToneFreq: rxCtcss ?? DEFAULT_CTCSS_HZ,
    dtcsCode: txDcs ?? DEFAULT_DTCS,
    rxDtcsCode: rxDcs ?? DEFAULT_DTCS,
    dtcsPolarity: DEFAULT_POLARITY,
    crossMode,
  };
}

/**
 * Serialize library channels to a CHIRP generic CSV document.
 * Rows use CRLF, the line ending CHIRP's csv writer emits.
 */
export function serializeSavedChannelsChirpCsv(channels: SavedChannel[]): string {
  const locations = assignLocations(channels);
  const lines = [CHIRP_CSV_HEADER];

  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index]!;
    const receiveHz = channel.receiveFrequency;
    const transmitHz = channel.transmitFrequency;
    const { duplex, offsetMHz } = chirpDuplexAndOffset(receiveHz, transmitHz);
    const tones = chirpToneColumns(channel.transmitTone, channel.receiveTone);

    lines.push(
      [
        locations[index]!,
        escapeCsvField(chirpName(channel)),
        formatChirpFrequencyMHz(receiveHz),
        duplex,
        offsetMHz,
        tones.tone,
        tones.rToneFreq,
        tones.cToneFreq,
        tones.dtcsCode,
        tones.dtcsPolarity,
        tones.rxDtcsCode,
        tones.crossMode,
        chirpMode(channel.modes),
        DEFAULT_TSTEP,
        '',
        escapeCsvField(channel.notes?.trim() ?? ''),
      ].join(','),
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}
