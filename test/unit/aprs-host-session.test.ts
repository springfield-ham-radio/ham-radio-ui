import { describe, expect, it } from 'vitest';
import { canonicalAx25Call } from '../../app/utils/aprs-ax25.ts';
import { encodeKissData } from '../../app/utils/aprs-kiss.ts';
import { createAprsHostSession, type AprsHostBytePort } from '../../app/utils/aprs-host-session.ts';
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

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const draft = { mine: 'N0TST', to: 'K5KTF-4', text: 'Hello' };

describe('APRS host session', () => {
  it('keeps the passive port without flow control and uses software flow for the host', () => {
    expect(aprsHoldPaths({ a: '/dev/monitor' }, { b: '/dev/host' })).toEqual(['/dev/monitor', '/dev/host']);
    expect(aprsSerialOpenOptions('/dev/cu.pg5g', 9600).flowControl).toBe('none');
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).flowControl).toBe('software');
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).rts).toBe(false);
    expect(aprsHostSerialOpenOptions('/dev/cu.pg5g', 9600).dtr).toBe(false);
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

    const held = await session.send({ ...draft, transmitRequested: false });

    expect(held.status).toBe('blocked');
    expect(held.detail).toBe('Transmit is off. Nothing was sent.');
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
    await session.send({ ...draft, transmitRequested: false });
    expect(fake.writes).toEqual([]);

    const sent = await session.send({ ...draft, transmitRequested: true });

    expect(sent.status).toBe('waiting-ack');
    expect(sent.messageId).toBe('2');
    expect(fake.writes).toHaveLength(1);

    await session.advance(APRS_MESSAGE_RETRY_MS - 1);
    expect(fake.writes).toHaveLength(1);
    await session.advance(1);
    expect(fake.writes).toHaveLength(2);
    session.cancel(sent.key);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(2);
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('cancelled');

    const again = await session.send({ ...draft, text: 'Second', transmitRequested: true });
    expect(fake.writes).toHaveLength(3);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(5);
    expect(session.snapshot().messages.find((message) => message.key === again.key)?.status).toBe('timed-out');

    const live = await session.send({ ...draft, text: 'Third', transmitRequested: true });
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
    expect(session.snapshot().messages.some((message) => message.text === 'Ping')).toBe(true);
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

    fake.push(second);
    fake.push(other);
    await settle();
    expect(fake.writes).toHaveLength(1);

    const sent = await session.send({ ...draft, transmitRequested: true });
    const before = fake.writes.length;
    const wrong = encodeAprsMessageFrame(spoof, { addressee: 'N0TST', kind: 'ack', id: sent.messageId ?? '', text: '1' });
    const right = encodeAprsMessageFrame(source, { addressee: 'N0TST', kind: 'ack', id: sent.messageId ?? '', text: '1' });

    if (!wrong || !right || !sent.messageId) {
      return;
    }

    fake.push(wrong);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('waiting-ack');
    fake.push(right);
    await settle();
    expect(session.snapshot().messages.find((message) => message.key === sent.key)?.status).toBe('acked');
    await session.advance(APRS_MESSAGE_RETRY_MS);
    expect(fake.writes).toHaveLength(before);

    const rejected = await session.send({ ...draft, text: 'Reject me', transmitRequested: true });
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

  it('does not write an invalid message', async () => {
    const session = createAprsHostSession({ allowHardwareTransmit: true });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    const invalid = await session.send({ mine: '1BAD', to: 'K5KTF', text: '', transmitRequested: true });

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

    fake.push(Uint8Array.from([...'cmd:'].map((character) => character.charCodeAt(0))));
    await settle();
    expect(await session.enterHostKiss()).toMatch(/No cmd:/);
    expect(fake.writes).toEqual([]);

    expect(await session.requestCommandPrompt()).toBeUndefined();
    expect(fake.writes).toEqual([APRS_COMMAND_INTERRUPT]);
    expect(new TextDecoder().decode(fake.writes[0] ?? new Uint8Array())).not.toContain('\r');
    expect(await session.requestCommandPrompt()).toMatch(/Already waiting/);
    expect(fake.writes).toHaveLength(1);

    fake.push(Uint8Array.from([...'cm'].map((character) => character.charCodeAt(0))));
    await settle();
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
