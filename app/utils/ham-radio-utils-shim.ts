export { toHexWords } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/to-hex-words.js';
export { BandPlan } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/band-plan.js';
export { operatorClassToLicenseClassId } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/operator-class-mapper.js';
export {
  decodeMemoryMap,
  encodeMemoryMap,
  parseSeekAddress,
  radioAddressToBufferOffset,
} from '../../node_modules/@springfield/ham-radio-utils/dist/memory/memory-map-codec.js';
export {
  collectMemoryMapUiFields,
  groupMemoryMapUiFields,
} from '../../node_modules/@springfield/ham-radio-utils/dist/memory/memory-map-ui.js';
export type { RadioMemoryMapUiField } from '../../node_modules/@springfield/ham-radio-utils/dist/memory/memory-map-ui.js';
export { default as licenseClasses } from '../../node_modules/@springfield/ham-radio-utils/dist/db/license-classes.json' with { type: 'json' };
export { default as bands } from '../../node_modules/@springfield/ham-radio-utils/dist/db/bands.json' with { type: 'json' };

import { toHexWords } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/to-hex-words.js';

export function formatChannel(channelNumber: number, data: Uint8Array | number[]): string {
  return `${String(channelNumber).padStart(2, ' ')} : ${toHexWords(data)}`;
}
