import type { RadioProgram, RadioProgrammedChannel } from '@springfield/ham-radio-api';

export const RADIO_MEMORY_HISTORY_MAX_STEPS = 100;

export interface RadioMemoryHistory {
  timeline: RadioProgram[];
  index: number;
  /** Edit that produced `timeline[index + 1]` from `timeline[index]`. */
  labels: string[];
  /**
   * Index of the last loaded or saved program.
   * Missing when that snapshot has fallen off the 100-step cap.
   */
  cleanIndex?: number;
}

/** Plain snapshot for the history stack. JSON round-trip matches `programsEqual` and avoids Vue proxy clone errors. */
export function cloneRadioProgram(program: RadioProgram): RadioProgram {
  return JSON.parse(JSON.stringify(program)) as RadioProgram;
}

function channelNumbers(program: RadioProgram): number[] {
  return program.channels.map((channel) => channel.channelNumber);
}

function programsEqual(left: RadioProgram, right: RadioProgram): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function channelOrderChanged(before: RadioProgram, after: RadioProgram): boolean {
  const beforeNumbers = channelNumbers(before);
  const afterNumbers = channelNumbers(after);

  if (beforeNumbers.length !== afterNumbers.length) {
    return false;
  }

  const beforeSorted = [...beforeNumbers].sort((a, b) => a - b);
  const afterSorted = [...afterNumbers].sort((a, b) => a - b);

  if (beforeSorted.some((value, index) => value !== afterSorted[index])) {
    return false;
  }

  return beforeNumbers.some((value, index) => value !== afterNumbers[index]);
}

function movedChannelLabel(before: RadioProgram, after: RadioProgram): string | undefined {
  const beforeByNumber = new Map(before.channels.map((channel) => [channel.channelNumber, channel]));

  if (before.channels.length !== after.channels.length) {
    return undefined;
  }

  const moved: Array<{ from: number; to: number }> = [];

  for (const [number, channel] of beforeByNumber) {
    const match = after.channels.find((candidate) => sameChannelPayload(candidate, channel));

    if (!match) {
      return undefined;
    }

    if (match.channelNumber !== number) {
      moved.push({ from: number, to: match.channelNumber });
    }
  }

  if (moved.length === 1) {
    return `Move channel ${moved[0]!.from}`;
  }

  return undefined;
}

function sameChannelPayload(left: RadioProgrammedChannel, right: RadioProgrammedChannel): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function editedChannelLabel(before: RadioProgram, after: RadioProgram): string | undefined {
  const beforeByNumber = new Map(before.channels.map((channel) => [channel.channelNumber, channel]));
  const afterByNumber = new Map(after.channels.map((channel) => [channel.channelNumber, channel]));

  if (before.channels.length !== after.channels.length) {
    return undefined;
  }

  const changed: number[] = [];

  for (const [number, channel] of beforeByNumber) {
    const next = afterByNumber.get(number);

    if (!next || !sameChannelPayload(channel, next)) {
      changed.push(number);
    }
  }

  if (changed.length === 1) {
    return `Edit channel ${changed[0]}`;
  }

  return undefined;
}

/** Human-readable label for an edit that turns `before` into `after`. */
export function describeRadioMemoryEdit(before: RadioProgram, after: RadioProgram): string {
  if (before.channels.length > after.channels.length) {
    const count = before.channels.length - after.channels.length;

    return count === 1 ? 'Remove channel' : `Remove ${count} channels`;
  }

  if (before.channels.length < after.channels.length) {
    const count = after.channels.length - before.channels.length;

    return count === 1 ? 'Add channel' : `Add ${count} channels`;
  }

  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    return 'Change settings';
  }

  if (channelOrderChanged(before, after)) {
    return 'Reorder channels';
  }

  const moved = movedChannelLabel(before, after);

  if (moved) {
    return moved;
  }

  const edited = editedChannelLabel(before, after);

  if (edited) {
    return edited;
  }

  return 'Edit memory';
}

export function createRadioMemoryHistory(program: RadioProgram): RadioMemoryHistory {
  return {
    timeline: [cloneRadioProgram(program)],
    index: 0,
    labels: [],
    cleanIndex: 0,
  };
}

export function resetRadioMemoryHistory(program: RadioProgram): RadioMemoryHistory {
  return createRadioMemoryHistory(program);
}

export function markRadioMemoryHistoryClean(history: RadioMemoryHistory): RadioMemoryHistory {
  return { ...history, cleanIndex: history.index };
}

export function isRadioMemoryHistoryUnsaved(history: RadioMemoryHistory | undefined): boolean {
  return history !== undefined && history.index !== history.cleanIndex;
}

export function undoLabelForHistory(history: RadioMemoryHistory | undefined): string | undefined {
  if (!history || history.index <= 0) {
    return undefined;
  }

  return history.labels[history.index - 1];
}

export function redoLabelForHistory(history: RadioMemoryHistory | undefined): string | undefined {
  if (!history || history.index >= history.timeline.length - 1) {
    return undefined;
  }

  return history.labels[history.index];
}

export function recordRadioMemoryEdit(history: RadioMemoryHistory, nextProgram: RadioProgram): RadioMemoryHistory {
  const current = history.timeline[history.index]!;

  if (programsEqual(current, nextProgram)) {
    return history;
  }

  const label = describeRadioMemoryEdit(current, nextProgram);
  let timeline = [...history.timeline.slice(0, history.index + 1), cloneRadioProgram(nextProgram)];
  let labels = [...history.labels.slice(0, history.index), label];
  let index = timeline.length - 1;
  let cleanIndex = history.cleanIndex;

  const maxStates = RADIO_MEMORY_HISTORY_MAX_STEPS + 1;

  if (timeline.length > maxStates) {
    const removed = timeline.length - maxStates;
    timeline = timeline.slice(removed);
    labels = labels.slice(Math.max(0, labels.length - (maxStates - 1)));
    index = timeline.length - 1;

    if (cleanIndex !== undefined) {
      cleanIndex = cleanIndex < removed ? undefined : cleanIndex - removed;
    }
  }

  return { timeline, index, labels, cleanIndex };
}

export function undoRadioMemoryHistory(
  history: RadioMemoryHistory,
): { history: RadioMemoryHistory; program?: RadioProgram } {
  if (history.index <= 0) {
    return { history };
  }

  const index = history.index - 1;

  return {
    history: { ...history, index },
    program: cloneRadioProgram(history.timeline[index]!),
  };
}

export function redoRadioMemoryHistory(
  history: RadioMemoryHistory,
): { history: RadioMemoryHistory; program?: RadioProgram } {
  if (history.index >= history.timeline.length - 1) {
    return { history };
  }

  const index = history.index + 1;

  return {
    history: { ...history, index },
    program: cloneRadioProgram(history.timeline[index]!),
  };
}
