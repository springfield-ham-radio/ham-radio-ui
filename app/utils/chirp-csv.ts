import { RadioToneType, type RadioTone } from '@springfield/ham-radio-api';
import type { SavedChannel } from '~/utils/saved-channels-db';

export const CHIRP_CSV_HEADER =
  'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment';

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function formatChirpFrequencyMHz(frequencyHz: number): string {
  return (frequencyHz / 1_000_000).toFixed(6);
}

function formatChirpCtcssHz(tone: RadioTone | undefined): string {
  if (!tone || !tone.tone || tone.type !== RadioToneType.CTCSS) {
    return '';
  }

  return (tone.tone / 10).toFixed(1);
}

function toneActive(tone: RadioTone | undefined): boolean {
  return Boolean(tone && tone.tone > 0);
}

function chirpLocation(channel: SavedChannel): string {
  const key = channel.sourceKey;

  if (channel.sourceFormat !== 'chirp' || !key?.startsWith('chirp:')) {
    return '';
  }

  const parts = key.split(':');

  if (parts.length < 3) {
    return '';
  }

  const location = parts[1]!;
  const receivePart = parts[2]!;

  return location !== receivePart ? location : '';
}

function chirpName(channel: SavedChannel): string {
  return channel.name?.trim() || channel.callsign?.trim() || '';
}

function chirpDuplexAndOffset(receiveHz: number, transmitHz: number): { duplex: string; offsetMHz: string } {
  if (receiveHz === transmitHz) {
    return { duplex: '', offsetMHz: '0.000000' };
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
  dtcsPolarity: string;
} {
  const tx = transmitTone;
  const rx = receiveTone;
  const txOn = toneActive(tx);
  const rxOn = toneActive(rx);

  if (!txOn && !rxOn) {
    return { tone: '', rToneFreq: '', cToneFreq: '', dtcsCode: '', dtcsPolarity: '' };
  }

  if ((txOn && tx!.type === RadioToneType.DCS) || (rxOn && rx!.type === RadioToneType.DCS)) {
    const code = txOn && tx!.type === RadioToneType.DCS ? tx!.tone : rx!.tone;

    return {
      tone: 'DTCS',
      rToneFreq: formatChirpCtcssHz(tx),
      cToneFreq: formatChirpCtcssHz(rx),
      dtcsCode: String(code).padStart(3, '0'),
      dtcsPolarity: 'NN',
    };
  }

  if (txOn && rxOn) {
    return {
      tone: 'TSQL',
      rToneFreq: formatChirpCtcssHz(tx),
      cToneFreq: formatChirpCtcssHz(rx),
      dtcsCode: '',
      dtcsPolarity: '',
    };
  }

  if (txOn) {
    const hz = formatChirpCtcssHz(tx);

    return {
      tone: 'Tone',
      rToneFreq: hz,
      cToneFreq: hz,
      dtcsCode: '',
      dtcsPolarity: '',
    };
  }

  return {
    tone: '',
    rToneFreq: formatChirpCtcssHz(rx),
    cToneFreq: formatChirpCtcssHz(rx),
    dtcsCode: '',
    dtcsPolarity: '',
  };
}

/**
 * Serialize library channels to a CHIRP-compatible CSV document.
 */
export function serializeSavedChannelsChirpCsv(channels: SavedChannel[]): string {
  const lines = [CHIRP_CSV_HEADER];

  for (const channel of channels) {
    const receiveHz = channel.receiveFrequency;
    const transmitHz = channel.transmitFrequency;
    const { duplex, offsetMHz } = chirpDuplexAndOffset(receiveHz, transmitHz);
    const tones = chirpToneColumns(channel.transmitTone, channel.receiveTone);

    lines.push(
      [
        escapeCsvField(chirpLocation(channel)),
        escapeCsvField(chirpName(channel)),
        formatChirpFrequencyMHz(receiveHz),
        duplex,
        offsetMHz,
        tones.tone,
        tones.rToneFreq,
        tones.cToneFreq,
        tones.dtcsCode,
        tones.dtcsPolarity,
        escapeCsvField(channel.modes?.trim() || 'FM'),
        '5.00',
        '',
        escapeCsvField(channel.notes?.trim() ?? ''),
      ].join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
