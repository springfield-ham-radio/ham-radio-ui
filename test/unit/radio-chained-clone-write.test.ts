import { describe, expect, it } from 'vitest';
import type { Radio } from '@springfield/ham-radio-api';
import {
  isLeaveProgrammingModeStep,
  readMemoryStepsWithoutProgrammingExit,
  supportsChainedPrewriteBackupWrite,
  writeMemoryStepsFromCloneBody,
} from '../../app/utils/radio-chained-clone-write.ts';
import { PostPrewriteBackupWriteError } from '../../app/utils/radio-prewrite-backup-write.ts';

const thD74Like: Radio = {
  id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
  version: '1.0.0',
  description: 'test',
  memoryConfig: {
    chunkSize: 256,
    addressSize: 2,
    addressEndianness: 'big',
    segments: { image: { startAddress: 0, endAddress: 255 } },
  },
  serialConfig: { baudRate: 9600 },
  readMemory: [
    { send: ['0x0D'], expect: ['?'] },
    { read: { segments: ['image'], send: ['R'], expect: ['W'], ack: { send: ['0x06'], expect: '0x06' } } },
    { description: 'Leave programming mode', send: ['E'] },
  ],
  writeMemory: [
    { send: ['0x0D'], expect: ['?'] },
    { send: ['I', 'D', '0x0D'], expect: ['I', 'D'] },
    {
      write: {
        segments: ['image'],
        chunkSize: 256,
        send: ['W'],
        expect: '0x06',
      },
    },
    { send: ['E'] },
  ],
};

describe('radio chained clone write helpers', () => {
  it('detects Kenwood-style programming exit steps', () => {
    expect(isLeaveProgrammingModeStep({ send: ['E'] })).toBe(true);
    expect(isLeaveProgrammingModeStep({ send: ['0x0D'] })).toBe(false);
  });

  it('supports chained backup write for TH-D74-like configs', () => {
    expect(supportsChainedPrewriteBackupWrite(thD74Like)).toBe(true);
    expect(readMemoryStepsWithoutProgrammingExit(thD74Like.readMemory)).toHaveLength(2);
    expect(writeMemoryStepsFromCloneBody(thD74Like.writeMemory)).toHaveLength(2);
  });

  it('marks post-backup write failures distinctly', () => {
    const error = new PostPrewriteBackupWriteError(new Error('No such file or directory'));

    expect(error.backupSavedBeforeWrite).toBe(true);
    expect(error.message).toContain('backup was saved');
    expect(error.message).toContain('not written');
  });
});
