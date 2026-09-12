import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION,
  importFromRadioTooltip,
  isCatMemoryTransferBlocked,
  writeToRadioTooltip,
} from '../../app/utils/cat-memory-transfer.ts';

describe('CAT memory transfer guard', () => {
  it('should block import and write when CAT holds a serial port', () => {
    expect(isCatMemoryTransferBlocked(undefined)).to.equal(false);
    expect(isCatMemoryTransferBlocked('')).to.equal(false);
    expect(isCatMemoryTransferBlocked('/dev/cu.usbserial')).to.equal(true);
  });

  it('should explain Import is blocked while CAT is connected', () => {
    expect(importFromRadioTooltip(false)).to.equal('Import from Radio');
    expect(importFromRadioTooltip(true)).to.equal(CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION);
  });

  it('should prefer the CAT warning over missing memory on Write', () => {
    expect(
      writeToRadioTooltip({
        catBlocked: true,
        hasLoadedMemory: false,
        writeSupported: true,
      }),
    ).to.equal(CAT_MEMORY_TRANSFER_BLOCKED_DESCRIPTION);

    expect(
      writeToRadioTooltip({
        catBlocked: false,
        hasLoadedMemory: false,
        writeSupported: true,
      }),
    ).to.equal('Open a memory file or import from a radio first');

    expect(
      writeToRadioTooltip({
        catBlocked: false,
        hasLoadedMemory: true,
        writeSupported: false,
        radioName: 'Kenwood TM-D710A',
      }),
    ).to.equal('Kenwood TM-D710A does not support writing memory');

    expect(
      writeToRadioTooltip({
        catBlocked: false,
        hasLoadedMemory: true,
        writeSupported: true,
      }),
    ).to.equal('Write to Radio');
  });
});
