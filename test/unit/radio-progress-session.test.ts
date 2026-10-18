import { describe, expect, it, vi } from 'vitest';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  readProgressSerialLog,
  settleBackupFailureOnProgressClose,
} from '../../app/utils/radio-progress-session.ts';
import { mergeSessionSerialLog, snapshotFromDriverSerialLog } from '../../app/utils/serial-log-session.ts';
import { writeFailedDevFixtureSerialLog } from '../../app/utils/write-failed-dev-fixture.ts';

const radioId: RadioId = {
  model: RadioModelId('kenwood-th-f6'),
  name: 'Kenwood TH-F6',
  manufacturer: 'Kenwood',
};

const log = {
  metadata: { startTime: 't', totalEntries: 1, version: '1.0.0' },
  entries: [{ timestamp: '0', elapsedMs: 0, direction: 'SEND' as const, data: [0x0d] }],
};

describe('settleBackupFailureOnProgressClose', () => {
  it('resolves a pending backup decision as abort when the progress modal closes', () => {
    const settle = vi.fn();

    expect(settleBackupFailureOnProgressClose(true, settle)).toBe(true);
    expect(settle).toHaveBeenCalledWith('abort');
  });

  it('does nothing when no backup decision is pending', () => {
    const settle = vi.fn();

    expect(settleBackupFailureOnProgressClose(false, settle)).toBe(false);
    expect(settle).not.toHaveBeenCalled();
  });
});

describe('readProgressSerialLog', () => {
  it('uses the pinned transfer card log after transferCardId is cleared', () => {
    const transferCard = 'card-transfer';
    const focusedCard = 'card-focused';
    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(snapshot).toBeDefined();

    const sessions = {
      [transferCard]: { serialLog: snapshot },
      [focusedCard]: {},
    };

    const progressLog = readProgressSerialLog(
      sessions,
      transferCard,
      focusedCard,
      'Port not found',
      'write',
    );

    expect(progressLog?.entryCount).toBe(1);
    expect(progressLog?.fileName).toMatch(/kenwood-th-f6-write-serial-/);
    expect(progressLog?.operation).toBe('write');
  });

  it('keeps the import file name when a pre-write backup read failed', () => {
    const transferCard = 'card-transfer';
    const snapshot = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', log);

    expect(snapshot).toBeDefined();

    const sessions = {
      [transferCard]: { serialLog: snapshot },
    };

    const progressLog = readProgressSerialLog(
      sessions,
      transferCard,
      'other-focus',
      { context: { operation: 'backup', step: 'read' }, summary: 'fail', errors: { name: 'Error', message: 'fail' }, environment: { appVersion: '0', apiVersion: '0', driverVersion: '0', os: 'test' } },
      'backup',
    );

    expect(progressLog?.fileName).toMatch(/kenwood-th-f6-import-serial-/);
    expect(progressLog?.operation).toBe('import');
  });
});

describe('write failure after backup read (#107)', () => {
  it('keeps backup frames when the write driver captures nothing', () => {
    const backup = snapshotFromDriverSerialLog('import', radioId, '/dev/cu.test', writeFailedDevFixtureSerialLog());
    const afterWrite = mergeSessionSerialLog(backup, undefined);

    expect(afterWrite?.entryCount).toBe(2);

    const forSave = readProgressSerialLog(
      { card: { serialLog: afterWrite } },
      'card',
      'focused',
      { context: { operation: 'write', step: 'write' }, summary: 'fail', errors: { name: 'Error', message: 'Port not found' }, environment: { appVersion: '0', apiVersion: '0', driverVersion: '0', os: 'test' } },
      'write',
    );

    expect(forSave?.fileName).toMatch(/kenwood-th-f6-write-serial-/);
    expect(JSON.parse(forSave!.contents).operation).toBe('write');
  });
});
