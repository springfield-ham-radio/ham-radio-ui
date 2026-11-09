import { canonicalAx25Call, formatAx25Call, parseAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';
import { appendCommandBytes, hasCommandPrompt, hasTncError } from '~/utils/aprs-command';
import type { AprsHostLink } from '~/utils/aprs-host-profile';
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
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';
import {
  makeTraceLine,
  pushTraceLine,
  type AprsTraceDirection,
  type AprsTraceLine,
} from '~/utils/aprs-serial-trace';

const INBOX_CAP = 200;
const OUTBOX_CAP = 50;

export interface AprsHostBytePort extends AprsBytePort {
  /** A number is the plugin's accepted count. Void is a test double that already queued the bytes. */
  write?(bytes: Uint8Array): void | number | Promise<void | number>;
}

export type AprsHostMessageStatus = 'heard' | 'waiting-ack' | 'acked' | 'rejected' | 'timed-out' | 'cancelled' | 'blocked';

export interface AprsHostMessage {
  key: string;
  direction: 'in' | 'out';
  other: string;
  text: string;
  messageId?: string;
  /** APRS addressee. An incoming line can be heard without being addressed to this station. */
  addressee?: string;
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
  hostFlow: AprsHostFlowControl;
  trace: AprsTraceLine[];
  traceDropped: number;
  messages: AprsHostMessage[];
}

export interface AprsHostSession {
  snapshot(): AprsHostSnapshot;
  connect(path: string, openPort: () => Promise<AprsHostBytePort>, capture?: { flowControl?: AprsHostFlowControl }): Promise<void>;
  unavailable(message: string): void;
  disconnect(): Promise<void>;
  setIdentity(call: string): string | undefined;
  setAckOptIn(on: boolean): string | undefined;
  /** Replace the module command procedure. Does not write. */
  setHostLink(link: AprsHostLink | undefined): void;
  /** Writes the module's prompt request and no carriage return. One shot. */
  requestCommandPrompt(): Promise<string | undefined>;
  /** Stops a wait. Does not write. */
  cancelCommand(): void;
  /** Check the command timeout against now(). */
  poll(): void;
  /** Writes the module's enter steps, each only after a fresh prompt on this connection. */
  enterHostKiss(): Promise<string | undefined>;
  clearTrace(): void;
  /** Send is the transmit choice. It does not enter KISS and does not acknowledge old messages. */
  send(input: { mine: string; to: string; text: string }): Promise<AprsHostMessage>;
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
 * Connect, disconnect, and an open composer do not write. Send is the only
 * way a message frame is written. A message or retry is written only after
 * this connection has parsed an AX.25 UI frame. A KISS frame that does not
 * parse does not count. Cancel, Disconnect, and the module's prompt stop retries.
 * Automatic ack is separate, off until set, and applies only to a later
 * message addressed to the current callsign. Disconnect cancels waiting
 * messages and does not send an exit command. A later connect does not send
 * them again.
 */
export function createAprsHostSession(options?: {
  now?: () => number;
  allowHardwareTransmit?: boolean;
  useRetryClock?: boolean;
  /** Parsed UI payload. The callback must not write to the port. */
  onAx25Ui?: (payload: Uint8Array) => void;
  /** Absent means command buttons write nothing. */
  host?: AprsHostLink;
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
  let hostLink = options?.host;
  let enterIndex = 0;
  let ackOptIn = false;
  let hostEnterRequested = false;
  let kissConfirmed = false;
  let commandText = new Uint8Array();
  let commandTextAtConfirm = 0;
  let commandPhase: AprsHostSnapshot['commandPhase'] = 'idle';
  let commandDetail = 'No command requested.';
  let commandBytes = new Uint8Array();
  let sessionBytes = new Uint8Array();
  let commandDeadline = 0;
  let commandActive = false;
  let commandTimer: ReturnType<typeof setInterval> | undefined;
  let hostFlow: AprsHostFlowControl = 'software';
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

  async function writeBytes(bytes: Uint8Array): Promise<{ ok: true; accepted: number; plugin: boolean } | { ok: false; reason: string }> {
    if (!port?.isOpen || !port.write) {
      return { ok: false, reason: 'Listen is not open.' };
    }

    let result: void | number;

    try {
      result = await port.write(bytes);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'The port did not accept the bytes.';
      return { ok: false, reason };
    }

    const plugin = typeof result === 'number';
    const accepted = plugin ? result : bytes.length;

    if (accepted !== bytes.length) {
      return { ok: false, reason: `The serial plugin accepted ${accepted} of ${bytes.length} bytes.` };
    }

    bytesWritten += bytes.length;
    return { ok: true, accepted, plugin };
  }

  function acceptanceNote(wrote: { accepted: number; plugin: boolean }): string {
    return wrote.plugin ? `Plugin accepted ${wrote.accepted} bytes. That is kernel acceptance, not a radio echo. ` : '';
  }

  async function writeFrame(frame: Uint8Array): Promise<boolean> {
    if (!allowHardwareTransmit) {
      return false;
    }

    return (await writeBytes(frame)).ok;
  }

  function promptSeen(bytes: Uint8Array): boolean {
    return hostLink !== undefined && hasCommandPrompt(bytes, hostLink.prompt);
  }

  function expireCommand(): void {
    if (!commandActive || now() < commandDeadline || !hostLink) {
      return;
    }

    const waitingForAccept = commandPhase === 'waiting-accept';
    const previous = hostLink.enter[enterIndex - 1]?.label;
    const following = hostLink.enter[enterIndex]?.label;
    commandActive = false;
    commandPhase = 'timed-out';
    commandDetail = waitingForAccept && previous && following
      ? `No ${hostLink.prompt} after ${previous}. ${following} was not sent.`
      : `No ${hostLink.prompt} prompt. The request was not repeated, and no carriage return was sent.`;
    record('note', new Uint8Array(), commandDetail);
    publish();
  }

  function armCommandWait(): void {
    commandBytes = new Uint8Array();
    commandActive = true;
    commandDeadline = now() + (hostLink?.waitMs ?? 5000);

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

  function noteConnectionPrompt(): void {
    if (!hostLink || !promptSeen(sessionBytes)) {
      return;
    }

    if (commandPhase === 'prompt' || commandPhase === 'waiting-accept' || commandPhase === 'restart-sent' || commandPhase === 'rejected' || commandPhase === 'kiss-framed') {
      return;
    }

    const afterInterrupt = commandPhase === 'waiting-prompt';
    commandActive = false;

    if (commandTimer) {
      clearInterval(commandTimer);
      commandTimer = undefined;
    }

    commandPhase = 'prompt';
    commandDetail = afterInterrupt
      ? `${hostLink.prompt} arrived after the prompt request. A carriage return is still not sent until Enter host KISS.`
      : `${hostLink.prompt} arrived on this connection. No command was sent.`;
    record('note', new Uint8Array(), commandDetail);
  }

  function considerCommandReply(kissFrames: number): void {
    if (!commandActive) {
      return;
    }

    if (!hostLink) {
      return;
    }

    if (commandPhase === 'waiting-prompt' && kissFrames > 0 && !promptSeen(commandBytes)) {
      commandActive = false;
      commandPhase = 'kiss-framed';
      commandDetail = `KISS-framed bytes arrived. That is not a ${hostLink.prompt} prompt. No carriage return was sent.`;
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    const following = hostLink.enter[enterIndex]?.label;
    const errorReply = hostLink.errorReply;

    if (commandPhase === 'waiting-accept' && errorReply && hasTncError(commandBytes, errorReply) && !promptSeen(commandBytes)) {
      commandActive = false;
      commandPhase = 'rejected';
      commandDetail = `The TNC answered ${errorReply}. ${following ?? 'The next command'} was not sent.`;
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (!promptSeen(commandBytes)) {
      return;
    }

    if (commandPhase === 'waiting-prompt') {
      commandActive = false;
      commandPhase = 'prompt';
      commandDetail = `${hostLink.prompt} arrived after the prompt request. A carriage return is still not sent until Enter host KISS.`;
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (commandPhase === 'waiting-accept') {
      commandActive = false;
      void writeEnterStep();
    }
  }

  async function writeEnterStep(): Promise<string | undefined> {
    const step = hostLink?.enter[enterIndex];

    if (!hostLink || !step) {
      return 'This radio has no host command procedure. Nothing was sent.';
    }

    const bytes = new TextEncoder().encode(step.text);
    const wrote = await writeBytes(bytes);
    const following = hostLink.enter[enterIndex + 1];

    if (!wrote.ok) {
      commandPhase = 'rejected';
      commandDetail = following
        ? `${step.label} was not accepted. ${wrote.reason} ${following.label} was not sent.`
        : `${step.label} was not written. ${wrote.reason}`;
      record('note', new Uint8Array(), commandDetail);
      publish();
      return commandDetail;
    }

    if (!following) {
      commandPhase = 'restart-sent';
      hostEnterRequested = true;
      commandDetail = `${step.label} written once after ${hostLink.prompt}. ${acceptanceNote(wrote)}KISS unconfirmed. This is not repeated.`;
      record('tx-command', bytes, commandDetail);
      publish();
      return undefined;
    }

    enterIndex += 1;
    armCommandWait();
    commandPhase = 'waiting-accept';
    commandDetail = `${step.label} written once. ${acceptanceNote(wrote)}Waiting for another ${hostLink.prompt} before ${following.label}.`;
    record('tx-command', bytes, commandDetail);
    publish();
    return undefined;
  }

  function loseKissConfirmation(reason: string): void {
    if (!kissConfirmed) {
      return;
    }

    kissConfirmed = false;
    commandTextAtConfirm = commandText.length;
    cancelWaiting(reason);
    record('note', new Uint8Array(), reason);
  }

  async function transmitWaiting(item: Waiting): Promise<void> {
    if (!kissConfirmed || !allowHardwareTransmit) {
      waiting.delete(item.key);
      const current = row(item.key);

      if (current?.status === 'waiting-ack') {
        current.status = 'cancelled';
        current.detail = 'This connection has no AX.25 UI frame. No further transmissions.';
      }

      return;
    }

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
    if (!ackOptIn || !kissConfirmed || !identity || !allowHardwareTransmit || formatAx25Call(identity) !== addressee || acked.has(`${source}|${id}`)) {
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
      addressee: body.addressee,
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
      if (!parseAx25Ui(payload)) {
        continue;
      }

      kissConfirmed = true;
      commandTextAtConfirm = commandText.length;
      notes.push('AX.25 UI');
      options?.onAx25Ui?.(payload);
    }

    if (decoded.ignoredBytes.length > 0) {
      commandText = appendCommandBytes(commandText, decoded.ignoredBytes);
    }

    record('rx', chunk, notes.join(', ') || 'empty');

    const pending = Uint8Array.from(kiss.pending);
    const pendingIsCommandText = pending.length > 0 && pending[0] !== 0x00 && promptSeen(pending);
    const prompt = hostLink?.prompt;

    if (prompt && kissConfirmed && (promptSeen(commandText.subarray(commandTextAtConfirm)) || pendingIsCommandText)) {
      loseKissConfirmation(`${prompt} arrived on this connection. KISS is not confirmed. Queued transmissions were stopped.`);
    }

    sessionBytes = appendCommandBytes(sessionBytes, chunk);
    noteConnectionPrompt();

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
      commandText = new Uint8Array();
      commandTextAtConfirm = 0;
      commandPhase = 'idle';
      commandDetail = 'No command requested on this connection.';
      commandBytes = new Uint8Array();
      sessionBytes = new Uint8Array();
      commandActive = false;
      hostFlow = capture?.flowControl ?? 'software';

      try {
        const opened = await openPort();

        if (current !== generation) {
          await opened.close();
          return;
        }

        port = opened;
        path = nextPath;
        ackOptIn = false;
        record('note', new Uint8Array(), hostListenNote(hostFlow));
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
      ackOptIn = false;
      commandActive = false;
      commandBytes = new Uint8Array();
      sessionBytes = new Uint8Array();
      commandText = new Uint8Array();
      commandTextAtConfirm = 0;
      kissConfirmed = false;
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
      if (!call.trim()) {
        identity = undefined;
        return undefined;
      }

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
    setHostLink(link) {
      hostLink = link;
    },
    async requestCommandPrompt() {
      if (!port?.isOpen || !port.write) {
        return 'Listen is not open. Nothing was sent.';
      }

      if (!hostLink) {
        return 'This radio has no host command procedure. Nothing was sent.';
      }

      if (commandPhase === 'prompt') {
        return `${hostLink.prompt} is already on this connection. Nothing was sent.`;
      }

      if (commandActive) {
        return 'Already waiting. Nothing more was sent.';
      }

      const wrote = await writeBytes(hostLink.interrupt);

      if (!wrote.ok) {
        return `The prompt request was not accepted. ${wrote.reason} Nothing else was sent.`;
      }

      armCommandWait();
      commandPhase = 'waiting-prompt';
      commandDetail = `Prompt request written. ${acceptanceNote(wrote)}No carriage return. Waiting for ${hostLink.prompt}.`;
      record('tx-command', hostLink.interrupt, commandDetail);
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

      if (!hostLink) {
        return 'This radio has no host command procedure. Nothing was sent.';
      }

      if (commandPhase !== 'prompt') {
        return `No ${hostLink.prompt} prompt on this connection. Nothing was sent.`;
      }

      enterIndex = 0;
      return writeEnterStep();
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
          addressee: to ? formatAx25Call(to) : undefined,
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

      if (!allowHardwareTransmit) {
        return blocked('This session does not transmit.');
      }

      if (!kissConfirmed) {
        return blocked('This Listen has no AX.25 UI frame. A KISS frame that is not a UI frame does not count. Nothing was sent.');
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
        addressee: item.to,
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

export function hostListenNote(flow: AprsHostFlowControl): string {
  if (flow === 'hardware') {
    return 'Listen opened. Flow control is hardware RTS/CTS. The driver manages RTS. RTS was not forced low. No command was sent.';
  }

  if (flow === 'none') {
    return 'Listen opened. Flow control is off, the same as the passive monitor. RTS and DTR stay low. No command was sent.';
  }

  return 'Listen opened. Flow control is software. RTS and DTR stay low. 0x11 and 0x13 may be taken by the driver before they are listed. That is a capture limit, not a conclusion. No command was sent.';
}
