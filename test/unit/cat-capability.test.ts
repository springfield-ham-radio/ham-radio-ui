import { describe, it } from 'node:test';
import { expect } from 'chai';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { radioSupportsLiveCat } from '../../app/utils/cat-capability.ts';

const cloneRead: RadioProtocolStep[] = [
  {
    description: 'Read memory',
    read: {
      segments: ['channels'],
      send: ['S', '$address', '$chunkSize'],
      expect: ['X', '$address', '$length', '$data'],
    },
  },
];

const kenwoodRead: RadioProtocolStep[] = [
  {
    description: 'Read memories via live CAT',
    catRead: {
      segment: 'channels',
      count: 400,
      recordSize: 32,
      pack: 'kenwood-th-f6',
    },
  },
];

const tmD710CloneRead: RadioProtocolStep[] = [
  {
    description: 'Identify radio (ID TM-D710)',
    send: ['I', 'D', '0x0D'],
    expect: ['I', 'D', ' ', 'T', 'M', '-', 'D', '7', '1', '0', '0x0D'],
  },
  {
    description: 'Read clone blocks',
    read: {
      segments: ['image_lo'],
      send: ['R', '$address', '$chunkSize'],
      expect: ['W', '$address', '$length', '$data'],
    },
  },
];

describe('radioSupportsLiveCat', () => {
  it('should be true when the driver declares Kenwood live control', () => {
    expect(
      radioSupportsLiveCat({
        capabilities: { liveControl: true },
        cat: { protocol: 'kenwood', vfoCount: 2, vfoChannel: true },
      }),
    ).to.equal(true);
  });

  it('should be true when liveControl is set and cat protocol is omitted', () => {
    expect(radioSupportsLiveCat({ capabilities: { liveControl: true } })).to.equal(true);
  });

  it('should be false when liveControl is true but the protocol is not Kenwood', () => {
    expect(
      radioSupportsLiveCat({
        capabilities: { liveControl: true },
        cat: { protocol: 'icom-ci-v' },
      }),
    ).to.equal(false);
  });

  it('should be false when liveControl is false even for Kenwood clone radios', () => {
    expect(
      radioSupportsLiveCat({
        id: { manufacturer: 'Kenwood' },
        capabilities: { liveControl: false },
        readMemory: tmD710CloneRead,
      }),
    ).to.equal(false);
  });

  it('should infer CAT from catRead when liveControl is omitted', () => {
    expect(radioSupportsLiveCat({ readMemory: kenwoodRead, writeMemory: [] })).to.equal(true);
  });

  it('should infer CAT from a Kenwood ID handshake when liveControl is omitted', () => {
    expect(radioSupportsLiveCat({ readMemory: tmD710CloneRead, writeMemory: [] })).to.equal(true);
  });

  it('should infer CAT from manufacturer Kenwood when liveControl is omitted', () => {
    expect(
      radioSupportsLiveCat({
        id: { manufacturer: 'Kenwood' },
        readMemory: cloneRead,
        writeMemory: cloneRead,
      }),
    ).to.equal(true);
  });

  it('should be false for clone-only protocols when liveControl is omitted', () => {
    expect(radioSupportsLiveCat({ readMemory: cloneRead, writeMemory: cloneRead })).to.equal(false);
  });

  it('should be false when protocol steps are missing', () => {
    expect(radioSupportsLiveCat({})).to.equal(false);
  });
});
