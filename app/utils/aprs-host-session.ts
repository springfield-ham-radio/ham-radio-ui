import { canonicalAx25Call, formatAx25Call, parseAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';
import {
  APRS_COMMAND_INTERRUPT,
  APRS_COMMAND_WAIT_MS,
  APRS_KISS_ON_COMMAND,
  APRS_RESTART_COMMAND,
  appendCommandBytes,
  hasCommandPrompt,
  hasTncError,
} from '~/utils/aprs-command';
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
  /**
   * idle: no command on this connection.
   * waiting-prompt: Ctrl+C was written, cmd: not seen yet.
   * prompt: cmd: arrived after that write.
   * waiting-accept: KISS ON was written, waiting for another cmd:.
   * restart-sent: RESTART was written once. KISS is still unconfirmed.
   */
  commandPhase: 'idle' | 'waiting-prompt' | 'prompt' | 'timed-out' | 'cancelled' | 'waiting-accept' | 'restart-sent' | 'rejected' | 'kiss-framed';
  commandDetail: string;
  hostFlow: 'software' | 'none';
  trace: AprsTraceLine[];
  traceDropped: number;
  messages: AprsHostMessage[];
}

export interface AprsHostSession {
  snapshot(): AprsHostSnapshot;
  connect(path: string, openPort: () => Promise<AprsHostBytePort>, capture?: { flowControl?: 'software' | 'none' }): Promise<void>;
  unavailable(message: string): void;
  disconnect(): Promise<void>;
  setIdentity(call: string): string | undefined;
  setAckOptIn(on: boolean): string | undefined;
  /** Writes three Ctrl+C bytes and no carriage return. One shot. */
  requestCommandPrompt(): Promise<string | undefined>;
  /** Stops a wait. Does not write. */
  cancelCommand(): void;
  /** Check the command timeout against now(). */
  poll(): void;
  /** Writes KISS ON only after cmd: on this connection, then RESTART only after another cmd:. */
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
  let commandPhase: AprsHostSnapshot['commandPhase'] = 'idle';
  let commandDetail = 'No command requested.';
  let commandBytes = new Uint8Array();
  let commandDeadline = 0;
  let commandActive = false;
  let commandTimer: ReturnType<typeof setInterval> | undefined;
  let hostFlow: 'software' | 'none' = 'software';
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
    traceDropped += pushTraceLine(trace, makeTraceLine(now(), direction, bytes, note));
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

  async function writeBytes(bytes: Uint8Array): Promise<boolean> {
    if (!port?.isOpen || !port.write) {
      return false;
    }

    try {
      await port.write(bytes);
    } catch {
      return false;
    }

    bytesWritten += bytes.length;
    return true;
  }

  async function writeFrame(frame: Uint8Array): Promise<boolean> {
    if (!allowHardwareTransmit) {
      return false;
    }

    return writeBytes(frame);
  }

  function expireCommand(): void {
    if (!commandActive || now() < commandDeadline) {
      return;
    }

    const waitingForAccept = commandPhase === 'waiting-accept';
    commandActive = false;
    commandPhase = 'timed-out';
    commandDetail = waitingForAccept
      ? 'No cmd: after KISS ON. RESTART was not sent.'
      : 'No cmd: prompt. Ctrl+C was not repeated, and no carriage return was sent.';
    record('note', new Uint8Array(), commandDetail);
    publish();
  }

  function armCommandWait(): void {
    commandBytes = new Uint8Array();
    commandActive = true;
    commandDeadline = now() + APRS_COMMAND_WAIT_MS;

    if (options?.useRetryClock && !commandTimer) {
      commandTimer = setInterval(() => {
        expireCommand();

        if (!commandActive && commandTimer) {
          clearInterval(commandTimer);
          commandTimer = undefined;
        }
      }, 250);
    }
  }

  function considerCommandReply(kissFrames: number): void {
    if (!commandActive) {
      return;
    }

    if (commandPhase === 'waiting-prompt' && kissFrames > 0 && !hasCommandPrompt(commandBytes)) {
      commandActive = false;
      commandPhase = 'kiss-framed';
      commandDetail = 'KISS-framed bytes arrived. That is not a cmd: prompt. No carriage return was sent.';
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (commandPhase === 'waiting-accept' && hasTncError(commandBytes) && !hasCommandPrompt(commandBytes)) {
      commandActive = false;
      commandPhase = 'rejected';
      commandDetail = 'The TNC answered ?EH. RESTART was not sent.';
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (!hasCommandPrompt(commandBytes)) {
      return;
    }

    if (commandPhase === 'waiting-prompt') {
      commandActive = false;
      commandPhase = 'prompt';
      commandDetail = 'cmd: arrived after Ctrl+C. A carriage return is still not sent until Enter host KISS.';
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (commandPhase === 'waiting-accept') {
      commandActive = false;
      void acceptKissOn();
    }
  }

  async function acceptKissOn(): Promise<void> {
    const bytes = new TextEncoder().encode(APRS_RESTART_COMMAND);
    const wrote = await writeBytes(bytes);

    if (!wrote) {
      commandPhase = 'rejected';
      commandDetail = 'RESTART was not written. The port did not accept it.';
      record('note', new Uint8Array(), commandDetail);
      publish();
      return;
    }

    commandPhase = 'restart-sent';
    hostEnterRequested = true;
    commandDetail = 'RESTART written once after cmd:. KISS unconfirmed. This is not repeated.';
    record('tx-command', bytes, commandDetail);
    publish();
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

    if (commandActive) {
      commandBytes = appendCommandBytes(commandBytes, chunk);
      considerCommandReply(decoded.frames.length);
    }

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
        commandPhase,
        commandDetail,
        hostFlow,
        trace: trace.map((line) => ({ ...line })),
        traceDropped,
        messages: messages.map((message) => ({ ...message })),
      };
    },
    async connect(nextPath, openPort, capture) {
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
      commandPhase = 'idle';
      commandDetail = 'No command requested on this connection.';
      commandBytes = new Uint8Array();
      commandActive = false;
      hostFlow = capture?.flowControl === 'none' ? 'none' : 'software';

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
          hostFlow === 'none'
            ? 'Listen opened. Flow control is off, the same as the passive monitor. No command was sent.'
            : 'Listen opened. Flow control is software. The passive monitor uses none. 0x11 and 0x13 may be taken by the driver before they are listed. That is a capture limit, not a conclusion. No command was sent.',
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
      commandActive = false;
      commandBytes = new Uint8Array();
      if (commandTimer) {
        clearInterval(commandTimer);
        commandTimer = undefined;
      }
      if (commandPhase !== 'idle') {
        commandPhase = 'idle';
        commandDetail = 'Disconnected. A cmd: prompt from this connection is not kept.';
      }
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
    async requestCommandPrompt() {
      if (!port?.isOpen || !port.write) {
        return 'Listen is not open. Nothing was sent.';
      }

      if (commandActive) {
        return 'Already waiting. Nothing more was sent.';
      }

      const wrote = await writeBytes(APRS_COMMAND_INTERRUPT);

      if (!wrote) {
        return 'The port did not accept Ctrl+C. Nothing else was sent.';
      }

      armCommandWait();
      commandPhase = 'waiting-prompt';
      commandDetail = 'Three Ctrl+C bytes written. No carriage return. Waiting for cmd:.';
      record('tx-command', APRS_COMMAND_INTERRUPT, commandDetail);
      publish();
      return undefined;
    },
    cancelCommand() {
      if (!commandActive) {
        return;
      }

      commandActive = false;
      commandPhase = 'cancelled';
      commandDetail = 'Cancelled. No further command bytes will be written for this request.';
      record('note', new Uint8Array(), commandDetail);
      publish();
    },
    poll() {
      expireCommand();
    },
    async enterHostKiss() {
      if (!port?.isOpen || !port.write) {
        return 'Listen is not open. Nothing was sent.';
      }

      if (commandPhase !== 'prompt') {
        return 'No cmd: prompt on this connection. Nothing was sent.';
      }

      const bytes = new TextEncoder().encode(APRS_KISS_ON_COMMAND);
      const wrote = await writeBytes(bytes);

      if (!wrote) {
        return 'The port did not accept KISS ON. RESTART was not sent.';
      }

      armCommandWait();
      commandPhase = 'waiting-accept';
      commandDetail = 'KISS ON written once. Waiting for another cmd: before RESTART.';
      record('tx-command', bytes, commandDetail);
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
