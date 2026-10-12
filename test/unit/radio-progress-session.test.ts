import { describe, expect, it, vi } from 'vitest';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  readProgressSerialLog,
  settleBackupFailureOnProgressClose,
} from '../../app/utils/radio-progress-session.ts';
import { snapshotFromDriverSerialLog } from '../../app/utils/serial-log-session.ts';

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
});
