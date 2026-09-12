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

  it('should ignore frames while capture is disabled', () => {
    const log = createCatSerialLog();
    log.append('SEND', Uint8Array.from(Buffer.from('ID\r', 'ascii')));
    log.setEnabled(false);
    log.append('SEND', Uint8Array.from(Buffer.from('FO 0\r', 'ascii')));

    expect(log.isEnabled()).to.equal(false);
    expect(log.snapshot().entries).to.have.length(1);
    expect(log.snapshot().entries[0]?.description).to.equal('ID\\r');
  });

  it('should resume capturing after capture is enabled', () => {
    const log = createCatSerialLog();
    log.setEnabled(false);
    log.append('SEND', Uint8Array.from(Buffer.from('ID\r', 'ascii')));
    log.setEnabled(true);
    log.append('SEND', Uint8Array.from(Buffer.from('FO 0\r', 'ascii')));

    expect(log.snapshot().entries).to.have.length(1);
    expect(log.snapshot().entries[0]?.description).to.equal('FO 0\\r');
  });

  it('should drop stored frames when cleared', () => {
    const log = createCatSerialLog();
    log.append('SEND', Uint8Array.from(Buffer.from('ID\r', 'ascii')));
    log.clear();

    expect(log.snapshot().metadata.totalEntries).to.equal(0);
    expect(log.snapshot().entries).to.have.length(0);
  });
});
