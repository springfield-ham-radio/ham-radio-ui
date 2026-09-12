import { describe, it } from 'node:test';
import { expect } from 'chai';
import { asciiPreviewFromBytes, createCatSerialLog } from '../../app/utils/cat-serial-log.ts';
import { snifferPacketsFromSerialLog } from '../../app/utils/sniffer-capture.ts';

describe('asciiPreviewFromBytes', () => {
  it('should show Kenwood CAT lines with CR escapes', () => {
    expect(asciiPreviewFromBytes([0x49, 0x44, 0x0d])).to.equal('ID\\r');
    expect(asciiPreviewFromBytes([0x3f, 0x0d])).to.equal('?\\r');
  });
});

describe('createCatSerialLog', () => {
  it('should snapshot SEND and RECV frames for the Radio debug viewer', () => {
    const log = createCatSerialLog(1_000);
    log.append('SEND', Uint8Array.of(0x0d));
    log.append('RECV', Uint8Array.of(0x3f, 0x0d));
    log.append('SEND', Uint8Array.from(Buffer.from('ID\r', 'ascii')));

    const snapshot = log.snapshot();
    expect(snapshot.metadata.totalEntries).to.equal(3);
    expect(snapshot.entries[0]).to.include({ direction: 'SEND', description: '\\r' });
    expect(snapshot.entries[1]).to.include({ direction: 'RECV', description: '?\\r' });
    expect(snapshot.entries[2]?.data).to.deep.equal([0x49, 0x44, 0x0d]);

    const packets = snifferPacketsFromSerialLog(snapshot);
    expect(packets).to.have.length(3);
    expect(packets[0]?.direction).to.equal('COMPUTER->RADIO');
    expect(packets[1]?.direction).to.equal('RADIO->COMPUTER');
  });

  it('should ignore empty writes', () => {
    const log = createCatSerialLog();
    log.append('SEND', new Uint8Array());
    expect(log.snapshot().entries).to.have.length(0);
  });
});
