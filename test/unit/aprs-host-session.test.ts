import { describe, expect, it } from 'vitest';
import { canonicalAx25Call } from '../../app/utils/aprs-ax25.ts';
import { createAprsHostSession, type AprsHostBytePort } from '../../app/utils/aprs-host-session.ts';
import { APRS_HOST_HARDWARE_TRANSMIT, APRS_HOST_TRANSMIT_BLOCKER } from '../../app/utils/aprs-kiss-restore.ts';
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
  it('does not write on connect, and the app build cannot transmit', () => {
    expect(APRS_HOST_HARDWARE_TRANSMIT).toBe(false);
    expect(aprsHoldPaths({ a: '/dev/monitor' }, { b: '/dev/host' })).toEqual(['/dev/monitor', '/dev/host']);
  });

  it('opens and closes without writing, including when transmit was requested', async () => {
    const session = createAprsHostSession();
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);

    expect(session.snapshot().connected).toBe(true);
    expect(session.snapshot().bytesWritten).toBe(0);
    expect(fake.writes).toEqual([]);

    const blocked = await session.send({ ...draft, transmitRequested: true });

    expect(blocked.status).toBe('blocked');
    expect(blocked.detail).toBe(APRS_HOST_TRANSMIT_BLOCKER);
    expect(fake.writes).toEqual([]);
    expect(session.setAckOptIn(true)).toBe(APRS_HOST_TRANSMIT_BLOCKER);
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
});
