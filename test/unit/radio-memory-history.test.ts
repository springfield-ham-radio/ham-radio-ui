import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import type { RadioProgram } from '@springfield/ham-radio-api';
import {
  createRadioMemoryHistory,
  describeRadioMemoryEdit,
  isRadioMemoryHistoryUnsaved,
  markRadioMemoryHistoryClean,
  recordRadioMemoryEdit,
  redoRadioMemoryHistory,
  RADIO_MEMORY_HISTORY_MAX_STEPS,
  undoRadioMemoryHistory,
} from '../../app/utils/radio-memory-history.ts';

function program(channels: RadioProgram['channels'], settings: Record<string, unknown> = {}): RadioProgram {
  return { channels, settings };
}

describe('radio-memory-history', () => {
  it('snapshots Vue reactive programs and nested reactive channels', () => {
    const channel = {
      channelNumber: 1,
      radioChannel: { receiveFrequency: 146_520_000, transmitFrequency: 146_520_000, name: '2m' },
    };
    const plain: RadioProgram = {
      channels: [channel],
      settings: { display: { contrast: 3 } },
    };
    const reactiveProgram = reactive({
      channels: [reactive(channel)],
      settings: reactive(plain.settings),
    }) as RadioProgram;

    const history = createRadioMemoryHistory(reactiveProgram);

    expect(history.timeline[0]).not.toBe(reactiveProgram);
    expect(history.timeline[0]).toEqual(plain);
    expect(history.timeline[0]!.channels[0]).not.toBe(reactiveProgram.channels[0]);
  });

  it('labels common memory edits', () => {
    const before = program([{ channelNumber: 1, radioChannel: { receiveFrequency: 1, transmitFrequency: 1 } }]);
    const afterRemove = program([]);
    const afterAdd = program([
      { channelNumber: 1, radioChannel: { receiveFrequency: 1, transmitFrequency: 1 } },
      { channelNumber: 2, radioChannel: { receiveFrequency: 2, transmitFrequency: 2 } },
    ]);

    expect(describeRadioMemoryEdit(before, afterRemove)).toBe('Remove channel');
    expect(describeRadioMemoryEdit(before, afterAdd)).toBe('Add channel');
    expect(describeRadioMemoryEdit(program([]), program([], { squelch: 1 }))).toBe('Change settings');
  });

  it('records undo and redo and clears redo on a new edit', () => {
    const first = program([]);
    const second = program([{ channelNumber: 0, radioChannel: { receiveFrequency: 1, transmitFrequency: 1 } }]);
    const third = program([
      { channelNumber: 0, radioChannel: { receiveFrequency: 1, transmitFrequency: 1 } },
      { channelNumber: 1, radioChannel: { receiveFrequency: 2, transmitFrequency: 2 } },
    ]);

    let history = createRadioMemoryHistory(first);
    history = recordRadioMemoryEdit(history, second);
    history = recordRadioMemoryEdit(history, third);

    expect(history.labels).toEqual(['Add channel', 'Add channel']);

    const undone = undoRadioMemoryHistory(history);
    expect(undone.program?.channels).toHaveLength(1);
    expect(undone.history.index).toBe(1);

    const redone = redoRadioMemoryHistory(undone.history);
    expect(redone.program?.channels).toHaveLength(2);

    const replaced = recordRadioMemoryEdit(redone.history, first);
    expect(replaced.timeline.at(-1)).toEqual(first);
    expect(redoRadioMemoryHistory(replaced).program).toBeUndefined();
  });

  it('tracks clean index and drops the oldest step at the cap', () => {
    let history = createRadioMemoryHistory(program([]));

    for (let step = 0; step < RADIO_MEMORY_HISTORY_MAX_STEPS + 5; step += 1) {
      history = recordRadioMemoryEdit(
        history,
        program([{ channelNumber: step, radioChannel: { receiveFrequency: step, transmitFrequency: step } }]),
      );
    }

    expect(history.timeline).toHaveLength(RADIO_MEMORY_HISTORY_MAX_STEPS + 1);
    expect(history.index).toBe(history.timeline.length - 1);

    history = markRadioMemoryHistoryClean(history);
    expect(isRadioMemoryHistoryUnsaved(history)).toBe(false);

    history = recordRadioMemoryEdit(history, program([]));
    expect(isRadioMemoryHistoryUnsaved(history)).toBe(true);

    const undone = undoRadioMemoryHistory(history);
    expect(isRadioMemoryHistoryUnsaved(undone.history)).toBe(false);
  });

  it('stays unsaved after the clean snapshot falls off the cap', () => {
    let history = createRadioMemoryHistory(program([]));

    for (let step = 0; step < RADIO_MEMORY_HISTORY_MAX_STEPS + 2; step += 1) {
      history = recordRadioMemoryEdit(
        history,
        program([{ channelNumber: step, radioChannel: { receiveFrequency: step, transmitFrequency: step } }]),
      );
    }

    expect(history.cleanIndex).toBeUndefined();
    expect(isRadioMemoryHistoryUnsaved(history)).toBe(true);

    while (history.index > 0) {
      history = undoRadioMemoryHistory(history).history;
    }

    expect(isRadioMemoryHistoryUnsaved(history)).toBe(true);
  });
});
