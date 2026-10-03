/**
 * Optional automatic backups of raw radio memory images.
 *
 * Files live in the desktop app data directory as
 * `backups/<vendor>_<model>_<YYYYMMDD-HHMMSS>_<read|prewrite>.img`.
 * Turning backups off skips file creation entirely.
 */

export const RADIO_IMAGE_BACKUP_SETTINGS_KEY = 'ham-radio-image-backups';

/** CHIRP keeps image backups for a year. Match that unless the operator chooses otherwise. */
export const DEFAULT_BACKUP_MAX_AGE_DAYS = 365;

/** Extra cap so a radio that is read often cannot fill the disk. 0 means no count limit. */
export const DEFAULT_BACKUP_MAX_COUNT = 200;

const MAX_BACKUP_AGE_DAYS = 3650;
const MAX_BACKUP_COUNT = 10_000;
const MS_PER_DAY = 86_400_000;

export type RadioImageBackupKind = 'read' | 'prewrite';

export interface RadioImageBackupSettings {
  /** When false, reads and writes do not create backup files. */
  enabled: boolean;
  /**
   * Delete backups older than this many whole days.
   * 0 keeps backups regardless of age.
   */
  maxAgeDays: number;
  /**
   * After age pruning, keep at most this many files, including the one just saved.
   * 0 means no count limit.
   */
  maxCount: number;
}

export interface RadioImageBackupIdentity {
  manufacturer: string;
  model: string;
}

export interface RadioImageBackupListing {
  fileName: string;
  modifiedAtMs: number;
}

export interface ParsedRadioImageBackupName {
  fileName: string;
  manufacturer: string;
  model: string;
  /** Local timestamp `YYYYMMDD-HHMMSS`, plus `-N` when two backups share a second. */
  timestamp: string;
  kind: RadioImageBackupKind;
}

export interface RadioImageBackupPlan {
  fileName: string;
  pruneFileNames: string[];
}

export interface RadioImageBackupStore {
  list(): Promise<RadioImageBackupListing[]>;
  save(fileName: string, image: Uint8Array): Promise<void>;
  remove(fileNames: string[]): Promise<void>;
}

export type RadioImageBackupCapture =
  | { status: 'skipped' }
  | { status: 'saved'; fileName: string; prunedFileNames: string[] }
  | { status: 'failed'; message: string };

const BACKUP_FILE_NAME =
  /^([A-Za-z0-9.+-]+)_([A-Za-z0-9.+-]+)_(\d{8}-\d{6}(?:-\d+)?)_(read|prewrite)\.img$/;

/** Default: backups on, kept for 365 days, and at most 200 files. */
export function defaultRadioImageBackupSettings(): RadioImageBackupSettings {
  return {
    enabled: true,
    maxAgeDays: DEFAULT_BACKUP_MAX_AGE_DAYS,
    maxCount: DEFAULT_BACKUP_MAX_COUNT,
  };
}

/**
 * Parse backup preferences from localStorage.
 *
 * A missing document, or a missing `enabled` flag, stays on so the safety copy
 * exists until the operator turns it off.
 */
export function parseRadioImageBackupSettings(raw: string | null): RadioImageBackupSettings {
  const defaults = defaultRadioImageBackupSettings();

  if (!raw) {
    return defaults;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaults;
    }

    const record = parsed as Record<string, unknown>;

    return {
      enabled: record.enabled !== false,
      maxAgeDays: parseRetentionLimit(record.maxAgeDays, defaults.maxAgeDays, MAX_BACKUP_AGE_DAYS),
      maxCount: parseRetentionLimit(record.maxCount, defaults.maxCount, MAX_BACKUP_COUNT),
    };
  } catch {
    return defaults;
  }
}

export function serializeRadioImageBackupSettings(settings: RadioImageBackupSettings): string {
  const defaults = defaultRadioImageBackupSettings();

  return JSON.stringify({
    enabled: settings.enabled !== false,
    maxAgeDays: parseRetentionLimit(settings.maxAgeDays, defaults.maxAgeDays, MAX_BACKUP_AGE_DAYS),
    maxCount: parseRetentionLimit(settings.maxCount, defaults.maxCount, MAX_BACKUP_COUNT),
  });
}

export function readRadioImageBackupSettings(): RadioImageBackupSettings {
  if (!import.meta.client) {
    return defaultRadioImageBackupSettings();
  }

  try {
    return parseRadioImageBackupSettings(localStorage.getItem(RADIO_IMAGE_BACKUP_SETTINGS_KEY));
  } catch {
    return defaultRadioImageBackupSettings();
  }
}

export function writeRadioImageBackupSettings(settings: RadioImageBackupSettings): void {
  if (!import.meta.client) {
    return;
  }

  localStorage.setItem(RADIO_IMAGE_BACKUP_SETTINGS_KEY, serializeRadioImageBackupSettings(settings));
}

/**
 * Backups are written only when the operator left them on and this process can
 * reach the desktop app data directory.
 */
export function shouldCaptureRadioImageBackup(settings: RadioImageBackupSettings, desktopAvailable: boolean): boolean {
  return settings.enabled && desktopAvailable;
}

/** Filename-safe vendor or model segment. Underscores are reserved as separators. */
export function backupFileSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9.+-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);

  return cleaned.length > 0 ? cleaned : 'radio';
}

/** Local `YYYYMMDD-HHMMSS` stamp, matching the clock the operator sees. */
export function formatBackupTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function formatBackupTimestampLabel(timestamp: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?$/.exec(timestamp);

  if (!match) {
    return timestamp;
  }

  const duplicate = match[7] ? ` (${match[7]})` : '';
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}${duplicate}`;
}

export function backupKindLabel(kind: RadioImageBackupKind): string {
  return kind === 'read' ? 'Read from radio' : 'Before write';
}

export function radioImageBackupFileName(
  identity: RadioImageBackupIdentity,
  kind: RadioImageBackupKind,
  date: Date,
): string {
  const vendor = backupFileSegment(identity.manufacturer);
  const model = backupFileSegment(identity.model);
  return `${vendor}_${model}_${formatBackupTimestamp(date)}_${kind}.img`;
}

export function parseBackupFileName(fileName: string): ParsedRadioImageBackupName | undefined {
  const match = BACKUP_FILE_NAME.exec(fileName);

  if (!match) {
    return undefined;
  }

  const manufacturer = match[1];
  const model = match[2];
  const timestamp = match[3];
  const kind = match[4];

  if (!manufacturer || !model || !timestamp || (kind !== 'read' && kind !== 'prewrite')) {
    return undefined;
  }

  return {
    fileName,
    manufacturer,
    model,
    timestamp,
    kind,
  };
}

/**
 * Find the installed radio whose vendor and model produced this backup name.
 */
export function matchBackupConfiguration<T extends { id: { manufacturer: string; model: unknown } }>(
  configurations: readonly T[],
  backup: Pick<ParsedRadioImageBackupName, 'manufacturer' | 'model'>,
): T | undefined {
  return configurations.find((config) => {
    return (
      backupFileSegment(config.id.manufacturer) === backup.manufacturer &&
      backupFileSegment(String(config.id.model)) === backup.model
    );
  });
}

/**
 * Choose the backup filename and which older files to delete.
 *
 * Age uses whole days, the same cutoff CHIRP uses. Count is applied after that,
 * and the file about to be written is never one of the deletions.
 */
export function planRadioImageBackup(options: {
  identity: RadioImageBackupIdentity;
  kind: RadioImageBackupKind;
  now: Date;
  existing: readonly RadioImageBackupListing[];
  maxAgeDays: number;
  maxCount: number;
}): RadioImageBackupPlan {
  const fileName = uniqueBackupFileName(
    radioImageBackupFileName(options.identity, options.kind, options.now),
    new Set(options.existing.map((entry) => entry.fileName)),
  );
  const nowMs = options.now.getTime();
  const agedOut = new Set<string>();

  if (options.maxAgeDays > 0) {
    for (const entry of options.existing) {
      if (ageDays(entry.modifiedAtMs, nowMs) > options.maxAgeDays) {
        agedOut.add(entry.fileName);
      }
    }
  }

  const survivors = options.existing
    .filter((entry) => !agedOut.has(entry.fileName))
    .sort((left, right) => left.modifiedAtMs - right.modifiedAtMs || left.fileName.localeCompare(right.fileName));

  const pruneFileNames = [...agedOut];

  if (options.maxCount > 0) {
    const overflow = survivors.length + 1 - options.maxCount;

    if (overflow > 0) {
      pruneFileNames.push(...survivors.slice(0, overflow).map((entry) => entry.fileName));
    }
  }

  return { fileName, pruneFileNames };
}

/**
 * Save one raw image and prune according to the retention settings.
 *
 * When backups are disabled this returns before touching the store, so no
 * directory listing or file is created.
 */
export async function captureRadioImageBackup(options: {
  settings: RadioImageBackupSettings;
  identity: RadioImageBackupIdentity;
  kind: RadioImageBackupKind;
  image: Uint8Array;
  now?: Date;
  store: RadioImageBackupStore;
}): Promise<RadioImageBackupCapture> {
  if (!options.settings.enabled) {
    return { status: 'skipped' };
  }

  if (options.image.length === 0) {
    return { status: 'failed', message: 'The radio image is empty.' };
  }

  let existing: RadioImageBackupListing[];

  try {
    existing = await options.store.list();
  } catch (cause) {
    return { status: 'failed', message: errorMessage(cause, 'Could not read the backup folder.') };
  }

  const plan = planRadioImageBackup({
    identity: options.identity,
    kind: options.kind,
    now: options.now ?? new Date(),
    existing,
    maxAgeDays: options.settings.maxAgeDays,
    maxCount: options.settings.maxCount,
  });

  try {
    await options.store.save(plan.fileName, options.image);
  } catch (cause) {
    return { status: 'failed', message: errorMessage(cause, 'Could not save the radio image backup.') };
  }

  if (plan.pruneFileNames.length > 0) {
    try {
      await options.store.remove(plan.pruneFileNames);
    } catch {
      // The new backup is already on disk. Pruning can happen on the next save.
    }
  }

  return {
    status: 'saved',
    fileName: plan.fileName,
    prunedFileNames: plan.pruneFileNames,
  };
}

export function sortBackupsNewestFirst<T extends RadioImageBackupListing>(files: readonly T[]): T[] {
  return [...files].sort((left, right) => right.modifiedAtMs - left.modifiedAtMs || left.fileName.localeCompare(right.fileName));
}

export function writeWithoutBackupWarning(reason: string): string {
  return `A backup of the radio image could not be saved.\n\n${reason}\n\nWrite to the radio anyway? This replaces the memory currently stored in the radio.`;
}

function parseRetentionLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const truncated = Math.trunc(parsed);

  if (truncated < 0) {
    return 0;
  }

  if (truncated > max) {
    return max;
  }

  return truncated;
}

function ageDays(modifiedAtMs: number, nowMs: number): number {
  return Math.floor((nowMs - modifiedAtMs) / MS_PER_DAY);
}

function uniqueBackupFileName(fileName: string, existing: ReadonlySet<string>): string {
  if (!existing.has(fileName)) {
    return fileName;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = fileName.replace(
      /_(\d{8}-\d{6})_(read|prewrite)\.img$/,
      `_$1-${suffix}_$2.img`,
    );

    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return fileName;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }

  return fallback;
}
