import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  SNIFFER_CAPTURE_FILE_KIND,
  SNIFFER_CAPTURE_FILE_VERSION,
  defaultSnifferCaptureFileName,
  serializeSnifferCaptureFile,
  snifferCaptureEntryCount,
} from '../../app/utils/sniffer-capture.ts';
import type { SnifferPacket, SnifferStatus } from '../../app/utils/sniffer-api.ts';

const status: SnifferStatus = {
  running: false,
  computerPort: '/dev/tty.usbserial-A',
  radioPort: '/dev/tty.usbserial-B',
  baudRate: 9600,
  startedAt: '2026-08-28T19:00:00.000Z',
  logFile: 'radio-sniffer.json',
  packetCount: 1,
};

const packets: SnifferPacket[] = [
  {
    id: 1,
    timestamp: '000.010',
    elapsedMs: 10,
    direction: 'COMPUTER->RADIO',
    data: [0x50, 0xbb],
  },
];

const log = {
  metadata: {
    startTime: '2026-08-28T19:00:00.000Z',
    endTime: '2026-08-28T19:00:02.000Z',
    totalEntries: 1,
    version: '1.0.0',
  },
  entries: [{ timestamp: '000.010', elapsedMs: 10, direction: 'SEND' as const, data: [0x50, 0xbb] }],
};

describe('defaultSnifferCaptureFileName', () => {
  it('should include a filesystem-safe timestamp', () => {
    expect(defaultSnifferCaptureFileName(new Date('2026-08-28T19:44:01.250Z'))).to.equal(
      'sniffer-capture-2026-08-28T19-44-01-250Z.json',
    );
  });
});

describe('serializeSnifferCaptureFile', () => {
  it('should wrap sniffer status, packets, and SerialLogger data for agent review', () => {
    const json = serializeSnifferCaptureFile({
      status,
      packets,
      log,
      savedAt: new Date('2026-08-28T19:45:00.000Z'),
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.kind).to.equal(SNIFFER_CAPTURE_FILE_KIND);
    expect(parsed.version).to.equal(SNIFFER_CAPTURE_FILE_VERSION);
    expect(parsed.computerPort).to.equal('/dev/tty.usbserial-A');
    expect(parsed.radioPort).to.equal('/dev/tty.usbserial-B');
    expect(parsed.baudRate).to.equal(9600);
    expect(parsed.savedAt).to.equal('2026-08-28T19:45:00.000Z');
    expect(parsed.packets).to.deep.equal(packets);
    expect(parsed.log).to.deep.equal(log);
  });
});

describe('snifferCaptureEntryCount', () => {
  it('should prefer SerialLogger entries when present', () => {
    expect(snifferCaptureEntryCount(log, packets)).to.equal(1);
  });

  it('should fall back to packet count when the log is missing', () => {
    expect(snifferCaptureEntryCount(undefined, packets)).to.equal(1);
  });
});
