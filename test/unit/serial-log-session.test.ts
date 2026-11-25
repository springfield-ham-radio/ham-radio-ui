import { describe, expect, it, vi } from 'vitest';
import { isReactive, reactive } from 'vue';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  mergeSessionSerialLog,
  serialLogForProgressSave,
  snapshotFromDriverSerialLog,
} from '../../app/utils/serial-log-session.ts';
import { serializeSerialLogFile } from '../../app/utils/serial-log-file.ts';

const radioId: RadioId = {
  model: RadioModelId('kenwood-th-f6'),
  name: 'Kenwood TH-F6',
  manufacturer: 'Kenwood',
};

const log = {
  metadata: { startTime: 't', totalEntries: 1, version: '1.0.0' },
  entries: [{ timestamp: '0', elapsedMs: 0, direction: 'SEND' as const, data: [0x0d] }],
};

function largeLog(frameCount: number) {
  return {
    metadata: { startTime: 't', totalEntries: frameCount, version: '1.0.0' },
    entries: Array.from({ length: frameCount }, (_, index) => ({
      timestamp: String(index),
      elapsedMs: index,
      direction: 'RECV' as const,
      data: [index & 0xff],
    })),
  };
}

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

  it('keeps the snapshot and driver log out of Vue reactivity', () => {
    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(snapshot).toBeDefined();
    expect(isReactive(snapshot)).toBe(false);
    expect(isReactive(snapshot!.log)).toBe(false);

    const session = reactive({ serialLog: snapshot });
    expect(isReactive(session.serialLog)).toBe(false);
    expect(isReactive(session.serialLog!.log)).toBe(false);
  });

  it('defers contents JSON until read and matches eager serialization', () => {
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    stringifySpy.mockClear();

    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);
    expect(snapshot).toBeDefined();

    const callsBeforeContents = stringifySpy.mock.calls.length;
    expect(Object.keys(snapshot as object)).not.toContain('contents');

    const expected = serializeSerialLogFile({
      operation: 'import',
      radioId,
      serialPortPath: '/dev/cu.test',
      log,
    });
    expect(snapshot!.contents).toBe(expected);
    expect(stringifySpy.mock.calls.length).toBeGreaterThan(callsBeforeContents);

    expect(snapshot!.contents).toBe(expected);
    stringifySpy.mockRestore();
  });

  it('does not rebuild contents when the session object is shallow-copied', () => {
    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);
    expect(snapshot).toBeDefined();

    void snapshot!.contents;
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    stringifySpy.mockClear();

    const patched = { ...(snapshot as object) };
    expect('contents' in patched).toBe(false);

    const sessionPatch = { serialLog: snapshot };
    const merged = { ...sessionPatch, memoryFilePath: '/tmp/x' };
    expect(merged.serialLog).toBe(snapshot);
    expect(stringifySpy).not.toHaveBeenCalled();
    stringifySpy.mockRestore();
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
    expect(isReactive(forSave)).toBe(false);
  });

  it('leaves import logs unchanged for read failures', () => {
    const backup = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(backup).toBeDefined();
    const forSave = serialLogForProgressSave(backup!, 'import');

    expect(forSave.fileName).toMatch(/-import-serial-/);
    expect(forSave).toBe(backup);
  });

  it('builds a fresh snapshot for write rename so contents stays lazy', () => {
    const big = largeLog(4);
    const backup = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', big);
    expect(backup).toBeDefined();

    const stringifySpy = vi.spyOn(JSON, 'stringify');
    const forSave = serialLogForProgressSave(backup!, 'write');
    expect(forSave).not.toBe(backup);
    expect(forSave.fileName).toContain('-write-');
    const callsAfterRename = stringifySpy.mock.calls.length;
    stringifySpy.mockClear();
    void forSave.contents;
    expect(stringifySpy.mock.calls.length).toBeGreaterThan(0);
    expect(stringifySpy.mock.calls.length).toBeGreaterThanOrEqual(callsAfterRename);
    stringifySpy.mockRestore();
  });
});