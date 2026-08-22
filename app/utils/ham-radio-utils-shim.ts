export { toHexWords } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/to-hex-words.js';
import { toHexWords } from '../../node_modules/@springfield/ham-radio-utils/dist/utils/to-hex-words.js';

export function formatChannel(channelNumber: number, data: Uint8Array | number[]): string {
  return `${String(channelNumber).padStart(2, ' ')} : ${toHexWords(data)}`;
}
