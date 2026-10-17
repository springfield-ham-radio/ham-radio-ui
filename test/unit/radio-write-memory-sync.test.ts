import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Frequency,
  type RadioMemoryConfig,
  type RadioMemoryMap,
  type RadioModelId,
  type RadioProgram,
  type RadioProgrammedChannel,
  RadioToneType,
} from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { moveProgrammedChannel } from '../../app/utils/channel-edit.ts';
import { diffRadioPrograms, summarizeWriteReview } from '../../app/utils/radio-write-review.ts';

function programmedChannel(channelNumber: number, name: string): RadioProgrammedChannel {
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

function uv5rCodec() {
  const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const memoryMap = JSON.parse(
    readFileSync(
      join(rootDirectory, 'node_modules/@springfield/radio-module-baofeng/src/shared/memory-maps/uv5r-settings.json'),
      'utf8',
    ),
  ) as RadioMemoryMap;
  const memoryConfig: RadioMemoryConfig = {
    chunkSize: 64,
    addressSize: 2,
    addressEndianness: 'big',
    segments: {
      channels: { startAddress: 0, endAddress: 6143 },
      settings: { startAddress: 7872, endAddress: 8191 },
    },
  };
  const modelId = 'baofeng-uv5r' as RadioModelId;
  const codec = createMemoryMapCodec({
    radioModel: modelId,
    memoryMap,
    memoryConfig,
    logger: new MockLogLayer(),
  });

  return { codec, memoryMap, modelId };
}

describe('write review memory sync', () => {
  it('shows channel moves after the loaded image is re-encoded', () => {
    const { codec, memoryMap, modelId } = uv5rCodec();
    const readProgram: RadioProgram = {
      channels: [programmedChannel(0, 'ALPHA'), programmedChannel(1, 'BRAVO')],
      settings: {},
    };
    const baselineImage = codec.encode(readProgram, {
      contents: new Uint8Array(8192).fill(0xff),
      radioModel: modelId,
    }).contents;
    const before = codec.decode({ contents: baselineImage, radioModel: modelId });

    const moved = moveProgrammedChannel(readProgram.channels, 0, 2, 128);
    expect(moved.previousToNext.size).toBeGreaterThan(0);

    const afterProgram: RadioProgram = { ...readProgram, channels: moved.channels };
    const afterImage = codec.encode(afterProgram, {
      contents: baselineImage.slice(),
      radioModel: modelId,
    }).contents;

    const staleDiff = diffRadioPrograms(before, codec.decode({ contents: baselineImage, radioModel: modelId }), memoryMap);
    expect(summarizeWriteReview(staleDiff)).toBe('No channel or setting changes.');

    const after = codec.decode({ contents: afterImage, radioModel: modelId });
    const diff = diffRadioPrograms(before, after, memoryMap);

    expect(diff.channels.length).toBeGreaterThan(0);
    expect(summarizeWriteReview(diff)).not.toBe('No channel or setting changes.');
  });
});
