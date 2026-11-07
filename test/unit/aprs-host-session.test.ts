import { describe, expect, it } from 'vitest';
import { canonicalAx25Call } from '../../app/utils/aprs-ax25.ts';
import { createAprsHostSession, type AprsHostBytePort } from '../../app/utils/aprs-host-session.ts';
import { APRS_KISS_ENTER_TEXT } from '../../app/utils/aprs-kiss-restore.ts';
import { aprsHostSerialOpenOptions, aprsSerialOpenOptions } from '../../app/utils/aprs-serial-options.ts';
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
    expect(session.snapshot().nonKissBytes).toBeGreaterThan(0);
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
    const session = createAprsHostSession();
    const fake = fakePort();

    expect(await session.enterHostKiss()).toMatch(/not open/);
    expect(fake.writes).toEqual([]);

    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(fake.writes).toEqual([]);
    expect(await session.enterHostKiss()).toBeUndefined();
    expect(new TextDecoder().decode(fake.writes[0])).toBe(APRS_KISS_ENTER_TEXT);
    expect(APRS_KISS_ENTER_TEXT).not.toContain('HB');
    expect(session.snapshot().hostEnterRequested).toBe(true);
    expect(fake.writes).toHaveLength(1);

    await session.disconnect();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    expect(fake.writes).toHaveLength(1);
  });
});
