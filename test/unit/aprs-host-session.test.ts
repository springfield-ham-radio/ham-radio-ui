import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui } from '../../app/utils/aprs-ax25.ts';
import { encodeKissData } from '../../app/utils/aprs-kiss.ts';
import { createAprsHostSession, hostListenNote, type AprsHostBytePort } from '../../app/utils/aprs-host-session.ts';
import { APRS_COMMAND_INTERRUPT, APRS_KISS_ON_COMMAND, APRS_RESTART_COMMAND } from '../../app/utils/aprs-command.ts';
import { aprsHostSerialOpenOptions, aprsOpenKeepsIncoming, aprsSerialOpenOptions } from '../../app/utils/aprs-serial-options.ts';
import { APRS_TRACE_CAP, escapeSerialText, formatTrace, APRS_HOST_TRACE_FIXTURE } from '../../app/utils/aprs-serial-trace.ts';
import { APRS_MESSAGE_RETRY_MS, encodeAprsMessageFrame } from '../../app/utils/aprs-message.ts';
import { aprsHoldPaths } from '../../app/utils/aprs-session.ts';

function fakePort(): { port: AprsHostBytePort; writes: Uint8Array[]; push: (chunk: Uint8Array) => void } {
  const writes: Uint8Array[] = [];
  let onData: ((chunk: Uint8Array) => void) | undefined;
  const port: AprsHostBytePort = {
    isOpen: true,
    on(event, handler) {
      if (event === 'data') {
        onData = handler as (chunk: Uint8Array) => void;
      }
    },
    off() {
      onData = undefined;
    },
    close() {
      port.isOpen = false;
    },
    write(bytes) {
      writes.push(bytes);
    },
  };

  return {
    port,
    writes,
    push(chunk) {
      onData?.(chunk);
    },
  };
}

function hexBytes(text: string): Uint8Array {
  return Uint8Array.from(text.trim().split(/\s+/u).map((byte) => Number.parseInt(byte, 16)));
}

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const draft = { mine: 'N0TST', to: 'K5KTF-4', text: 'Hello' };

async function confirmKiss(session: ReturnType<typeof createAprsHostSession>, fake: ReturnType<typeof fakePort>): Promise<void> {
  const heard = canonicalAx25Call('N0HRD');
  const ax25 = heard ? encodeAx25Ui(heard, '>Heard') : undefined;
  const frame = ax25 ? encodeKissData(ax25) : undefined;

  if (!frame) {
    throw new Error('confirm frame');
  }

  fake.push(frame);
  await settle();
  expect(session.snapshot().kissConfirmed).toBe(true);
}

describe('APRS host session', () => {
  it('keeps the passive port without flow control and uses software flow for the host', () => {
    expect(aprsHoldPaths({ a: '/dev/monitor' }, { b: '/dev/host' })).toEqual(['/dev/monitor', '/dev/host']);
    expect(aprsSerialOpenOptions('/dev/cu.pg5g', 9600).flowControl).toBe('none');
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).flowControl).toBe('software');
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).rts).toBe(false);
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).dtr).toBe(false);
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).rtsManagedByDriver).toBe(false);
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600, 'none')).toMatchObject({
      flowControl: 'none',
      rts: false,
      dtr: false,
      rtsManagedByDriver: false,
    });
    const hardware = aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600, 'hardware');
    expect(hardware.flowControl).toBe('hardware');
    expect(hardware.dtr).toBe(false);
    expect(hardware.rtsManagedByDriver).toBe(true);
    expect(aprsOpenKeepsIncoming('monitor')).toBe(false);
    expect(aprsOpenKeepsIncoming('host')).toBe(true);
  });

  it('opens and closes without writing until transmit is requested', async () => {
    const session = createAprsHostSession();
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);

    expect(session.snapshot().connected).toBe(true);
    expect(session.snapshot().bytesWritten).toBe(0);
    expect(session.snapshot().hostEnterRequested).toBe(false);
    expect(fake.writes).toEqual([]);

    const held = await session.send({ ...draft });

    expect(held.status).toBe('blocked');
    expect(held.detail).toMatch(/no AX.25 UI frame/);
    expect(fake.writes).toEqual([]);
    expect(session.setAckOptIn(false)).toBeUndefined();
    expect(session.snapshot().ackOptIn).toBe(false);

    fake.push(Uint8Array.from([...'K5KTF-4>APRS,WIDE1-1:Hi\r'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().messages.filter((message) => message.direction === 'in')).toEqual([]);
    expect(session.snapshot().commandTextBytes).toBeGreaterThan(0);
    expect(session.snapshot().trace.some((line) => line.direction === 'rx' && line.text.includes('K5KTF-4'))).toBe(true);
    expect(fake.writes).toEqual([]);

    await session.disconnect();
    expect(session.snapshot().connected).toBe(false);
    expect(fake.writes).toEqual([]);
    expect(fake.port.isOpen).toBe(false);
  });

  it('sends only after the transmit opt-in, then stops on cancel, timeout, and disconnect', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    await session.send({ ...draft });
    expect(fake.writes).toEqual([]);
    const blocked = await session.send({ ...draft });
    expect(blocked.status).toBe('blocked');
    expect(fake.writes).toEqual([]);
    await confirmKiss(session, fake);

    const sent = await session.send({ ...draft });

    expect(sent.status).toBe('waiting-ack');
    expect(sent.messageId).toBe('3');
    expect(fake.writes).toHaveLength(1);

    await session.advance(APRS_MESSAGE_RETRY_MS - 1);
    expect(fake.writes).toHaveLength(1);
    await session.advance(1);
    expect(fake.writes).toHaveLength(2);
    session.cancel(sent.key);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(2);
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('cancelled');

    const again = await session.send({ ...draft, text: 'Second' });
    expect(fake.writes).toHaveLength(3);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(5);
    expect(session.snapshot().messages.find((message) => message.key === again.key)?.status).toBe('timed-out');

    const live = await session.send({ ...draft, text: 'Third' });
    const written = fake.writes.length;
    await session.disconnect();
    expect(session.snapshot().messages.find((message) => message.key === live.key)?.status).toBe('cancelled');
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    await session.advance(APRS_MESSAGE_RETRY_MS * 4);
    expect(fake.writes).toHaveLength(written);
  });

  it('accepts only a matching ack and does not ack unless that opt-in is on', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    const source = canonicalAx25Call('K5KTF-4');
    const spoof = canonicalAx25Call('N0BAD');
    const incoming = source
      ? encodeAprsMessageFrame(source, { addressee: 'N0TST', kind: 'text', text: 'Ping', id: '9' })
      : undefined;

    expect(incoming).toBeDefined();

    if (!incoming || !source || !spoof) {
      return;
    }

    fake.push(incoming);
    await settle();
    expect(session.snapshot().messages.find((message) => message.text === 'Ping')?.addressee).toBe('N0TST');
    expect(session.snapshot().kissConfirmed).toBe(true);
    expect(fake.writes).toEqual([]);

    fake.push(incoming);
    await settle();
    expect(session.snapshot().messages.filter((message) => message.text === 'Ping')).toHaveLength(1);

    session.setIdentity('N0TST');
    expect(session.setAckOptIn(true)).toBeUndefined();
    const second = encodeAprsMessageFrame(source, { addressee: 'N0TST', kind: 'text', text: 'Again', id: '8' });
    const other = encodeAprsMessageFrame(source, { addressee: 'N0ELSE', kind: 'text', text: 'Nope', id: '7' });

    if (!second || !other) {
      return;
    }

    expect(fake.writes).toEqual([]);
    fake.push(second);
    fake.push(other);
    await settle();
    expect(fake.writes).toHaveLength(1);

    const sent = await session.send({ ...draft });
    const before = fake.writes.length;
    const wrong = encodeAprsMessageFrame(spoof, { addressee: 'N0TST', kind: 'ack', id: sent.messageId ?? '', text: '1' });
    const right = encodeAprsMessageFrame(source, { addressee: 'N0TST', kind: 'ack', id: sent.messageId ?? '', text: '1' });

    if (!wrong || !right || !sent.messageId) {
      return;
    }

    fake.push(wrong);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('waiting-ack');
    const beforeAck = session.snapshot().messages.length;
    fake.push(right);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('acked');
    expect(session.snapshot().messages).toHaveLength(beforeAck);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(before);

    const rejected = await session.send({ ...draft, text: 'Reject me' });
    const rej = encodeAprsMessageFrame(source, {
      addressee: 'N0TST',
      kind: 'rej',
      id: rejected.messageId ?? '',
      text: '1',
    });

    if (!rej) {
      return;
    }

    fake.push(rej);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === rejected.key)?.status).toBe('rejected');
  });

  const d74Ack7Fragments = [
    'c0 00 82 a0 96 60 60 68 60 96 8c',
    '6a aa 8c 94 ee ae 92 88 8a 62 40 62 ae 92 88',
    '8a 64 40 63 03 f0 3a 4b 46 35 55 46 4a 2d 31 20',
    '3a 61 63 6b 37 0d c0',
  ].map(hexBytes);
  const d74Ack7 = hexBytes(d74Ack7Fragments.map((chunk) => [...chunk].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')).join(' '));

  it('acks message 7 from the captured TH-D74 frame and does not retry', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(session.snapshot().ackOptIn).toBe(false);

    for (let count = 0; count < 6; count += 1) {
      await session.send({ mine: 'KF5UFJ-1', to: 'KF5UFJ-7', text: 'skip' });
    }

    await confirmKiss(session, fake);
    const sent = await session.send({
      mine: 'KF5UFJ-1',
      to: 'KF5UFJ-7',
      text: 'Hello.  Testing transmit from HamBench.',
    });

    expect(sent.messageId).toBe('7');
    expect(sent.status).toBe('waiting-ack');
    expect(fake.writes).toHaveLength(1);

    for (const chunk of d74Ack7Fragments) {
      fake.push(chunk);
    }

    await settle();
    expect(session.snapshot().kissConfirmed).toBe(true);
    expect(session.snapshot().frames).toBe(2);
    expect(session.snapshot().trace.some((line) => line.note?.includes('AX.25 UI'))).toBe(true);
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('acked');
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(1);

    for (const chunk of d74Ack7Fragments) {
      fake.push(chunk);
    }

    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('acked');
    expect(fake.writes).toHaveLength(1);
  });

  it('does not ack message 7 for the wrong sender, addressee, or id', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);

    for (let count = 0; count < 6; count += 1) {
      await session.send({ mine: 'KF5UFJ-1', to: 'KF5UFJ-7', text: 'skip' });
    }

    await confirmKiss(session, fake);
    const sent = await session.send({
      mine: 'KF5UFJ-1',
      to: 'KF5UFJ-7',
      text: 'Hello.  Testing transmit from HamBench.',
    });
    const wrongSender = Uint8Array.from(d74Ack7);
    wrongSender[wrongSender.indexOf(0xee)] = 0xf0;
    const wrongAddressee = Uint8Array.from(d74Ack7);
    const addresseeSsid = wrongAddressee.lastIndexOf(0x31);
    wrongAddressee[addresseeSsid] = 0x32;
    const wrongId = Uint8Array.from(d74Ack7);
    const idByte = wrongId.lastIndexOf(0x37);
    wrongId[idByte] = 0x38;

    fake.push(wrongSender);
    fake.push(wrongAddressee);
    fake.push(wrongId);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('waiting-ack');
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(2);
  });

  const ownTxWithoutControl = hexBytes(
    'c0 00 82 a0 a4 a6 40 40 e0 96 8c 6a aa 8c 94 63 f0 3a 4b 46 35 55 46 4a 2d 37 20 3a 54 65 73 74 7b 31 c0',
  );

  it('does not send or retry when the only KISS frame is not an AX.25 UI frame', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    fake.push(ownTxWithoutControl.subarray(0, 14));
    fake.push(ownTxWithoutControl.subarray(14, 28));
    fake.push(ownTxWithoutControl.subarray(28));
    await settle();
    expect(session.snapshot().frames).toBe(1);
    expect(session.snapshot().kissConfirmed).toBe(false);
    expect(session.snapshot().trace.some((line) => line.note.includes('AX.25 UI'))).toBe(false);

    const sent = await session.send({ ...draft });
    expect(sent.status).toBe('blocked');
    expect(sent.detail).toMatch(/no AX.25 UI frame/);
    await session.advance(APRS_MESSAGE_RETRY_MS * 3);
    expect(fake.writes).toEqual([]);
  });

  it('acknowledges only a later message addressed to the current callsign', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(session.snapshot().ackOptIn).toBe(false);
    await confirmKiss(session, fake);
    const sent = await session.send({ ...draft });
    expect(fake.writes).toHaveLength(1);
    expect(session.setAckOptIn(false)).toBeUndefined();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('waiting-ack');

    const heard = canonicalAx25Call('K5KTF-4');
    const early = heard
      ? encodeAprsMessageFrame(heard, { addressee: 'N0TST', kind: 'text', text: 'Ping', id: '3' })
      : undefined;
    const later = heard
      ? encodeAprsMessageFrame(heard, { addressee: 'N0TST', kind: 'text', text: 'Next', id: '4' })
      : undefined;
    const elsewhere = heard
      ? encodeAprsMessageFrame(heard, { addressee: 'N0ELSE', kind: 'text', text: 'Other', id: '5' })
      : undefined;
    const theirAck = heard
      ? encodeAprsMessageFrame(heard, { addressee: 'N0TST', kind: 'ack', id: '4', text: '4' })
      : undefined;

    if (!early || !later || !elsewhere || !theirAck) {
      return;
    }

    session.setIdentity('N0TST');
    fake.push(early);
    await settle();
    expect(fake.writes).toHaveLength(1);
    expect(session.setAckOptIn(true)).toBeUndefined();
    await settle();
    expect(fake.writes).toHaveLength(1);
    fake.push(later);
    fake.push(elsewhere);
    fake.push(theirAck);
    await settle();
    expect(fake.writes).toHaveLength(2);
    expect(session.setAckOptIn(false)).toBeUndefined();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('waiting-ack');
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(3);
    await session.disconnect();
    expect(session.snapshot().ackOptIn).toBe(false);
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(session.snapshot().ackOptIn).toBe(false);
  });

  it('stops the queue when cmd: arrives after a UI frame', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    await confirmKiss(session, fake);
    const sent = await session.send({ ...draft });
    expect(fake.writes).toHaveLength(1);
    fake.push(Uint8Array.from([...'cmd:\r\n'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().kissConfirmed).toBe(false);
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('cancelled');
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(1);
    const again = await session.send({ ...draft, text: 'Next' });
    expect(again.status).toBe('blocked');
    expect(fake.writes).toHaveLength(1);
  });

  it('feeds a split KISS position to the station callback and does not write', async () => {
    const seen: Uint8Array[] = [];
    const session = createAprsHostSession({
      allowHardwareTransmit: true,
      onAx25Ui(payload) {
        seen.push(payload);
      },
    });
    const fake = fakePort();
    const source = canonicalAx25Call('K5KTF-4');
    const via = canonicalAx25Call('WIDE1-1');
    const ax25 = source && via ? encodeAx25Ui(source, '!3031.12NI09752.74W&K5KTF TX/RX-iGate', [via]) : undefined;
    const kiss = ax25 ? encodeKissData(ax25) : undefined;

    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(kiss).toBeDefined();
    fake.push(kiss!.subarray(0, 8));
    fake.push(kiss!.subarray(8));
    await settle();

    expect(seen).toHaveLength(1);
    expect(session.snapshot().kissConfirmed).toBe(true);
    expect(fake.writes).toEqual([]);
    const again = await session.send({ ...draft });
    expect(again.status).toBe('waiting-ack');
    expect(fake.writes).toHaveLength(1);
  });

  it('does not write an invalid message', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    const invalid = await session.send({ mine: '1BAD', to: 'K5KTF', text: '' });

    expect(invalid.status).toBe('blocked');
    expect(fake.writes).toEqual([]);
  });

  it('writes the documented KISS enter command only when asked', async () => {
    let time = 1_000;
    const session = createAprsHostSession({ now: () => time });
    const fake = fakePort();

    expect(await session.enterHostKiss()).toMatch(/not open/);
    expect(await session.requestCommandPrompt()).toMatch(/not open/);
    expect(fake.writes).toEqual([]);

    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(await session.enterHostKiss()).toMatch(/No cmd:/);
    expect(fake.writes).toEqual([]);

    fake.push(Uint8Array.from([...'cm'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().commandPhase).toBe('idle');
    expect(await session.enterHostKiss()).toMatch(/No cmd:/);

    expect(await session.requestCommandPrompt()).toBeUndefined();
    expect(fake.writes).toEqual([APRS_COMMAND_INTERRUPT]);
    expect(new TextDecoder().decode(fake.writes[0] ?? new Uint8Array())).not.toContain('\r');
    expect(await session.requestCommandPrompt()).toMatch(/Already waiting/);
    expect(fake.writes).toHaveLength(1);
    expect(session.snapshot().commandPhase).toBe('waiting-prompt');

    fake.push(Uint8Array.from([...'d:'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().commandPhase).toBe('prompt');

    expect(await session.enterHostKiss()).toBeUndefined();
    expect(new TextDecoder().decode(fake.writes[1] ?? new Uint8Array())).toBe(APRS_KISS_ON_COMMAND);
    expect(fake.writes).toHaveLength(2);

    fake.push(Uint8Array.from([...'?EH\r\n'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().commandPhase).toBe('rejected');
    expect(fake.writes).toHaveLength(2);
    expect(session.snapshot().kissConfirmed).toBe(false);
  });

  it('stamps listen notes from the wall clock and does not freeze them', async () => {
    let time = 1_000;
    const session = createAprsHostSession({ now: () => time });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    time = 31_000;
    await session.disconnect();
    const lines = session.snapshot().trace.filter((line) => line.direction === 'note');

    expect(lines[0]?.at).toBe(1_000);
    expect(lines.at(-1)?.at).toBe(31_000);
    expect(formatTrace(lines)).toContain('00:00:01.000');
    expect(formatTrace(lines)).toContain('00:00:31.000');
  });

  it('times out a quiet port without a second write, and drops a prompt on reconnect', async () => {
    let time = 10_000;
    const session = createAprsHostSession({ now: () => time });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    await session.requestCommandPrompt();
    time += 4_999;
    session.poll();
    expect(session.snapshot().commandPhase).toBe('waiting-prompt');
    time += 1;
    session.poll();
    expect(session.snapshot().commandPhase).toBe('timed-out');
    expect(fake.writes).toHaveLength(1);

    await session.requestCommandPrompt();
    fake.push(Uint8Array.from([...'cmd:'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(session.snapshot().commandPhase).toBe('prompt');
    await session.disconnect();
    expect(session.snapshot().commandDetail).toMatch(/not kept/);
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(session.snapshot().commandPhase).toBe('idle');
    expect(await session.enterHostKiss()).toMatch(/Nothing was sent/);
    expect(fake.writes).toHaveLength(2);
  });

  it('does not answer a KISS frame with a carriage return, and sends RESTART only after a second prompt', async () => {
    const session = createAprsHostSession();
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    await session.requestCommandPrompt();
    fake.push(encodeKissData(Uint8Array.from([1, 2, 3])));
    await settle();
    expect(session.snapshot().commandPhase).toBe('kiss-framed');
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]?.includes(0x0d)).toBe(false);

    session.cancelCommand();
    await session.requestCommandPrompt();
    fake.push(Uint8Array.from([...'cmd:'].map((character) => character.charCodeAt(0))));
    await settle();
    await session.enterHostKiss();
    fake.push(Uint8Array.from([...'KISS ON\r\ncmd:'].map((character) => character.charCodeAt(0))));
    await settle();
    await settle();
    expect(new TextDecoder().decode(fake.writes.at(-1) ?? new Uint8Array())).toBe(APRS_RESTART_COMMAND);
    expect(session.snapshot().commandPhase).toBe('restart-sent');
    expect(session.snapshot().kissConfirmed).toBe(false);
  });

  it('keeps a prompt that arrives as the listener is attached, and splits a banner, echo, and error', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const waiting: Uint8Array[] = [];
    let dataListener: ((chunk: Uint8Array) => void) | undefined;
    const writes: Uint8Array[] = [];
    const port = {
      isOpen: true,
      on(event: string, handler: (chunk: Uint8Array) => void) {
        if (event === 'data') {
          dataListener = handler;

          for (const chunk of waiting.splice(0)) {
            handler(chunk);
          }
        }
      },
      off() {
        dataListener = undefined;
      },
      write(bytes: Uint8Array) {
        writes.push(bytes);
      },
      close() {
        this.isOpen = false;
        return Promise.resolve();
      },
    };
    waiting.push(Uint8Array.from([...'Kenwood\r\n'].map((character) => character.charCodeAt(0))));
    await session.connect('/dev/cu.pg5g', async () => port);
    dataListener?.(Uint8Array.from([...'TNC\r\ncmd:'].map((character) => character.charCodeAt(0))));
    dataListener?.(Uint8Array.from([...'KISS'].map((character) => character.charCodeAt(0))));
    dataListener?.(Uint8Array.from([...' ON\r\n?EH\r\n'].map((character) => character.charCodeAt(0))));
    await Promise.resolve();

    const snap = session.snapshot();
    expect(snap.rxChunks).toBe(4);
    expect(snap.commandTextBytes).toBe(snap.rxBytes);
    expect(snap.frames).toBe(0);
    expect(snap.incompleteBytes).toBe(0);
    expect(snap.kissConfirmed).toBe(false);
    expect(snap.trace[0]?.direction).toBe('note');
    expect(snap.trace.map((line) => line.text).join(' ')).toContain('cmd:');
    expect(snap.trace.map((line) => line.text).join(' ')).toContain('?EH');
    expect(writes).toEqual([]);

    const partial = Uint8Array.from([0xc0, 0x00, 0x01]);
    dataListener?.(partial);
    expect(session.snapshot().incompleteBytes).toBe(2);
    expect(session.snapshot().frames).toBe(0);
    expect(session.snapshot().trace.at(-1)?.note).toContain('incomplete');

    session.clearTrace();
    expect(session.snapshot().trace).toEqual([]);
    expect(session.snapshot().rxBytes).toBeGreaterThan(0);
  });

  it('records every byte of an arbitrarily split banner, accepts cmd: on this connection, and drops it on disconnect', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const banner = '0\r\nHB 1200\r\ncmd:';
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);

    for (let index = 0; index < banner.length; index += 1) {
      fake.push(Uint8Array.of(banner.charCodeAt(index)));
    }

    const before = session.snapshot();
    const recorded = before.trace
      .filter((line) => line.direction === 'rx')
      .map((line) => line.text)
      .join('');
    expect(recorded).toBe(escapeSerialText(Uint8Array.from([...banner].map((character) => character.charCodeAt(0)))));
    expect(recorded.endsWith(':')).toBe(true);
    expect(before.rxChunks).toBe(banner.length);
    expect(before.rxBytes).toBe(banner.length);
    expect(before.commandPhase).toBe('prompt');
    expect(before.commandDetail).toMatch(/No command was sent/);
    expect(fake.writes).toEqual([]);

    expect(await session.requestCommandPrompt()).toMatch(/Nothing was sent/);
    expect(fake.writes).toEqual([]);

    await session.disconnect();
    await session.connect('/dev/cu.pg5g', async () => {
      fake.port.isOpen = true;
      return fake.port;
    });
    expect(session.snapshot().commandPhase).toBe('idle');
    fake.push(Uint8Array.from([...'cmd'].map((character) => character.charCodeAt(0))));
    expect(session.snapshot().commandPhase).toBe('idle');
    await session.requestCommandPrompt();
    expect(session.snapshot().commandPhase).toBe('waiting-prompt');
    expect(fake.writes).toEqual([APRS_COMMAND_INTERRUPT]);
  });

  it('keeps the 27-byte hardware slice intact and does not accept it as cmd:', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const slice = Uint8Array.from([
      0x41, 0x20, 0x31, 0x31, 0x30, 0x31, 0x30, 0x31, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x0d, 0x0a, 0x48, 0x42,
      0x20, 0x31, 0x32, 0x30, 0x30, 0x0d, 0x0a, 0x63, 0x6d,
    ]);
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    fake.push(slice);

    const before = session.snapshot();
    const recorded = before.trace.filter((line) => line.direction === 'rx').map((line) => line.text).join('');
    expect(recorded).toBe(escapeSerialText(slice));
    expect(before.rxBytes).toBe(27);
    expect(before.commandPhase).toBe('idle');

    await session.requestCommandPrompt();
    fake.push(slice);
    expect(session.snapshot().commandPhase).toBe('waiting-prompt');
    expect(fake.writes).toEqual([APRS_COMMAND_INTERRUPT]);

    fake.push(Uint8Array.from([0x64, 0x3a]));
    expect(session.snapshot().commandPhase).toBe('prompt');
    expect(fake.writes).toHaveLength(1);
  });

  it('treats the 24-byte HBAUD reply as this connection prompt and does not send Ctrl+C', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const reply = Uint8Array.from([
      0x3a, 0x48, 0x42, 0x41, 0x55, 0x44, 0x20, 0x20, 0x20, 0x20, 0x77, 0x61, 0x73, 0x20, 0x31, 0x32, 0x30, 0x30,
      0x0d, 0x0a, 0x63, 0x6d, 0x64, 0x3a,
    ]);
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    fake.push(reply);

    expect(new TextDecoder().decode(reply)).toBe(':HBAUD    was 1200\r\ncmd:');
    expect(session.snapshot().rxBytes).toBe(24);
    expect(session.snapshot().commandPhase).toBe('prompt');
    expect(session.snapshot().commandDetail).toMatch(/No command was sent/);
    expect(await session.requestCommandPrompt()).toMatch(/Nothing was sent/);
    expect(fake.writes).toEqual([]);

    await session.disconnect();
    await session.connect('/dev/cu.pg5g', async () => {
      fake.port.isOpen = true;
      return fake.port;
    });
    expect(session.snapshot().commandPhase).toBe('idle');
    expect(await session.enterHostKiss()).toMatch(/Nothing was sent/);
    expect(fake.writes).toEqual([]);
  });

  it('records hardware RTS/CTS on Listen and does not write', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port, { flowControl: 'hardware' });
    expect(session.snapshot().hostFlow).toBe('hardware');
    expect(session.snapshot().trace[0]?.note).toBe(hostListenNote('hardware'));
    expect(session.snapshot().bytesWritten).toBe(0);
    expect(fake.writes).toEqual([]);
  });

  it('keeps a 28-byte DA/HB tail without a colon idle, and logs KISS ON only after the plugin accepts 8 bytes', async () => {
    const tail = new TextEncoder().encode('A 110101000000\r\nHB 1200\r\ncmd');
    expect(tail).toHaveLength(28);
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const fake = fakePort();
    let release: (count: number) => void = () => undefined;
    fake.port.write = (bytes) =>
      new Promise<number>((resolve) => {
        fake.writes.push(bytes);
        release = resolve;
      });
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    fake.push(tail);
    expect(session.snapshot().commandPhase).toBe('idle');
    expect(session.snapshot().rxBytes).toBe(28);

    fake.push(new TextEncoder().encode('HBAUD    was 1200\r\ncmd:'));
    expect(session.snapshot().commandPhase).toBe('prompt');
    const pending = session.enterHostKiss();
    expect(session.snapshot().commandPhase).toBe('prompt');
    expect(session.snapshot().trace.some((line) => line.direction === 'tx-command')).toBe(false);
    release(8);
    expect(await pending).toBeUndefined();
    expect(session.snapshot().commandPhase).toBe('waiting-accept');
    expect(session.snapshot().commandDetail).toMatch(/Plugin accepted 8 bytes/);
    expect(session.snapshot().bytesWritten).toBe(8);
    expect(new TextDecoder().decode(fake.writes[0] ?? new Uint8Array())).toBe(APRS_KISS_ON_COMMAND);
  });

  it('does not wait for cmd: when the plugin rejects KISS ON', async () => {
    const session = createAprsHostSession({ now: () => 1_700_000_000_000 });
    const fake = fakePort();
    fake.port.write = () => {
      throw new Error('serial port lock timeout after 250 ms');
    };
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    fake.push(new TextEncoder().encode('cmd:'));
    const reason = await session.enterHostKiss();
    expect(reason).toMatch(/lock timeout/);
    expect(reason).toMatch(/RESTART was not sent/);
    expect(session.snapshot().commandPhase).toBe('rejected');
    expect(session.snapshot().bytesWritten).toBe(0);
    expect(session.snapshot().trace.some((line) => line.direction === 'tx-command')).toBe(false);
    session.poll();
    expect(session.snapshot().commandPhase).toBe('rejected');
  });

  it('escapes binary and markup, and drops only the oldest lines', () => {
    const hostile = Uint8Array.from([0x00, 0x11, 0x13, 0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3e, 0xc0]);
    const escaped = escapeSerialText(hostile);

    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).toContain('\\x00');
    expect(escaped).toContain('\\x11');
    expect(escaped).toContain('\\xc0');
    expect(formatTrace(APRS_HOST_TRACE_FIXTURE)).toContain('FIXTURE, not from the radio');
    expect(formatTrace(APRS_HOST_TRACE_FIXTURE)).not.toContain('<script>');

    const session = createAprsHostSession();
    const chunks = Array.from({ length: APRS_TRACE_CAP + 5 }, (_, index) => Uint8Array.from([index & 0xff]));
    let listener: ((chunk: Uint8Array) => void) | undefined;
    const port = {
      isOpen: true,
      on(event: string, handler: (chunk: Uint8Array) => void) {
        if (event === 'data') {
          listener = handler;
        }
      },
      off() {
        listener = undefined;
      },
      close() {
        this.isOpen = false;
        return Promise.resolve();
      },
    };

    return session.connect('/dev/cu.pg5g', async () => port).then(() => {
      for (const chunk of chunks) {
        listener?.(chunk);
      }

      const snap = session.snapshot();
      expect(snap.trace.filter((line) => line.direction === 'rx')).toHaveLength(APRS_TRACE_CAP);
      expect(snap.traceDropped).toBe(6);
      expect(snap.rxChunks).toBe(APRS_TRACE_CAP + 5);
      expect(snap.rxBytes).toBe(APRS_TRACE_CAP + 5);
    });
  });
});
