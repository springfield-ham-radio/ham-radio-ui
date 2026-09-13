import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION,
  isCatMemoryTransferBlocked,
  markCatBusySerialPorts,
  writeToRadioTooltip,
} from '../../app/utils/cat-memory-transfer.ts';

describe('CAT memory transfer guard', () => {
  it('should block only the serial port CAT holds', () => {
    const lockedPorts = ['/dev/cu.usbserial-cat'];

    expect(isCatMemoryTransferBlocked([], '/dev/cu.usbserial-cat')).to.equal(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, undefined)).to.equal(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, '/dev/cu.usbserial-other')).to.equal(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, '/dev/cu.usbserial-cat')).to.equal(true);
  });

  it('should label CAT-busy ports so a second adapter stays selectable', () => {
    const marked = markCatBusySerialPorts(
      [
        { label: 'usbserial-cat', value: '/dev/cu.usbserial-cat' },
        { label: 'usbserial-other', value: '/dev/cu.usbserial-other' },
      ],
      ['/dev/cu.usbserial-cat'],
    );

    expect(marked[0]).to.deep.include({
      value: '/dev/cu.usbserial-cat',
      label: 'usbserial-cat (CAT)',
      disabled: true,
    });
    expect(marked[1]).to.deep.equal({
      label: 'usbserial-other',
      value: '/dev/cu.usbserial-other',
    });
  });

  it('should omit CAT-busy ports when connecting another session', () => {
    const available = markCatBusySerialPorts(
      [
        { label: 'usbserial-cat', value: '/dev/cu.usbserial-cat' },
        { label: 'usbserial-other', value: '/dev/cu.usbserial-other' },
      ],
      ['/dev/cu.usbserial-cat'],
      { omitBusy: true },
    );

    expect(available).to.deep.equal([{ label: 'usbserial-other', value: '/dev/cu.usbserial-other' }]);
  });

  it('should explain Write when memory is missing or unsupported', () => {
    expect(
      writeToRadioTooltip({
        hasLoadedMemory: false,
        writeSupported: true,
      }),
    ).to.equal('Open a memory file or import from a radio first');

    expect(
      writeToRadioTooltip({
        hasLoadedMemory: true,
        writeSupported: false,
        radioName: 'Kenwood TM-D710A',
      }),
    ).to.equal('Kenwood TM-D710A does not support writing memory');

    expect(
      writeToRadioTooltip({
        hasLoadedMemory: true,
        writeSupported: true,
      }),
    ).to.equal('Write to Radio');
  });

  it('should keep the CAT busy-port copy specific to that adapter', () => {
    expect(CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION).to.include('another serial port');
  });
});
