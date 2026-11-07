import { canonicalAx25Call, formatAx25Call, parseAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';
import { APRS_KISS_ENTER_TEXT } from '~/utils/aprs-kiss-restore';
import { createKissDecoderState, pushKissBytes } from '~/utils/aprs-kiss';
import {
  APRS_MESSAGE_ATTEMPTS,
  APRS_MESSAGE_RETRY_MS,
  callsignError,
  encodeAprsMessageFrame,
  messageTextError,
  parseAprsMessageFrame,
} from '~/utils/aprs-message';
import type { AprsBytePort } from '~/utils/aprs-session';
import {
  makeTraceLine,
  pushTraceLine,
  type AprsTraceDirection,
  type AprsTraceLine,
} from '~/utils/aprs-serial-trace';

const INBOX_CAP = 200;
const OUTBOX_CAP = 50;

export interface AprsHostBytePort extends AprsBytePort {
  write?(bytes: Uint8Array): void | Promise<void>;
}

export type AprsHostMessageStatus = 'heard' | 'waiting-ack' | 'acked' | 'rejected' | 'timed-out' | 'cancelled' | 'blocked';

export interface AprsHostMessage {
  key: string;
  direction: 'in' | 'out';
  other: string;
  text: string;
  messageId?: string;
  status: AprsHostMessageStatus;
  detail?: string;
  at: number;
}

export interface AprsHostSnapshot {
  connected: boolean;
  path?: string;
  error?: string;
  frames: number;
  /** Bytes outside a KISS frame. A prompt, echo, or error lands here. */
  commandTextBytes: number;
  /** Bytes of a KISS frame that has not reached FEND yet. */
  incompleteBytes: number;
  /** Bytes dropped on a bad escape. */
  invalidBytes: number;
  overflowDrops: number;
  rxBytes: number;
  rxChunks: number;
  bytesWritten: number;
  hardwareTransmit: boolean;
  ackOptIn: boolean;
  /** True after Enter host KISS has written the documented command. Not set by Listen. */
  hostEnterRequested: boolean;
  /** True only after a KISS data frame parses as an AX.25 UI frame. */
  kissConfirmed: boolean;
  trace: AprsTraceLine[];
  traceDropped: number;
  messages: AprsHostMessage[];
}

export interface AprsHostSession {
  snapshot(): AprsHostSnapshot;
  connect(path: string, openPort: () => Promise<AprsHostBytePort>): Promise<void>;
  unavailable(message: string): void;
  disconnect(): Promise<void>;
  setIdentity(call: string): string | undefined;
  setAckOptIn(on: boolean): string | undefined;
  /** Writes the IDM enter sequence. Does not send a message. Refuses when Listen is closed. */
  enterHostKiss(): Promise<string | undefined>;
  clearTrace(): void;
  send(input: { mine: string; to: string; text: string; transmitRequested: boolean }): Promise<AprsHostMessage>;
  cancel(key: string): void;
  /** Move the test clock. Waiting messages retry or time out. Disconnect clears them first. */
  advance(ms: number): Promise<void>;
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}

interface Waiting {
  key: string;
  source: Ax25Call;
  to: string;
  text: string;
  id: string;
  attempts: number;
  lastAttemptAt: number;
}

/**
 * Host KISS listener.
 *
 * Connect, disconnect, and an open composer do not write. A message frame is
 * written only when the session is constructed with hardware transmit allowed
 * and the caller sets the transmit opt-in. An ack is a second opt-in, because
 * it is also a transmission. Disconnect cancels waiting messages and does not
 * send an exit command. A later connect does not send them again.
 */
export function createAprsHostSession(options?: {
  now?: () => number;
  allowHardwareTransmit?: boolean;
  useRetryClock?: boolean;
}): AprsHostSession {
  const now = options?.now ?? (() => Date.now());
  const allowHardwareTransmit = options?.allowHardwareTransmit !== false;
  const kiss = createKissDecoderState();
  const listeners = new Set<() => void>();
  const messages: AprsHostMessage[] = [];
  const waiting = new Map<string, Waiting>();
  const seen = new Set<string>();
  const acked = new Set<string>();
  let port: AprsHostBytePort | undefined;
  let path: string | undefined;
  let error: string | undefined;
  let generation = 0;
  let frames = 0;
  let commandTextBytes = 0;
  let incompleteBytes = 0;
  let invalidBytes = 0;
  let overflowDrops = 0;
  let rxBytes = 0;
  let rxChunks = 0;
  let bytesWritten = 0;
  let sequence = 0;
  let ackOptIn = false;
  let hostEnterRequested = false;
  let kissConfirmed = false;
  const trace: AprsTraceLine[] = [];
  let traceDropped = 0;
  let identity: Ax25Call | undefined;
  let clock = now();
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  function publish(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function record(direction: AprsTraceDirection, bytes: Uint8Array, note: string): void {
    traceDropped += pushTraceLine(trace, makeTraceLine(clock, direction, bytes, note));
  }

  function stopRetryIfIdle(): void {
    if (waiting.size === 0 && retryTimer) {
      clearInterval(retryTimer);
      retryTimer = undefined;
    }
  }

  function remember(message: AprsHostMessage): AprsHostMessage {
    messages.push(message);

    if (messages.length > INBOX_CAP) {
      messages.splice(0, messages.length - INBOX_CAP);
    }

    return message;
  }

  function row(key: string): AprsHostMessage | undefined {
    return messages.find((message) => message.key === key);
  }

  async function writeFrame(frame: Uint8Array): Promise<boolean> {
    if (!allowHardwareTransmit || !port?.isOpen || !port.write) {
      return false;
    }

    try {
      await port.write(frame);
    } catch {
      return false;
    }

    bytesWritten += frame.length;
    return true;
  }

  async function transmitWaiting(item: Waiting): Promise<void> {
    const frame = encodeAprsMessageFrame(item.source, {
      addressee: item.to,
      kind: 'text',
      text: item.text,
      id: item.id,
    });
    const current = row(item.key);

    if (!frame || !(await writeFrame(frame))) {
      waiting.delete(item.key);

      if (current) {
        current.status = 'blocked';
        current.detail = frame ? 'The COM port did not accept the frame.' : 'The message could not be encoded';
      }

      return;
    }

    item.attempts += 1;
    item.lastAttemptAt = clock;
    record('tx-frame', frame, `Message frame ${item.attempts} of ${APRS_MESSAGE_ATTEMPTS}. Not a KISS enter command.`);

    if (current) {
      current.status = 'waiting-ack';
      current.detail = `Sent ${item.attempts} of ${APRS_MESSAGE_ATTEMPTS}`;
    }
  }

  function cancelWaiting(reason: string): void {
    for (const item of waiting.values()) {
      const current = row(item.key);

      if (current?.status === 'waiting-ack') {
        current.status = 'cancelled';
        current.detail = reason;
      }
    }

    waiting.clear();
  }

  async function maybeAck(source: string, addressee: string, id: string): Promise<void> {
    if (!ackOptIn || !identity || !allowHardwareTransmit || formatAx25Call(identity) !== addressee || acked.has(`${source}|${id}`)) {
      return;
    }

    const frame = encodeAprsMessageFrame(identity, { addressee: source, kind: 'ack', id, text: id });

    if (!frame || !(await writeFrame(frame))) {
      return;
    }

    acked.add(`${source}|${id}`);
    record('tx-frame', frame, 'Ack frame. Not a KISS enter command.');
  }

  async function takeFrame(payload: Uint8Array): Promise<void> {
    const parsed = parseAprsMessageFrame(payload);

    if (!parsed) {
      return;
    }

    const { source, body } = parsed;

    if (body.kind === 'ack' || body.kind === 'rej') {
      const match = [...waiting.values()].find(
        (item) => item.id === body.id && item.to === source && formatAx25Call(item.source) === body.addressee,
      );

      if (!match) {
        return;
      }

      waiting.delete(match.key);
      const current = row(match.key);

      if (current) {
        current.status = body.kind === 'ack' ? 'acked' : 'rejected';
        current.detail = body.kind === 'ack' ? `Ack ${body.id} from ${source}` : `Reject ${body.id} from ${source}`;
      }

      return;
    }

    const duplicateKey = body.id ? `${source}|${body.id}` : undefined;

    if (duplicateKey && seen.has(duplicateKey)) {
      return;
    }

    if (duplicateKey) {
      seen.add(duplicateKey);
    }

    remember({
      key: `in-${sequence}-${body.id ?? 'plain'}`,
      direction: 'in',
      other: source,
      text: body.text,
      messageId: body.id,
      status: 'heard',
      at: clock,
    });
    sequence += 1;

    if (body.id) {
      await maybeAck(source, body.addressee, body.id);
    }
  }

  const onData = (chunk: Uint8Array): void => {
    const current = generation;
    rxBytes += chunk.length;
    rxChunks += 1;
    const decoded = pushKissBytes(kiss, chunk);
    commandTextBytes += decoded.ignored;
    invalidBytes += decoded.invalid;
    overflowDrops += decoded.overflow;
    incompleteBytes = decoded.holding;
    const payloads = decoded.frames.filter((frame) => (frame.command & 0x0f) === 0).map((frame) => frame.data);
    frames += decoded.frames.length;
    const notes: string[] = [];

    if (decoded.ignored > 0) {
      notes.push(`${decoded.ignored} command-text`);
    }

    if (decoded.frames.length > 0) {
      notes.push(`${decoded.frames.length} KISS`);
    }

    if (decoded.holding > 0) {
      notes.push(`incomplete, ${decoded.holding} held`);
    }

    if (decoded.invalid > 0) {
      notes.push(`${decoded.invalid} invalid`);
    }

    if (decoded.overflow > 0) {
      notes.push('overflow drop');
    }

    for (const payload of payloads) {
      if (parseAx25Ui(payload)) {
        kissConfirmed = true;
        notes.push('AX.25 UI');
      }
    }

    record('rx', chunk, notes.join(', ') || 'empty');

    void (async () => {
      for (const payload of payloads) {
        if (current !== generation) {
          return;
        }

        await takeFrame(payload);
      }

      if (current === generation) {
        publish();
      }
    })();
  };

  const onError = (cause: Error): void => {
    error = cause.message;
    publish();
  };

  return {
    snapshot() {
      return {
        connected: port?.isOpen === true,
        path,
        error,
        frames,
        commandTextBytes,
        incompleteBytes,
        invalidBytes,
        overflowDrops,
        rxBytes,
        rxChunks,
        bytesWritten,
        hardwareTransmit: allowHardwareTransmit,
        ackOptIn,
        hostEnterRequested,
        kissConfirmed,
        trace: trace.map((line) => ({ ...line })),
        traceDropped,
        messages: messages.map((message) => ({ ...message })),
      };
    },
    async connect(nextPath, openPort) {
      generation += 1;
      const current = generation;
      await this.disconnect();
      generation = current;
      error = undefined;
      frames = 0;
      commandTextBytes = 0;
      incompleteBytes = 0;
      invalidBytes = 0;
      overflowDrops = 0;
      rxBytes = 0;
      rxChunks = 0;
      kissConfirmed = false;

      try {
        const opened = await openPort();

        if (current !== generation) {
          await opened.close();
          return;
        }

        port = opened;
        path = nextPath;
        record(
          'note',
          new Uint8Array(),
          'Listen opened. Bytes already waiting are kept. Flow control is software, so 0x11 and 0x13 may be taken by the driver before they are listed. That is a capture limit, not a conclusion. KISS is unconfirmed.',
        );
        opened.on('data', onData);
        opened.on('error', onError);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'The APRS port did not open';
        port = undefined;
        path = undefined;
      }

      publish();
    },
    unavailable(message) {
      error = message;
      publish();
    },
    async disconnect() {
      generation += 1;
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = undefined;
      }

      cancelWaiting('Disconnected. This message will not be sent again.');
      const current = port;
      port = undefined;
      path = undefined;
      kiss.pending = [];
      kiss.inFrame = false;
      kiss.escaped = false;

      if (!current) {
        publish();
        return;
      }

      current.off('data', onData);
      current.off('error', onError);
      record('note', new Uint8Array(), 'Disconnected. The reply log is kept until Clear. Nothing was sent.');
      await current.close();
      publish();
    },
    setIdentity(call) {
      const parsed = canonicalAx25Call(call);

      if (!parsed) {
        identity = undefined;
        return callsignError(call);
      }

      identity = parsed;
      return undefined;
    },
    setAckOptIn(on) {
      if (on && !allowHardwareTransmit) {
        ackOptIn = false;
        return 'Ack replies are off.';
      }

      ackOptIn = on && allowHardwareTransmit;
      return undefined;
    },
    async enterHostKiss() {
      if (!port?.isOpen || !port.write) {
        return 'Listen is not open. The radio was not changed.';
      }

      const bytes = new TextEncoder().encode(APRS_KISS_ENTER_TEXT);
      const wrote = await writeFrame(bytes);

      if (!wrote) {
        return 'The COM port did not accept the KISS enter command. The radio was not changed.';
      }

      hostEnterRequested = true;
      record('tx-command', bytes, 'Command written. KISS unconfirmed. No message was sent. This is not repeated.');
      publish();
      return undefined;
    },
    clearTrace() {
      trace.splice(0, trace.length);
      traceDropped = 0;
      publish();
    },
    async send(input) {
      const mine = canonicalAx25Call(input.mine);
      const to = canonicalAx25Call(input.to);
      const textError = messageTextError(input.text);
      const key = `out-${sequence}`;
      sequence += 1;
      const blocked = (detail: string | undefined): AprsHostMessage => {
        const message = remember({
          key,
          direction: 'out',
          other: to ? formatAx25Call(to) : input.to.trim() || '—',
          text: input.text,
          status: 'blocked',
          detail,
          at: clock,
        });
        publish();
        return message;
      };

      if (!mine || !to || textError) {
        return blocked(callsignError(input.mine) ?? callsignError(input.to) ?? textError);
      }

      identity = mine;

      if (waiting.size >= OUTBOX_CAP) {
        return blocked('Too many unfinished messages');
      }

      if (!input.transmitRequested) {
        return blocked('Transmit is off. Nothing was sent.');
      }

      if (!allowHardwareTransmit) {
        return blocked('Transmit is off. Nothing was sent.');
      }

      if (options?.useRetryClock && !retryTimer) {
        retryTimer = setInterval(() => {
          void this.advance(1000);
        }, 1000);
      }

      const id = sequence.toString(36);
      const item: Waiting = {
        key,
        source: mine,
        to: formatAx25Call(to),
        text: input.text,
        id,
        attempts: 0,
        lastAttemptAt: clock,
      };
      waiting.set(key, item);
      remember({
        key,
        direction: 'out',
        other: item.to,
        text: input.text,
        messageId: id,
        status: 'waiting-ack',
        detail: 'Sending',
        at: clock,
      });
      await transmitWaiting(item);
      stopRetryIfIdle();
      publish();
      return { ...(row(key) as AprsHostMessage) };
    },
    cancel(key) {
      waiting.delete(key);
      const current = row(key);

      if (current?.status === 'waiting-ack') {
        current.status = 'cancelled';
        current.detail = 'Cancelled. No further transmissions.';
        stopRetryIfIdle();
        publish();
      }
    },
    async advance(ms) {
      clock += ms;

      for (const item of [...waiting.values()]) {
        if (!waiting.has(item.key) || clock - item.lastAttemptAt < APRS_MESSAGE_RETRY_MS) {
          continue;
        }

        if (item.attempts >= APRS_MESSAGE_ATTEMPTS) {
          waiting.delete(item.key);
          const current = row(item.key);

          if (current) {
            current.status = 'timed-out';
            current.detail = `No matching ack after ${APRS_MESSAGE_ATTEMPTS} transmissions`;
          }

          continue;
        }

        await transmitWaiting(item);
      }

      stopRetryIfIdle();
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
    },
    unsubscribe(listener) {
      listeners.delete(listener);
    },
  };
}
