import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  KenwoodCatSession,
  type CatTransport,
} from '../../app/utils/kenwood-cat-session.ts';
import { stationLogDraftFromCatVfo } from '../../app/utils/cat-log-draft.ts';

class FakeCatTransport implements CatTransport {
  readonly sent: string[] = [];
  closed = false;
  private readonly replies: string[] = [];

  enqueue(...lines: string[]): void {
    this.replies.push(...lines);
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.sent.push(Buffer.from(bytes).toString('ascii').replace(/\r/g, ''));
  }

  async readLine(_timeoutMs: number): Promise<string> {
    const next = this.replies.shift();

    if (next === undefined) {
      throw new Error('CAT reply timed out');
    }

    return next;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe('KenwoodCatSession', () => {
  it('should identify a dual-band radio and poll both VFOs', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue(
      'ID TM-D710',
      'BC 0',
      'FQ 00144600000,0',
      'MD 0',
      'PC 0',
      'BC 1',
      'FQ 00440000000,1',
      'MD 0',
      'PC 2',
      'BC 0',
    );

    const session = new KenwoodCatSession({
      transport,
      dialect: 'fm-mobile',
      delayMs: 0,
    });
    const status = await session.connect();

    expect(transport.sent[0]).to.equal('');
    expect(transport.sent).to.include('ID');
    expect(status.radioIdentity).to.equal('TM-D710');
    expect(status.dualBand).to.equal(true);
    expect(status.controlBand).to.equal(0);
    expect(status.vfos).to.have.length(2);
    expect(status.vfos[0]).to.include({
      band: 0,
      label: 'A',
      frequencyHz: 144_600_000,
      mode: 'FM',
      power: 'high',
    });
    expect(status.vfos[1]).to.include({
      band: 1,
      label: 'B',
      frequencyHz: 440_000_000,
      mode: 'FM',
      power: 'low',
    });
  });

  it('should treat a rejected BC as a single-VFO radio and fall back to FO', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID TH-F6', '?', '?', 'FO 00146200000', 'MD 4', 'PC 1');

    const session = new KenwoodCatSession({
      transport,
      dialect: 'th-f6',
      delayMs: 0,
    });
    const status = await session.connect();

    expect(status.radioIdentity).to.equal('TH-F6');
    expect(status.dualBand).to.equal(false);
    expect(status.vfos).to.have.length(1);
    expect(status.vfos[0]).to.include({
      frequencyHz: 146_200_000,
      mode: 'USB',
      power: 'medium',
    });
  });

  it('should set frequency, mode, power, and PTT', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue(
      'ID TM-D710',
      'BC 0',
      'FQ 00144600000,0',
      'MD 0',
      'PC 0',
      'BC 1',
      'FQ 00440000000,1',
      'MD 0',
      'PC 2',
      'BC 0',
      'FQ 00146520000,0',
      'MD 0,0',
      'PC 0,1',
      'TX',
      'RX',
    );

    const session = new KenwoodCatSession({
      transport,
      dialect: 'fm-mobile',
      delayMs: 0,
    });
    await session.connect();
    await session.setFrequency(0, 146_520_000);
    await session.setMode(0, 'FM');
    await session.setPower(0, 'medium');
    const transmitting = await session.setTransmit(true);
    const receiving = await session.setTransmit(false);

    expect(transport.sent).to.include('FQ 00146520000,0');
    expect(transport.sent).to.include('MD 0,0');
    expect(transport.sent).to.include('PC 0,1');
    expect(transport.sent).to.include('TX');
    expect(transport.sent).to.include('RX');
    expect(transmitting.transmitting).to.equal(true);
    expect(receiving.transmitting).to.equal(false);
  });

  it('should close the transport on disconnect', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID TM-D710', '?', 'FQ 00144600000', 'MD 0', 'PC 0');

    const session = new KenwoodCatSession({
      transport,
      dialect: 'fm-mobile',
      delayMs: 0,
    });
    await session.connect();
    await session.disconnect();

    expect(transport.closed).to.equal(true);
    expect(session.status).to.equal(undefined);
  });
});

describe('stationLogDraftFromCatVfo', () => {
  it('should copy frequency and mode for a new QSO', () => {
    expect(
      stationLogDraftFromCatVfo({
        band: 0,
        label: 'A',
        frequencyHz: 146_520_000,
        mode: 'FM',
        power: 'high',
      }),
    ).to.include({
      frequencyHz: 146_520_000,
      mode: 'FM',
      band: '2m',
    });
  });
});
