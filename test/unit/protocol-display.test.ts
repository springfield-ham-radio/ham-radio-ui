import { describe, it } from 'node:test';
import { expect } from 'chai';
import type { RadioMemoryConfig, RadioProtocolStep } from '@springfield/ham-radio-api';
import {
  describeProtocolSteps,
  formatByteToken,
  formatExpect,
  formatProtocolJson,
  formatSerialSummary,
} from '../../app/utils/protocol-display.ts';

const uv5rMemory: RadioMemoryConfig = {
  chunkSize: 64,
  addressSize: 2,
  addressEndianness: 'big',
  segments: {
    channels: { startAddress: 0, endAddress: 6143 },
    settings: { startAddress: 7872, endAddress: 8191 },
  },
};

const uv5rRead: RadioProtocolStep[] = [
  {
    description: 'Send magic number',
    send: ['0x50', '0xBB', '0xFF', '0x20', '0x12', '0x07', '0x25'],
    expect: '0x06',
  },
  {
    description: 'Get radio identifier',
    send: ['0x02'],
    expect: { bytes: 8 },
  },
  {
    description: 'Begin clone operation',
    send: ['0x06'],
    expect: '0x06',
  },
  {
    description: 'Read memory',
    read: {
      segments: ['channels', 'settings'],
      send: ['S', '$address', '$chunkSize'],
      expect: ['X', '$address', '$length', '$data'],
      ack: {
        send: ['0x06'],
        expect: '0x06',
      },
    },
  },
];

const thF6Read: RadioProtocolStep[] = [
  {
    description: 'Wake CAT',
    send: ['0x0D'],
    delay: 150,
  },
  {
    description: 'Identify radio',
    send: ['I', 'D', '0x0D'],
    expect: { until: '0x0D' },
    timeout: 3000,
  },
  {
    description: 'Read memories via live CAT',
    catRead: {
      segment: 'channels',
      count: 400,
      recordSize: 32,
      pack: 'kenwood-th-f6',
      timeout: 2000,
      interCommandDelayMs: 20,
    },
  },
];

describe('protocol-display', () => {
  describe('formatByteToken', () => {
    it('should render hex bytes as two-digit uppercase labels', () => {
      expect(formatByteToken('0x50')).to.deep.include({ kind: 'hex', label: '50' });
      expect(formatByteToken(32)).to.deep.include({ kind: 'hex', label: '20' });
    });

    it('should name well-known control bytes', () => {
      expect(formatByteToken('0x06')).to.deep.include({ kind: 'control', label: 'ACK' });
      expect(formatByteToken('0x0D')).to.deep.include({ kind: 'control', label: 'CR' });
    });

    it('should render single-character opcodes as ASCII', () => {
      expect(formatByteToken('S')).to.deep.include({ kind: 'ascii', label: 'S' });
    });

    it('should keep $-placeholders distinct from literals', () => {
      expect(formatByteToken('$address')).to.deep.include({ kind: 'placeholder', label: '$address' });
      expect(formatByteToken('$data')).to.deep.include({ kind: 'placeholder', label: '$data' });
    });
  });

  describe('formatExpect', () => {
    it('should describe a fixed-length opaque reply', () => {
      const message = formatExpect({ bytes: 8 });

      expect(message.direction).to.equal('expect');
      expect(message.annotation).to.equal('any 8 bytes');
      expect(message.tokens[0]).to.deep.include({ kind: 'length', label: '8 bytes' });
    });

    it('should describe a delimiter-terminated reply', () => {
      const message = formatExpect({ until: '0x0D' });

      expect(message.direction).to.equal('expect');
      expect(message.annotation).to.equal('until CR');
    });
  });

  describe('describeProtocolSteps', () => {
    it('should turn a clone read into handshake exchanges plus a chunk loop', () => {
      const steps = describeProtocolSteps(uv5rRead, uv5rMemory);

      expect(steps).to.have.length(4);
      expect(steps[0]?.kind).to.equal('exchange');
      expect(steps[0]?.title).to.equal('Send magic number');
      expect(steps[0]?.messages[0]?.direction).to.equal('send');
      expect(steps[0]?.messages[0]?.tokens.map((token) => token.label)).to.deep.equal([
        '50',
        'BB',
        'FF',
        '20',
        '12',
        '07',
        '25',
      ]);
      expect(steps[0]?.messages[1]?.tokens.map((token) => token.label)).to.deep.equal(['ACK']);

      const loop = steps[3];
      expect(loop?.kind).to.equal('read');
      expect(loop?.loop?.label).to.equal('Each chunk');
      expect(loop?.loop?.detail).to.include('64-byte');
      expect(loop?.loop?.detail).to.include('channels');
      expect(loop?.loop?.detail).to.include('settings');
      expect(loop?.messages.map((message) => message.direction)).to.deep.equal(['send', 'expect', 'send', 'expect']);
      expect(loop?.messages[0]?.tokens.map((token) => token.label)).to.deep.equal(['S', '$address', '$chunkSize']);
      expect(loop?.messages[1]?.tokens.map((token) => token.label)).to.deep.equal(['X', '$address', '$length', '$data']);
    });

    it('should turn a clone write into a chunk loop with payload on send', () => {
      const steps = describeProtocolSteps(
        [
          {
            description: 'Write memory',
            write: {
              segments: ['channels', 'settings'],
              chunkSize: 16,
              delay: 50,
              skip: [
                { startAddress: 3312, endAddress: 3327 },
                { startAddress: 3568, endAddress: 3583 },
              ],
              send: ['X', '$address', '$length', '$data'],
              expect: '0x06',
            },
          },
        ],
        uv5rMemory,
      );

      const loop = steps[0];
      expect(loop?.kind).to.equal('write');
      expect(loop?.loop?.label).to.equal('Each chunk');
      expect(loop?.loop?.detail).to.include('16-byte');
      expect(loop?.notes).to.include('Wait 50 ms after each block');
      expect(loop?.notes.some((note) => note.includes('3312–3327'))).to.equal(true);
      expect(loop?.messages[0]?.tokens.map((token) => token.label)).to.deep.equal([
        'X',
        '$address',
        '$length',
        '$data',
      ]);
      expect(loop?.messages[1]?.tokens.map((token) => token.label)).to.deep.equal(['ACK']);
    });

    it('should show CAT write commands per channel', () => {
      const steps = describeProtocolSteps(
        [
          {
            description: 'Write memories via live CAT',
            catWrite: {
              segment: 'channels',
              count: 400,
              recordSize: 32,
              pack: 'kenwood-th-f6',
              timeout: 2000,
              interCommandDelayMs: 20,
            },
          },
        ],
        {
          chunkSize: 32,
          addressSize: 2,
          addressEndianness: 'big',
          segments: {
            channels: { startAddress: 0, endAddress: 12799 },
          },
        },
      );

      const loop = steps[0];
      expect(loop?.kind).to.equal('catWrite');
      expect(loop?.loop?.label).to.equal('Each channel');
      expect(loop?.messages.some((message) => message.tokens.some((token) => token.label.includes('MW')))).to.equal(
        true,
      );
      expect(loop?.messages.some((message) => message.tokens.some((token) => token.label.includes('MR')))).to.equal(
        false,
      );
      expect(loop?.messages.some((message) => message.tokens.some((token) => token.label.includes('MNA')))).to.equal(
        true,
      );
    });

    it('should show CAT wake, identify, and a per-channel command loop', () => {
      const steps = describeProtocolSteps(thF6Read, {
        chunkSize: 32,
        addressSize: 2,
        addressEndianness: 'big',
        segments: {
          channels: { startAddress: 0, endAddress: 12799 },
        },
      });

      expect(steps[0]?.notes).to.include('Wait 150 ms after send');
      expect(steps[1]?.messages[1]?.annotation).to.equal('until CR');

      const loop = steps[2];
      expect(loop?.kind).to.equal('catRead');
      expect(loop?.loop?.label).to.equal('Each channel');
      expect(loop?.loop?.detail).to.include('400');
      expect(loop?.loop?.detail).to.include('kenwood-th-f6');
      expect(loop?.notes).to.include('Timeout 2000 ms');
      expect(loop?.notes).to.include('20 ms between commands');
      expect(loop?.messages.some((message) => message.tokens.some((token) => token.label.includes('MR')))).to.equal(
        true,
      );
      expect(loop?.messages.some((message) => message.tokens.some((token) => token.label.includes('MNA')))).to.equal(
        true,
      );
    });
  });

  describe('formatProtocolJson', () => {
    it('should pretty-print the raw protocol steps', () => {
      const json = formatProtocolJson(uv5rRead);

      expect(json).to.include('"description": "Send magic number"');
      expect(json).to.include('"read"');
    });
  });

  describe('formatSerialSummary', () => {
    it('should summarize baud and line settings', () => {
      expect(
        formatSerialSummary({
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          rts: false,
          dtr: true,
        }),
      ).to.equal('9600 baud · 8N1 · DTR on · RTS off');
    });
  });
});
