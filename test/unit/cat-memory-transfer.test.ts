import { describe, expect, it } from 'vitest';
import {
  CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION,
  isCatMemoryTransferBlocked,
  markCatBusySerialPorts,
  writeToRadioTooltip,
} from '../../app/utils/cat-memory-transfer.ts';

describe('CAT memory transfer guard', () => {
  it('should block only the serial port CAT holds', () => {
    const lockedPorts = ['/dev/cu.usbserial-cat'];

    expect(isCatMemoryTransferBlocked([], '/dev/cu.usbserial-cat')).toBe(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, undefined)).toBe(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, '/dev/cu.usbserial-other')).toBe(false);
    expect(isCatMemoryTransferBlocked(lockedPorts, '/dev/cu.usbserial-cat')).toBe(true);
  });

  it('should label CAT-busy ports so a second adapter stays selectable', () => {
    const marked = markCatBusySerialPorts(
      [
        { label: 'usbserial-cat', value: '/dev/cu.usbserial-cat' },
        { label: 'usbserial-other', value: '/dev/cu.usbserial-other' },
      ],
      ['/dev/cu.usbserial-cat'],
    );

    expect(marked[0]).toMatchObject({
      value: '/dev/cu.usbserial-cat',
      label: 'usbserial-cat (CAT)',
      disabled: true,
    });
    expect(marked[1]).toEqual({
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

    expect(available).toEqual([{ label: 'usbserial-other', value: '/dev/cu.usbserial-other' }]);
  });

  it('should explain Write when memory is missing or unsupported', () => {
    expect(
      writeToRadioTooltip({
        hasLoadedMemory: false,
        writeSupported: true,
      }),
    ).toBe('Open a memory file or import from a radio first');

    expect(
      writeToRadioTooltip({
        hasLoadedMemory: true,
        writeSupported: false,
        radioName: 'Kenwood TM-D710A',
      }),
    ).toBe('Kenwood TM-D710A does not support writing memory');

    expect(
      writeToRadioTooltip({
        hasLoadedMemory: true,
        writeSupported: true,
      }),
    ).toBe('Write to Radio');
  });

  it('should keep the CAT busy-port copy specific to that adapter', () => {
    expect(CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION).toContain('another serial port');
  });
});
