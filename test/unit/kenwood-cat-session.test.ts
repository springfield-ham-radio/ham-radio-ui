import { describe, it } from 'node:test';
import { expect } from 'chai';
import {
  KenwoodCatSession,
  type CatTransport,
} from '../../app/utils/kenwood-cat-session.ts';
import { kenwoodCatProfileFromConfig } from '../../app/utils/kenwood-cat-profile.ts';
import { stationLogDraftFromCatVfo } from '../../app/utils/cat-log-draft.ts';

class FakeCatTransport implements CatTransport {
  readonly sent: string[] = [];
  closed = false;
  prebuffered: string[] = [];
  private readonly replies: string[] = [];

  enqueue(...lines: string[]): void {
    this.replies.push(...lines);
  }

  discardBuffered(): void {
    this.prebuffered = [];
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.sent.push(Buffer.from(bytes).toString('ascii').replace(/\r/g, ''));
  }

  async readLine(_timeoutMs: number): Promise<string> {
    const pending = this.prebuffered.shift();

    if (pending !== undefined) {
      return pending;
    }

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

const FO_A = 'FO 0,0144600000,0,0,0,0,0,0,08,08,000,00000000,0';
const FO_B = 'FO 1,0440000000,0,0,0,0,0,0,08,08,000,00000000,0';
const FO_A_146520 = 'FO 0,0146520000,0,0,0,0,0,0,08,08,000,00000000,0';
const FO_A_NFM = 'FO 0,0144600000,0,0,0,0,0,0,08,08,000,00000000,1';

const mobileProfile = kenwoodCatProfileFromConfig({
  protocol: 'kenwood',
  vfoCount: 2,
  frequencyCommands: ['FO'],
  frequencyWidth: 10,
  vfoChannel: true,
  modes: ['FM', 'NFM', 'AM'],
  powers: ['High', 'Medium', 'Low'],
  bandControl: true,
  powerBandIndex: true,
});

const handheldProfile = kenwoodCatProfileFromConfig({
  protocol: 'kenwood',
  wakeCr: true,
  vfoCount: 1,
  frequencyCommands: ['FQ', 'FO'],
  frequencyWidth: 11,
  modes: ['FM', 'WFM', 'AM', 'LSB', 'USB', 'CW'],
  powers: ['High', 'Medium', 'Low'],
  modeCommand: 'MD',
});

describe('KenwoodCatSession', () => {
  it('should identify a dual-band radio and poll both VFOs', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID TM-D710', 'BC 0,0', FO_A, 'PC 0,0', FO_B, 'PC 1,1');

    const session = new KenwoodCatSession({
      transport,
      profile: mobileProfile,
      delayMs: 0,
    });
    const status = await session.connect();

    expect(transport.sent).to.deep.equal(['ID', 'BC', 'FO 0', 'PC 0', 'FO 1', 'PC 1']);
    expect(status.radioIdentity).to.equal('TM-D710');
    expect(status.dualBand).to.equal(true);
    expect(status.controlBand).to.equal(0);
    expect(status.powers).to.deep.equal(['High', 'Medium', 'Low']);
    expect(status.vfos).to.have.length(2);
    expect(status.vfos[0]).to.include({
      band: 0,
      label: 'A',
      frequencyHz: 144_600_000,
      mode: 'FM',
      power: 'High',
    });
    expect(status.vfos[1]).to.include({
      band: 1,
      label: 'B',
      frequencyHz: 440_000_000,
      mode: 'FM',
      power: 'Medium',
    });
  });

  it('should fall back to the next frequency command when the first is rejected', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID TH-F6', '?', 'FO 00146200000', 'MD 4', 'PC 1');

    const session = new KenwoodCatSession({
      transport,
      profile: handheldProfile,
      delayMs: 0,
    });
    const status = await session.connect();

    expect(transport.sent[0]).to.equal('');
    expect(transport.sent).to.deep.equal(['', 'ID', 'FQ', 'FO', 'MD', 'PC']);
    expect(status.radioIdentity).to.equal('TH-F6');
    expect(status.dualBand).to.equal(false);
    expect(status.vfos).to.have.length(1);
    expect(status.vfos[0]).to.include({
      frequencyHz: 146_200_000,
      mode: 'USB',
      power: 'Medium',
    });
  });

  it('should set frequency, mode, power, and PTT', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue(
      'ID TM-D710',
      'BC 0,0',
      FO_A,
      'PC 0,0',
      FO_B,
      'PC 1,1',
      FO_A,
      FO_A_146520,
      FO_A_146520,
      FO_A_NFM,
      'PC 0,1',
      'TX',
      'RX',
    );

    const session = new KenwoodCatSession({
      transport,
      profile: mobileProfile,
      delayMs: 0,
    });
    await session.connect();
    await session.setFrequency(0, 146_520_000);
    await session.setMode(0, 'NFM');
    await session.setPower(0, 'Medium');
    const transmitting = await session.setTransmit(true);
    const receiving = await session.setTransmit(false);

    expect(transport.sent).to.include('FO 0,0146520000,0,0,0,0,0,0,08,08,000,00000000,0');
    expect(transport.sent).to.include('FO 0,0146520000,0,0,0,0,0,0,08,08,000,00000000,1');
    expect(transport.sent).to.include('PC 0,1');
    expect(transport.sent).to.include('TX');
    expect(transport.sent).to.include('RX');
    expect(transmitting.transmitting).to.equal(true);
    expect(receiving.transmitting).to.equal(false);
  });

  it('should close the transport on disconnect', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID TM-D710', 'BC 0,0', FO_A, 'PC 0,0', FO_B, 'PC 1,1');

    const session = new KenwoodCatSession({
      transport,
      profile: mobileProfile,
      delayMs: 0,
    });
    await session.connect();
    await session.disconnect();

    expect(transport.closed).to.equal(true);
    expect(session.status).to.equal(undefined);
  });

  it('should discard a wake CR NAK before reading ID', async () => {
    const transport = new FakeCatTransport();
    transport.prebuffered.push('?', '');
    transport.enqueue('ID TH-F6', '?', 'FO 00146200000', 'MD 4', 'PC 1');

    const session = new KenwoodCatSession({
      transport,
      profile: handheldProfile,
      delayMs: 0,
    });
    const status = await session.connect();

    expect(status.radioIdentity).to.equal('TH-F6');
    expect(transport.prebuffered).to.deep.equal([]);
  });

  it('should skip a command echo and use the ID payload', async () => {
    const transport = new FakeCatTransport();
    transport.enqueue('ID', 'ID TM-D710', 'BC 0,0', FO_A, 'PC 0,0', FO_B, 'PC 1,1');

    const session = new KenwoodCatSession({
      transport,
      profile: mobileProfile,
      delayMs: 0,
    });
    const status = await session.connect();

    expect(status.radioIdentity).to.equal('TM-D710');
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
        power: 'High',
      }),
    ).to.include({
      frequencyHz: 146_520_000,
      mode: 'FM',
      band: '2m',
    });
  });
});
