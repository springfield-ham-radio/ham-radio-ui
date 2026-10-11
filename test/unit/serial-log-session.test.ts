import { describe, expect, it } from 'vitest';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  mergeSessionSerialLog,
  serialLogForProgressSave,
  snapshotFromDriverSerialLog,
} from '../../app/utils/serial-log-session.ts';

const radioId: RadioId = {
  model: RadioModelId('kenwood-th-f6'),
  name: 'Kenwood TH-F6',
  manufacturer: 'Kenwood',
};

const log = {
  metadata: { startTime: 't', totalEntries: 1, version: '1.0.0' },
  entries: [{ timestamp: '0', elapsedMs: 0, direction: 'SEND' as const, data: [0x0d] }],
};

describe('snapshotFromDriverSerialLog', () => {
  it('returns undefined for an empty driver log', () => {
    expect(snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', { entries: [] })).toBeUndefined();
  });

  it('builds a capture with the import file name', () => {
    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(snapshot?.entryCount).toBe(1);
    expect(snapshot?.fileName).toMatch(/kenwood-th-f6-import-serial-/);
    expect(snapshot?.operation).toBe('import');
  });
});

describe('mergeSessionSerialLog', () => {
  it('keeps the existing log when a new capture has no frames', () => {
    const existing = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(mergeSessionSerialLog(existing, undefined)).toEqual(existing);
  });

  it('replaces the log when a new capture has frames', () => {
    const existing = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);
    const writeLog = {
      ...log,
      entries: [...log.entries, { timestamp: '1', elapsedMs: 1, direction: 'RECV' as const, data: [0x06] }],
    };
    const incoming = snapshotFromDriverSerialLog('write', radioId, '/dev/cu.test', writeLog);

    expect(mergeSessionSerialLog(existing, incoming)?.entryCount).toBe(2);
    expect(mergeSessionSerialLog(existing, incoming)?.operation).toBe('write');
  });
});

describe('serialLogForProgressSave', () => {
  it('offers a write file name when a write failed after a backup read', () => {
    const backup = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(backup).toBeDefined();
    const forSave = serialLogForProgressSave(backup!, 'write');

    expect(forSave.fileName).toMatch(/kenwood-th-f6-write-serial-/);
    expect(forSave.operation).toBe('write');
    expect(JSON.parse(forSave.contents).operation).toBe('write');
  });

  it('leaves import logs unchanged for read failures', () => {
    const backup = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(backup).toBeDefined();
    const forSave = serialLogForProgressSave(backup!, 'import');

    expect(forSave.fileName).toMatch(/-import-serial-/);
  });
});
