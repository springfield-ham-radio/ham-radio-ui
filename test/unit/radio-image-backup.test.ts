import { describe, expect, it, vi } from 'vitest';
import {
  backupFileSegment,
  backupKindLabel,
  captureRadioImageBackup,
  defaultRadioImageBackupSettings,
  formatBackupTimestampLabel,
  matchBackupConfiguration,
  parseBackupFileName,
  parseRadioImageBackupSettings,
  planRadioImageBackup,
  radioImageBackupFileName,
  serializeRadioImageBackupSettings,
  shouldCaptureRadioImageBackup,
  sortBackupsNewestFirst,
  writeWithoutBackupWarning,
  type RadioImageBackupListing,
  type RadioImageBackupSettings,
  type RadioImageBackupStore,
} from '../../app/utils/radio-image-backup.ts';

const identity = { manufacturer: 'Baofeng', model: 'UV-5R' };
const now = new Date(2026, 9, 3, 17, 14, 55);
const dayMs = 86_400_000;

function memoryStore(initial: RadioImageBackupListing[] = []): {
  saved: Map<string, Uint8Array>;
  removed: string[][];
  store: RadioImageBackupStore;
} {
  const files = new Map<string, RadioImageBackupListing>(initial.map((entry) => [entry.fileName, entry]));
  const saved = new Map<string, Uint8Array>();
  const removed: string[][] = [];

  return {
    saved,
    removed,
    store: {
      async list() {
        return [...files.values()];
      },
      async save(fileName, image) {
        saved.set(fileName, image.slice());
        files.set(fileName, { fileName, modifiedAtMs: now.getTime() });
      },
      async remove(fileNames) {
        removed.push([...fileNames]);

        for (const fileName of fileNames) {
          files.delete(fileName);
        }
      },
    },
  };
}

function settings(overrides: Partial<RadioImageBackupSettings> = {}): RadioImageBackupSettings {
  return { ...defaultRadioImageBackupSettings(), ...overrides };
}

describe('radio image backup settings', () => {
  it('should back up radio images by default', () => {
    expect(defaultRadioImageBackupSettings()).toEqual({
      enabled: true,
      maxAgeDays: 365,
      maxCount: 200,
    });
    expect(parseRadioImageBackupSettings(null)).toEqual(defaultRadioImageBackupSettings());
    expect(parseRadioImageBackupSettings('')).toEqual(defaultRadioImageBackupSettings());
    expect(parseRadioImageBackupSettings('{')).toEqual(defaultRadioImageBackupSettings());
    expect(parseRadioImageBackupSettings('[]')).toEqual(defaultRadioImageBackupSettings());
  });

  it('should keep backups off only when the stored flag is false', () => {
    expect(parseRadioImageBackupSettings(JSON.stringify({ enabled: false, extra: true }))).toEqual({
      enabled: false,
      maxAgeDays: 365,
      maxCount: 200,
    });
    expect(parseRadioImageBackupSettings(JSON.stringify({ maxAgeDays: 30 }))).toMatchObject({
      enabled: true,
      maxAgeDays: 30,
    });
  });

  it('should round-trip retention limits and clamp unusable values', () => {
    const stored = settings({ enabled: false, maxAgeDays: 14, maxCount: 0 });

    expect(parseRadioImageBackupSettings(serializeRadioImageBackupSettings(stored))).toEqual(stored);
    expect(parseRadioImageBackupSettings(JSON.stringify({ maxAgeDays: -4, maxCount: 99_999 }))).toMatchObject({
      maxAgeDays: 0,
      maxCount: 10_000,
    });
    expect(parseRadioImageBackupSettings(JSON.stringify({ maxAgeDays: '90', maxCount: '12' }))).toMatchObject({
      maxAgeDays: 90,
      maxCount: 12,
    });
  });

  it('should capture a backup only when the setting is on and a desktop folder is available', () => {
    expect(shouldCaptureRadioImageBackup(settings({ enabled: true }), true)).toBe(true);
    expect(shouldCaptureRadioImageBackup(settings({ enabled: false }), true)).toBe(false);
    expect(shouldCaptureRadioImageBackup(settings({ enabled: true }), false)).toBe(false);
  });
});

describe('radio image backup files', () => {
  it('should name a backup with the vendor, model, timestamp, and operation', () => {
    const fileName = radioImageBackupFileName(identity, 'read', now);

    expect(fileName).toBe('Baofeng_UV-5R_20261003-171455_read.img');
    expect(parseBackupFileName(fileName)).toEqual({
      fileName,
      manufacturer: 'Baofeng',
      model: 'UV-5R',
      timestamp: '20261003-171455',
      kind: 'read',
    });
    expect(backupFileSegment('Yaesu Musen')).toBe('Yaesu-Musen');
    expect(backupKindLabel('prewrite')).toBe('Before write');
    expect(formatBackupTimestampLabel('20261003-171455')).toBe('2026-10-03 17:14:55');
  });

  it('should match a backup to the installed radio', () => {
    const configs = [
      { id: { manufacturer: 'Baofeng', model: 'UV-5R', name: 'UV-5R' } },
      { id: { manufacturer: 'Yaesu', model: 'FT-60', name: 'FT-60' } },
    ];
    const backup = parseBackupFileName(radioImageBackupFileName(identity, 'prewrite', now));

    expect(backup).toBeDefined();
    expect(matchBackupConfiguration(configs, backup!)).toBe(configs[0]);
    expect(parseBackupFileName('notes.txt')).toBeUndefined();
  });

  it('should add a suffix when two backups land in the same second', () => {
    const fileName = radioImageBackupFileName(identity, 'prewrite', now);
    const plan = planRadioImageBackup({
      identity,
      kind: 'prewrite',
      now,
      existing: [{ fileName, modifiedAtMs: now.getTime() }],
      maxAgeDays: 365,
      maxCount: 200,
    });

    expect(plan.fileName).toBe(fileName.replace('_prewrite.img', '-2_prewrite.img'));
    expect(plan.pruneFileNames).toEqual([]);
  });
});

describe('radio image backup capture', () => {
  it('should save the raw image when backups are enabled', async () => {
    const image = new Uint8Array([1, 2, 3, 4]);
    const disk = memoryStore();
    const captured = await captureRadioImageBackup({
      settings: settings(),
      identity,
      kind: 'read',
      image,
      now,
      store: disk.store,
    });

    expect(captured.status).toBe('saved');

    if (captured.status !== 'saved') {
      return;
    }

    expect(captured.fileName).toMatch(/_read\.img$/);
    expect(disk.saved.get(captured.fileName)).toEqual(image);
    expect(disk.removed).toEqual([]);
  });

  it('should not create backup files when backups are disabled', async () => {
    const list = vi.fn();
    const save = vi.fn();
    const remove = vi.fn();
    const captured = await captureRadioImageBackup({
      settings: settings({ enabled: false }),
      identity,
      kind: 'prewrite',
      image: new Uint8Array([9]),
      now,
      store: { list, save, remove },
    });

    expect(captured).toEqual({ status: 'skipped' });
    expect(list).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('should prune backups that are past the age limit or over the file count', async () => {
    const old = {
      fileName: 'Baofeng_UV-5R_20240101-000000_read.img',
      modifiedAtMs: now.getTime() - 400 * dayMs,
    };
    const recent = [0, 1, 2, 3, 4].map((index) => ({
      fileName: `Baofeng_UV-5R_2026100${index + 1}-120000_read.img`,
      modifiedAtMs: now.getTime() - (10 - index) * dayMs,
    }));
    const disk = memoryStore([old, ...recent]);
    const captured = await captureRadioImageBackup({
      settings: settings({ maxAgeDays: 365, maxCount: 3 }),
      identity,
      kind: 'prewrite',
      image: new Uint8Array([7, 7]),
      now,
      store: disk.store,
    });

    expect(captured.status).toBe('saved');

    if (captured.status !== 'saved') {
      return;
    }

    expect(captured.prunedFileNames).toEqual([
      old.fileName,
      recent[0]!.fileName,
      recent[1]!.fileName,
      recent[2]!.fileName,
    ]);
    expect(captured.prunedFileNames).not.toContain(captured.fileName);
    expect(disk.removed).toEqual([captured.prunedFileNames]);
    expect([...disk.saved.keys()]).toEqual([captured.fileName]);

    const remaining = await disk.store.list();
    expect(sortBackupsNewestFirst(remaining).map((entry) => entry.fileName)).toEqual([
      captured.fileName,
      recent[4]!.fileName,
      recent[3]!.fileName,
    ]);
  });

  it('should report a save failure without deleting older backups', async () => {
    const disk = memoryStore([
      { fileName: 'Baofeng_UV-5R_20260101-000000_read.img', modifiedAtMs: now.getTime() - 400 * dayMs },
    ]);
    disk.store.save = async () => {
      throw new Error('disk full');
    };

    const captured = await captureRadioImageBackup({
      settings: settings({ maxAgeDays: 30 }),
      identity,
      kind: 'read',
      image: new Uint8Array([1]),
      now,
      store: disk.store,
    });

    expect(captured).toEqual({ status: 'failed', message: 'disk full' });
    expect(disk.removed).toEqual([]);
    expect(writeWithoutBackupWarning('disk full')).toContain('Write to the radio anyway?');
  });
});
