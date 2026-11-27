import type { RadioMemoryMap, RadioMemoryConfig, RadioProgram, RadioProgrammedChannel } from '@springfield/ham-radio-api';
import {
  isSpecialChannelIndex,
  memoryMapChannelRecordCount,
  memoryMapRegularChannelCapacity,
  memoryMapSpecialChannelLabel,
} from '@springfield/ham-radio-utils';
import {
  encodeMemoryMap,
  programToChannelSettings,
  radioAddressToBufferOffset,
  structInstanceAddress,
} from '~/utils/ham-radio-utils-shim';
import type { ChannelRow } from '~/composables/useRadio';
import { toChannelRowFromProgrammed } from '~/utils/channel-specials-rows';

export {
  isSpecialChannelIndex,
  memoryMapChannelRecordCount,
  memoryMapRegularChannelCapacity,
  memoryMapSpecialChannelLabel,
};

export function hasMemoryMapSpecialChannels(memoryMap: RadioMemoryMap | undefined): boolean {
  return Boolean(memoryMap?.channelBindings?.specials?.labels?.length);
}

export function specialChannelIndexes(memoryMap: RadioMemoryMap | undefined): number[] {
  const specials = memoryMap?.channelBindings?.specials;

  if (!specials) {
    return [];
  }

  return specials.labels.map((_, offset) => specials.start + offset);
}

export function isRegularChannelIndex(memoryMap: RadioMemoryMap | undefined, index: number): boolean {
  if (!memoryMap) {
    return true;
  }

  if (!hasMemoryMapSpecialChannels(memoryMap)) {
    return true;
  }

  const regularEnd = memoryMapRegularChannelCapacity(memoryMap);

  return regularEnd === undefined || index < regularEnd;
}

/**
 * Encode channels and settings, then restore EEPROM bytes for unprogrammed special slots
 * so `clearEmpty` does not erase factory special records.
 */
export function encodeRadioProgramPreservingSpecialSlots(
  memoryMap: RadioMemoryMap,
  program: RadioProgram,
  contents: Uint8Array,
  memoryConfig: RadioMemoryConfig,
): Uint8Array {
  const before = new Uint8Array(contents);
  const next = new Uint8Array(contents);
  const bag = programToChannelSettings(memoryMap, program);
  encodeMemoryMap(memoryMap, bag, next, memoryConfig);
  restoreUnprogrammedSpecialChannelBytes(memoryMap, program, before, next, memoryConfig);
  return next;
}

export function restoreUnprogrammedSpecialChannelBytes(
  memoryMap: RadioMemoryMap,
  program: RadioProgram,
  before: Uint8Array,
  after: Uint8Array,
  memoryConfig: RadioMemoryConfig,
): void {
  const specials = memoryMap.channelBindings?.specials;

  if (!specials) {
    return;
  }

  const bindings = memoryMap.channelBindings!;
  const channelStructIds = new Set(
    [bindings.records, bindings.names, bindings.extras].filter((id): id is string => Boolean(id)),
  );
  const occupied = new Set(program.channels.map((channel) => channel.channelNumber));
  const specialEnd = specials.start + specials.labels.length;

  for (const struct of memoryMap.structs) {
    if (!channelStructIds.has(struct.id)) {
      continue;
    }

    const stride = struct.stride ?? 0;

    if (stride <= 0) {
      continue;
    }

    for (let index = specials.start; index < specialEnd; index += 1) {
      if (occupied.has(index)) {
        continue;
      }

      const radioAddress = structInstanceAddress(struct, index);
      const offset = radioAddressToBufferOffset(radioAddress, memoryConfig, after.length);

      for (let byte = 0; byte < stride; byte += 1) {
        after[offset + byte] = before[offset + byte]!;
      }
    }
  }
}

export function programByChannelNumber(
  program: RadioProgram | undefined,
  channelNumber: number,
): RadioProgrammedChannel | undefined {
  return program?.channels.find((channel) => channel.channelNumber === channelNumber);
}

export function specialChannelRows(
  memoryMap: RadioMemoryMap | undefined,
  program: RadioProgram | undefined,
): ChannelRow[] {
  if (!memoryMap || !hasMemoryMapSpecialChannels(memoryMap)) {
    return [];
  }

  const programmedByNumber = new Map(
    (program?.channels ?? []).map((channel) => [channel.channelNumber, channel] as const),
  );

  return specialChannelIndexes(memoryMap).map((channelNumber) => {
    const programmed = programmedByNumber.get(channelNumber);
    const slotLabel = memoryMapSpecialChannelLabel(memoryMap, channelNumber) ?? String(channelNumber);

    if (programmed && typeof programmed.radioChannel !== 'string') {
      return {
        ...toChannelRowFromProgrammed(programmed),
        slotLabel,
        isSpecialChannel: true,
      };
    }

    return {
      channelNumber,
      slotLabel,
      isSpecialChannel: true,
      isEmptySpecial: true,
      name: '',
      transmit: '',
      receive: '',
      txTone: '',
      rxTone: '',
      toneType: '',
    };
  });
}
