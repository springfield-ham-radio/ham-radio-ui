import { describe, it } from 'node:test';
import { expect } from 'chai';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import {
  SERIAL_LOG_FILE_KIND,
  SERIAL_LOG_FILE_VERSION,
  defaultSerialLogFileName,
  serializeSerialLogFile,
} from '../../app/utils/serial-log-file.ts';

const radioId: RadioId = {
  model: RadioModelId('baofeng-uv5r'),
  name: 'Baofeng UV-5R',
  manufacturer: 'Baofeng',
};

const log = {
  metadata: {
    startTime: '2026-08-22T19:00:00.000Z',
    endTime: '2026-08-22T19:00:02.000Z',
    totalEntries: 2,
    version: '1.0.0',
  },
  entries: [
    { timestamp: '000.010', elapsedMs: 10, direction: 'SEND' as const, data: [0x50, 0xbb] },
    { timestamp: '000.025', elapsedMs: 25, direction: 'RECV' as const, data: [0x06] },
  ],
};

describe('defaultSerialLogFileName', () => {
  it('includes the radio model, operation, and a filesystem-safe timestamp', () => {
    const timestamp = new Date('2026-08-22T19:44:01.250Z');
    const fileName = defaultSerialLogFileName('write', radioId, timestamp);

    expect(fileName).to.equal('baofeng-uv5r-write-serial-2026-08-22T19-44-01-250Z.json');
  });

  it('falls back to a generic model when no radio is loaded', () => {
    const timestamp = new Date('2026-08-22T19:44:01.250Z');
    const fileName = defaultSerialLogFileName('import', undefined, timestamp);

    expect(fileName).to.equal('radio-import-serial-2026-08-22T19-44-01-250Z.json');
  });
});

describe('serializeSerialLogFile', () => {
  it('wraps driver serial I/O with operation metadata', () => {
    const json = serializeSerialLogFile({
      operation: 'write',
      radioId,
      serialPortPath: '/dev/cu.usbserial-0001',
      log,
    });
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.kind).to.equal(SERIAL_LOG_FILE_KIND);
    expect(parsed.version).to.equal(SERIAL_LOG_FILE_VERSION);
    expect(parsed.operation).to.equal('write');
    expect(parsed.serialPortPath).to.equal('/dev/cu.usbserial-0001');
    expect(parsed.radioId).to.deep.equal({
      model: 'baofeng-uv5r',
      name: 'Baofeng UV-5R',
      manufacturer: 'Baofeng',
    });
    expect(parsed.log).to.deep.equal(log);
  });
});
