import { describe, expect, it } from 'vitest';
import { Frequency, type RadioProgram, type RadioProgrammedChannel, RadioToneType } from '@springfield/ham-radio-api';
import { radioBaselineAfterWriteAttempt } from '../../app/utils/radio-baseline-after-write.ts';
import { diffPendingRadioState, pendingChangeCount } from '../../app/utils/radio-pending-diff.ts';

function channel(channelNumber: number, name: string): RadioProgrammedChannel {
  return {
    channelNumber,
    radioChannel: {
      name,
      receiveFrequency: Frequency(146_520_000),
      transmitFrequency: Frequency(146_520_000),
      receiveTone: { tone: 0, type: RadioToneType.CTCSS },
      transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    },
  };
}

const onRadio: RadioProgram = {
  channels: [channel(1, 'KEEP'), channel(4, 'OLD')],
  settings: {},
};
const edited: RadioProgram = {
  channels: [channel(1, 'KEEP')],
  settings: {},
};
const previousImage = Uint8Array.from([1, 2, 3, 4]);
const editorImage = Uint8Array.from([5, 6, 7, 8]);
const backupImage = Uint8Array.from([9, 9, 9, 9]);

function attempt(
  terminal: 'success' | 'canceled' | 'failed' | 'aborted',
  extras: { canceled?: boolean; previousImage?: Uint8Array; previousProgram?: RadioProgram } = {},
) {
  return radioBaselineAfterWriteAttempt({
    previous: {
      image: extras.previousImage === undefined ? previousImage : extras.previousImage,
      program: extras.previousProgram === undefined ? onRadio : extras.previousProgram,
    },
    terminal,
    writtenImage: editorImage,
    writtenProgram: edited,
    backupImage,
    canceled: extras.canceled,
  });
}

describe('radioBaselineAfterWriteAttempt', () => {
  it('replaces the baseline only after a write that finished', () => {
    const decision = attempt('success');

    expect(decision.commit).toBe(true);
    expect(decision.image).toEqual(editorImage);
    expect(decision.image).not.toBe(editorImage);
    expect(decision.image).not.toEqual(backupImage);
    expect(decision.program).toEqual(edited);
    expect(decision.program).not.toBe(edited);
    expect(pendingChangeCount(diffPendingRadioState(decision.program, edited))).toBe(0);
  });

  it.each(['canceled', 'failed', 'aborted'] as const)(
    'keeps the previous baseline and cleared rows when the write is %s',
    (terminal) => {
      const decision = attempt(terminal);

      expect(decision.commit).toBe(false);
      expect(decision.image).toBe(previousImage);
      expect(decision.program).toBe(onRadio);
      expect(decision.image).not.toEqual(backupImage);
      expect(decision.image).not.toEqual(editorImage);

      const diff = diffPendingRadioState(decision.program, edited);

      expect(diff.channels).toEqual([
        { channelNumber: 4, kind: 'cleared', moved: false, changedColumnIds: [] },
      ]);
      expect(pendingChangeCount(diff)).toBe(1);
    },
  );

  it('does not adopt the editor image when the driver returns after cancel', () => {
    const decision = attempt('success', { canceled: true });

    expect(decision.commit).toBe(false);
    expect(decision.image).toBe(previousImage);
    expect(decision.program).toBe(onRadio);
    expect(diffPendingRadioState(decision.program, edited).channels[0]?.kind).toBe('cleared');
  });

  it('does not store a pre-write backup image as the baseline when the write does not finish', () => {
    for (const terminal of ['canceled', 'failed', 'aborted'] as const) {
      const decision = radioBaselineAfterWriteAttempt({
        previous: {},
        terminal,
        writtenImage: editorImage,
        writtenProgram: edited,
        backupImage,
      });

      expect(decision.commit).toBe(false);
      expect(decision.image).toBeUndefined();
      expect(decision.program).toBeUndefined();
    }
  });

  it('does not replace an existing baseline with the backup image after a failed write', () => {
    const decision = attempt('failed');

    expect(decision.image).toBe(previousImage);
    expect(Array.from(decision.image ?? [])).not.toEqual(Array.from(backupImage));
  });
});
