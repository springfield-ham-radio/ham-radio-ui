import { adifBandFromFrequencyHz, type StationLogQso } from '~/utils/station-log-db';

export interface StationLogBreakdownRow {
  label: string;
  count: number;
}

export interface StationLogSummary {
  qsoCount: number;
  uniqueCalls: number;
  potaCount: number;
  qrzCount: number;
  bands: StationLogBreakdownRow[];
  modes: StationLogBreakdownRow[];
}

const EMPTY_LABEL = '—';

function extraValue(qso: StationLogQso, tag: string): string | undefined {
  const value = qso.adifExtra?.[tag]?.trim();

  if (!value) {
    return undefined;
  }

  return value;
}

function pushUnique(values: string[], value: string | undefined): void {
  if (!value) {
    return;
  }

  const normalized = value.toUpperCase();

  if (!values.includes(normalized)) {
    values.push(normalized);
  }
}

/**
 * Park reference for a POTA contact.
 * Hunter refs use SIG=POTA and SIG_INFO. Activator refs use MY_SIG=POTA and MY_SIG_INFO.
 * POTA_REF and MY_POTA_REF are included when an export stores them directly.
 */
export function stationLogPotaRef(qso: StationLogQso): string | undefined {
  const refs: string[] = [];

  if (extraValue(qso, 'SIG')?.toUpperCase() === 'POTA') {
    pushUnique(refs, extraValue(qso, 'SIG_INFO'));
  }

  if (extraValue(qso, 'MY_SIG')?.toUpperCase() === 'POTA') {
    pushUnique(refs, extraValue(qso, 'MY_SIG_INFO'));
  }

  pushUnique(refs, extraValue(qso, 'POTA_REF'));
  pushUnique(refs, extraValue(qso, 'MY_POTA_REF'));

  if (refs.length === 0) {
    return undefined;
  }

  return refs.join(' ');
}

/**
 * QRZ.com upload status from ADIF QRZCOM_QSO_UPLOAD_STATUS, when it is Y or M.
 */
export function stationLogQrzStatus(qso: StationLogQso): 'Y' | 'M' | undefined {
  const status = extraValue(qso, 'QRZCOM_QSO_UPLOAD_STATUS')?.toUpperCase();

  if (status === 'Y' || status === 'M') {
    return status;
  }

  return undefined;
}

/**
 * Band token for the table and the summary, uppercased (40M, 70CM).
 * Falls back to the band implied by frequency.
 */
export function stationLogBandLabel(qso: Pick<StationLogQso, 'band' | 'frequencyHz'>): string {
  const band = qso.band?.trim() || adifBandFromFrequencyHz(qso.frequencyHz);

  if (!band) {
    return EMPTY_LABEL;
  }

  return band.toUpperCase();
}

/**
 * Mode token for the summary, uppercased. Submode stays off this label so SSB
 * contacts group together.
 */
export function stationLogModeLabel(qso: Pick<StationLogQso, 'mode'>): string {
  const mode = qso.mode.trim();

  if (!mode) {
    return EMPTY_LABEL;
  }

  return mode.toUpperCase();
}

/**
 * Local date and time as YYYY-MM-DD HH:mm in the given IANA timezone.
 * Omit the timezone to use the computer's local zone.
 */
export function formatStationLogLocalTime(ms: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
}

function breakdown(counts: Map<string, number>): StationLogBreakdownRow[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

/**
 * Totals for the contacts currently listed. Search filtering happens before this runs.
 */
export function summarizeStationLog(qsos: readonly StationLogQso[]): StationLogSummary {
  const calls = new Set<string>();
  const bands = new Map<string, number>();
  const modes = new Map<string, number>();
  let potaCount = 0;
  let qrzCount = 0;

  for (const qso of qsos) {
    calls.add(qso.theirCallsign.trim().toUpperCase());

    if (stationLogPotaRef(qso)) {
      potaCount += 1;
    }

    if (stationLogQrzStatus(qso)) {
      qrzCount += 1;
    }

    const band = stationLogBandLabel(qso);
    bands.set(band, (bands.get(band) ?? 0) + 1);

    const mode = stationLogModeLabel(qso);
    modes.set(mode, (modes.get(mode) ?? 0) + 1);
  }

  return {
    qsoCount: qsos.length,
    uniqueCalls: calls.size,
    potaCount,
    qrzCount,
    bands: breakdown(bands),
    modes: breakdown(modes),
  };
}
