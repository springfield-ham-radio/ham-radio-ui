import { canonicalAx25Call, formatAx25Call, parseAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';
import { containsAprsMonitorLine } from '~/utils/aprs-decode';
import { appendCommandBytes, hasCommandPrompt, hasCommandPromptAfter, hasTncError } from '~/utils/aprs-command';
import { APRS_HOST_BOOT_QUIET_MS, endsWithBareCommandPrompt, textShowsTncBoot } from '~/utils/aprs-host-boot';
import { aprsHostShouldExitKiss } from '~/utils/aprs-connection';
import { isAprsHostCommandLink, type AprsHostLink } from '~/utils/aprs-host-profile';
import { createKissDecoderState, encodeKissData, pushKissBytes } from '~/utils/aprs-kiss';
import { packetLinkBlockReason } from '~/utils/packet-port';
import {
  APRS_MESSAGE_ATTEMPTS,
  APRS_MESSAGE_RETRY_MS,
  callsignError,
  destinationCallsignError,
  encodeAprsMessageFrame,
  messageTextError,
  parseAprsMessageFrame,
} from '~/utils/aprs-message';
import type { AprsBytePort } from '~/utils/aprs-session';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';
import {
  escapeSerialText,
  makeTraceLine,
  pushTraceLine,
  type AprsTraceDirection,
  type AprsTraceLine,
} from '~/utils/aprs-serial-trace';
import {
  DirectionCoalesceBuffer,
  SERIAL_DIRECTION_COALESCE_IDLE_MS,
  armCoalesceIdleTimer,
  clearCoalesceIdleTimer,
  type CoalesceIdleTimer,
} from '~/utils/serial-direction-coalesce';

const INBOX_CAP = 200;
const OUTBOX_CAP = 50;
const DETECT_TRAFFIC = 'KISS on, waiting for traffic.';
const DETECT_UI = 'AX.25 UI seen.';
const DETECT_SILENCE = 'The TNC is not answering. The radio may not be in PACKET mode. Nothing more was written.';
const REJECTED_KISS = 'TNC rejected KISS ON.';
const REBOOTED_ENTRY = 'The TNC rebooted during KISS entry. Entry was not repeated.';
const COMMAND_MODE_ECHO = 'TNC is in command mode (echoing).';
const COMMAND_MODE_RESTART = 'TNC stayed in command mode after RESTART.';
const COMMAND_ECHO_MS = 200;
const MAX_ENTRY_PASSES = 2;

/** A line that is only `?`, which is a Kenwood command rejection. `?EH` is separate. */
function bareQuestionRejection(text: string): boolean {
  return /(^|[\r\n])\?[ \t]*(?:[\r\n]|$)/u.test(text);
}

/**
 * Text after RESTART that is still the TNC command prompt, not the silent
 * reboot that means KISS took.
 */
function restartLooksLikeCommand(text: string): boolean {
  const body = text.replace(/^\s*RESTART\r?\n?/u, '');

  if (!/\S/u.test(body)) {
    return false;
  }

  if (bareQuestionRejection(body)) {
    return true;
  }

  const prompt = 'cmd:';
  const last = body.lastIndexOf(prompt);

  if (last < 0) {
    return /\?EH|HBAUD|UNPROTO|KWXIMON|Kenwood Radio Modem|(?:^|[\r\n])(?:DA |HB )/u.test(body);
  }

  const tail = body.slice(last + prompt.length);

  if (!/^[\r\n\s]*$/u.test(tail)) {
    return true;
  }

  const head = body.slice(0, last);
  return /\?EH|HBAUD|UNPROTO|KWXIMON|cmd:\S|(?:^|[\r\n])(?:cmd:)?(?:DA |HB )/u.test(head);
}

function detectTextWithoutPrompt(prompt: string): string {
  return `Command-mode text was seen, but ${prompt} did not arrive after the prompt request. Nothing more was written.`;
}

type DetectPhase = AprsHostSnapshot['detectPhase'];
type DetectStep = 'listen' | 'after-text' | 'after-interrupt' | 'after-nudge' | 'after-exit';

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
  /** True after the last host enter step was written. Not set by a passive listen. */
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
  /** Connect detection. Idle until a host link is open. */
  detectPhase: 'idle' | 'listening' | 'awaiting-prompt' | 'entering' | 'waiting-traffic' | 'failed';
  detectDetail: string;
  /**
   * A TNC2 monitor line arrived in the command text and the prompt has not.
   * The connection bar uses this. It does not write.
   */
  sawMonitorLine: boolean;
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
  /** Check a detection or command timeout against now(). */
  poll(): void;
  /** Same work as the detect poll interval while detection or command waits are active. */
  runDetectClock(): void;
  /** Run Connect detection again. Listens first and does not loop. */
  retryDetection(): string | undefined;
  /** Writes the module's enter steps, each only after a fresh prompt on this connection. */
  enterHostKiss(): Promise<string | undefined>;
  clearTrace(): void;
  /** Send is the transmit choice. It does not enter KISS and does not acknowledge old messages. */
  send(input: { mine: string; to: string; text: string }): Promise<AprsHostMessage | undefined>;
  cancel(key: string): void;
  /** Move the test clock. Waiting messages retry or time out. Disconnect clears them first. */
  advance(ms: number): Promise<void>;
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
  /**
   * Every KISS data payload, including frames that are not AX.25 UI.
   * The listener must not write. Packet transmit goes through writeKissData.
   */
  addKissDataListener(listener: (payload: Uint8Array) => void): () => void;
  /** Runs while the port is still open. Used so a packet link can send DISC. */
  addDisconnectHook(hook: () => Promise<void>): () => void;
  /** Why a packet link frame would be refused. Undefined means a write is allowed. */
  packetSendBlock(): string | undefined;
  /** One KISS data frame for the packet link. Not an APRS message and not a beacon. */
  writeKissData(payload: Uint8Array): Promise<string | undefined>;
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
 * Connect on a host link runs detection once: listen, then at most one
 * prompt request, the enter steps, and an optional kissExit. It does not
 * send a beacon, a message, or KISS OFF. Command text after a KISS frame is
 * not left in an open frame. A later prompt starts that detection pass again.
 * Detection state is set before the data listener is attached, so bytes
 * already in the open buffer are not wiped and then counted as silence.
 * A prompt in that buffer still runs the enter steps. An unframed leftover
 * is KISS only when it is a 0x00 command plus an AX.25 address field or a
 * decodable frame. A stray ESC or FEND in monitor text is not that. If
 * cmd: or the Kenwood banner arrives before a decoded KISS data frame,
 * the enter steps run. Monitor text
 * with no prompt writes the module interrupt once. If the prompt still
 * has not arrived and the module declares promptNudge, those bytes are
 * written once even when the port is silent. An exact echo of the last
 * write is command mode, not a KISS frame: the nudge is written if it
 * has not been, and the pass waits for the prompt. kissExit is written
 * only when neither the interrupt nor the nudge produced text. The enter
 * steps run only after a fresh prompt. FEND FF FEND does not confirm KISS.
 * A TNC2 monitor line in the command text sets sawMonitorLine. A prompt
 * clears it. The connection bar reads the flag. Detection does not write
 * because of it.
 * Send is the only way a message
 * frame is written. A message or retry is written only after this connection
 * has parsed an AX.25 UI frame. A KISS frame that does not parse does not
 * count. Cancel, Disconnect, and the module's prompt stop retries.
 * writeKissData is a separate path for the Packet tab. It does not run on
 * connect, and it does not confirm KISS for APRS messages.
 * Automatic ack is separate, off until set, and applies only to a later
 * message addressed to the current callsign. Disconnect cancels waiting
 * messages. When this session is in KISS and the module declares kissExit,
 * Disconnect writes those bytes once and logs an outgoing KISS exit line.
 * A failed write or a port that is already gone still closes. Command mode
 * does not get that write, and KISS OFF is not sent. A later connect does
 * not send the cancelled messages again.
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
  const kissListeners = new Set<(payload: Uint8Array) => void>();
  const disconnectHooks = new Set<() => Promise<void>>();
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
  let detectPhase: DetectPhase = 'idle';
  let detectStep: DetectStep = 'listen';
  let detectDetail = '';
  let detectDeadline = Number.POSITIVE_INFINITY;
  let detectRx = 0;
  let sawText = false;
  let sawOther = false;
  let monitorPlain = '';
  let sawMonitorLine = false;
  let interruptTried = false;
  let exitTried = false;
  let nudgeTried = false;
  let textAfterInterrupt = false;
  let echoBytes: Uint8Array | undefined;
  let detectBusy = false;
  let enterInFlight = false;
  let detectTimer: ReturnType<typeof setInterval> | undefined;
  let commandBytes = new Uint8Array();
  let sessionBytes = new Uint8Array();
  let commandDeadline = 0;
  let commandActive = false;
  let commandTimer: ReturnType<typeof setInterval> | undefined;
  let hostFlow: AprsHostFlowControl = 'software';
  /** True only while connect() attaches the data listener, so a sync open buffer is visible. */
  let openingBuffer = false;
  let enterPromptWatermark = 0;
  let sawBootOutput = false;
  let bootQuietAfter = 0;
  /** Overall cap for an awaiting-prompt hold. Zero means the hold has not started. */
  let promptWaitUntil = 0;
  let promptWaitLogged = false;
  /** Full KISS ON … RESTART passes started on this connection. */
  let entryPasses = 0;
  /** Bare `?` answers to KISS ON. One retry, then fail. */
  let kissOnRejects = 0;
  /** After a rejected KISS ON or a mid-entry reboot, wait for quiet and a bare prompt. */
  let reentryHold = false;
  let reentryReason: 'reject' | 'reboot' = 'reject';
  /** The TNC echoed a KISS frame while KISS was still unconfirmed. */
  let commandModeEcho = false;
  /** RESTART was written. Later command text means it did not stick. */
  let restartWatch = false;
  let restartText = '';
  let restartQuietUntil = 0;
  let restartRetried = false;
  /** Last KISS frame written, so a split command-mode echo can be recognized. */
  let kissTxFrame: Uint8Array | undefined;
  let kissTxAt = 0;
  let kissTxMatched = 0;
  const trace: AprsTraceLine[] = [];
  let traceDropped = 0;
  const rxTraceCoalesce = new DirectionCoalesceBuffer(SERIAL_DIRECTION_COALESCE_IDLE_MS, now);
  const rxTraceIdleTimer: CoalesceIdleTimer = { current: undefined };
  const rxTraceNotes: string[] = [];
  let identity: Ax25Call | undefined;
  let clock = now();
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  function publish(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function rxTraceNoteLabel(): string {
    return rxTraceNotes.join(', ');
  }

  function rememberRxTraceNote(note: string): void {
    if (!note || rxTraceNotes.includes(note)) {
      return;
    }

    rxTraceNotes.push(note);
  }

  function flushCoalescedRxTrace(): boolean {
    clearCoalesceIdleTimer(rxTraceIdleTimer);
    const pending = rxTraceCoalesce.flushPending();

    if (!pending || pending.data.length === 0) {
      return false;
    }

    traceDropped += pushTraceLine(
      trace,
      makeTraceLine(pending.startedAtMs, 'rx', pending.data, rxTraceNoteLabel()),
    );
    rxTraceNotes.length = 0;
    return true;
  }

  function scheduleRxTraceIdleCommit(): void {
    if (!rxTraceCoalesce.peekPending()) {
      clearCoalesceIdleTimer(rxTraceIdleTimer);
      return;
    }

    armCoalesceIdleTimer(SERIAL_DIRECTION_COALESCE_IDLE_MS, () => {
      if (flushCoalescedRxTrace()) {
        publish();
      }
    }, rxTraceIdleTimer);
  }

  function record(direction: AprsTraceDirection, bytes: Uint8Array, note: string): void {
    if (direction === 'rx' && bytes.length > 0) {
      const flushed = rxTraceCoalesce.append('RECV', bytes);

      for (const chunk of flushed) {
        clearCoalesceIdleTimer(rxTraceIdleTimer);
        traceDropped += pushTraceLine(
          trace,
          makeTraceLine(chunk.startedAtMs, 'rx', chunk.data, rxTraceNoteLabel()),
        );
        rxTraceNotes.length = 0;
      }

      rememberRxTraceNote(note);

      scheduleRxTraceIdleCommit();
      return;
    }

    flushCoalescedRxTrace();
    traceDropped += pushTraceLine(trace, makeTraceLine(now(), direction, bytes, note));
  }

  /** A note that must not commit the open RX coalesce early. */
  function recordBesideRx(note: string): void {
    traceDropped += pushTraceLine(trace, makeTraceLine(now(), 'note', new Uint8Array(), note));
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
    echoBytes = Uint8Array.from(bytes);

    if (bytes.length >= 3 && bytes[0] === 0xc0 && bytes[1] === 0x00 && bytes[bytes.length - 1] === 0xc0) {
      kissTxFrame = Uint8Array.from(bytes);
      kissTxAt = now();
      kissTxMatched = 0;
    }

    return { ok: true, accepted, plugin };
  }

  /**
   * Bytes that continue the last KISS frame within the echo window.
   * A command-mode TNC sends the frame back in pieces. Those bytes are not traffic.
   */
  function takeCommandEcho(chunk: Uint8Array): { data: Uint8Array; echo: boolean } {
    if (commandModeEcho || kissConfirmed || !kissTxFrame || kissTxFrame.length === 0 || chunk.length === 0) {
      return { data: chunk, echo: false };
    }

    if (now() - kissTxAt > COMMAND_ECHO_MS) {
      kissTxMatched = 0;
      return { data: chunk, echo: false };
    }

    let index = 0;

    while (
      index < chunk.length
      && kissTxMatched + index < kissTxFrame.length
      && chunk[index] === kissTxFrame[kissTxMatched + index]
    ) {
      index += 1;
    }

    if (index === 0) {
      kissTxMatched = 0;
      return { data: chunk, echo: false };
    }

    kissTxMatched += index;
    const rest = chunk.subarray(index);

    if (kissTxMatched >= kissTxFrame.length) {
      kissTxFrame = undefined;
      kissTxMatched = 0;
      noteCommandModeEcho();
    }

    return { data: rest, echo: true };
  }

  function noteCommandModeEcho(): void {
    if (commandModeEcho) {
      return;
    }

    commandModeEcho = true;
    reentryHold = false;
    restartWatch = false;
    commandActive = false;
    hostEnterRequested = false;
    commandPhase = 'rejected';
    detectPhase = 'failed';
    detectDetail = COMMAND_MODE_ECHO;
    detectDeadline = Number.POSITIVE_INFINITY;
    clearDetectClock();
    record('note', new Uint8Array(), COMMAND_MODE_ECHO);
  }

  /** Drop one copy of the last write. ECHO defaults to ON, so the TNC sends those bytes back. */
  function stripEcho(chunk: Uint8Array): { data: Uint8Array; echoed: boolean } {
    const echo = echoBytes;

    if (!echo || echo.length === 0 || chunk.length < echo.length) {
      return { data: chunk, echoed: false };
    }

    for (let start = 0; start <= chunk.length - echo.length; start += 1) {
      let matches = true;

      for (let index = 0; index < echo.length; index += 1) {
        if (chunk[start + index] !== echo[index]) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      const data = new Uint8Array(chunk.length - echo.length);
      data.set(chunk.subarray(0, start), 0);
      data.set(chunk.subarray(start + echo.length), start);
      echoBytes = undefined;
      return { data, echoed: true };
    }

    return { data: chunk, echoed: false };
  }

  function isKissReturn(frame: { command: number; data: Uint8Array }): boolean {
    return frame.command === 0xff && frame.data.length === 0;
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
    return isAprsHostCommandLink(hostLink) && hasCommandPrompt(bytes, hostLink.prompt);
  }

  function noteBootChunk(bytes: Uint8Array): void {
    if (bytes.length === 0) {
      return;
    }

    if (textShowsTncBoot(new TextDecoder().decode(bytes))) {
      sawBootOutput = true;
      bootQuietAfter = now() + APRS_HOST_BOOT_QUIET_MS;

      if (reentryHold) {
        promptWaitUntil = Math.max(promptWaitUntil, now() + (hostLink?.waitMs ?? 5000));
        detectDeadline = bootQuietAfter;
        armDetectClock();
      }

      scheduleBootQuietPoll();
    }
  }

  function resetEntryGuards(): void {
    entryPasses = 0;
    kissOnRejects = 0;
    reentryHold = false;
    commandModeEcho = false;
    restartWatch = false;
    restartText = '';
    restartQuietUntil = 0;
    restartRetried = false;
    kissTxFrame = undefined;
    kissTxMatched = 0;
  }

  function beginReentry(reason: 'reject' | 'reboot'): void {
    const rejectAgain = reason === 'reject' && (kissOnRejects >= 1 || restartRetried);
    const rebootAgain = reason === 'reboot' && entryPasses >= MAX_ENTRY_PASSES;

    if (rejectAgain || rebootAgain) {
      reentryHold = false;
      commandActive = false;
      commandPhase = 'rejected';
      hostEnterRequested = false;
      failDetect(rejectAgain ? REJECTED_KISS : (restartRetried ? COMMAND_MODE_RESTART : REBOOTED_ENTRY));
      return;
    }

    if (reason === 'reject') {
      kissOnRejects += 1;
      bootQuietAfter = Math.max(bootQuietAfter, now() + APRS_HOST_BOOT_QUIET_MS);
    }

    reentryHold = true;
    reentryReason = reason;
    enterIndex = 0;
    hostEnterRequested = false;
    commandActive = false;
    commandPhase = 'idle';
    commandBytes = new Uint8Array();
    detectPhase = 'awaiting-prompt';
    detectStep = 'after-text';
    beginPromptBudget();
    detectDeadline = Math.max(now(), bootQuietAfter);
    detectDetail = reason === 'reject'
      ? 'TNC rejected KISS ON. Waiting for a fresh prompt to try once more.'
      : 'The TNC rebooted during KISS entry. Waiting for startup to finish, then trying again.';
    record('note', new Uint8Array(), detectDetail);
    armDetectClock();
    publish();
  }

  function sessionTailNote(message: string): string {
    const length = Math.min(200, sessionBytes.length);
    const tail = escapeSerialText(sessionBytes.subarray(sessionBytes.length - length));
    return `${message} Last ${length} session bytes: ${tail}`;
  }

  function barePromptAtEnd(): boolean {
    return isAprsHostCommandLink(hostLink) && endsWithBareCommandPrompt(sessionBytes, hostLink.prompt);
  }

  /**
   * Boot script or a prompt that is not the last thing in the buffer.
   * A bare cmd: inside cmd:HB does not count as ready to enter.
   */
  function scriptNeedsFreshPrompt(): boolean {
    return sawBootOutput || (promptSeen(sessionBytes) && !barePromptAtEnd());
  }

  function beginPromptBudget(): void {
    if (!hostLink) {
      return;
    }

    promptWaitUntil = now() + hostLink.waitMs;
    promptWaitLogged = false;
  }

  /** Next finite moment: boot quiet, or the overall wait, whichever comes first. */
  function armPromptDeadline(): void {
    if (!hostLink) {
      return;
    }

    if (promptWaitUntil === 0) {
      promptWaitUntil = now() + hostLink.waitMs;
    }

    const quietHold = sawBootOutput && !interruptTried ? bootQuietAfter : Number.POSITIVE_INFINITY;
    detectDeadline = Math.min(quietHold, promptWaitUntil);

    if (!Number.isFinite(detectDeadline) || detectDeadline < now()) {
      detectDeadline = now();
    }

    armDetectClock();
  }

  function promptWaitMessage(): string {
    if (!isAprsHostCommandLink(hostLink)) {
      return 'Waiting for a prompt.';
    }

    if (sawBootOutput) {
      return `Command text seen. Waiting for a bare ${hostLink.prompt} after startup output.`;
    }

    if (barePromptAtEnd()) {
      return `${hostLink.prompt} was already on this connection. Waiting to enter host KISS.`;
    }

    return `Command text seen. Waiting for ${hostLink.prompt}.`;
  }

  function showPromptWait(): void {
    if (detectPhase !== 'awaiting-prompt' || interruptTried || enterInFlight) {
      return;
    }

    armPromptDeadline();
    detectDetail = sessionTailNote(promptWaitMessage());

    if (!promptWaitLogged) {
      promptWaitLogged = true;
      recordBesideRx(detectDetail);
    }
  }

  /** Keep the detect poll alive through a boot-quiet hold while awaiting a bare prompt. */
  function scheduleBootQuietPoll(): void {
    if (hostLink?.entry === 'manual' || !sawBootOutput) {
      return;
    }

    if (detectPhase !== 'awaiting-prompt' || interruptTried) {
      return;
    }

    armPromptDeadline();
  }

  function startHostEnter(): void {
    if (!isAprsHostCommandLink(hostLink) || hostEnterRequested || enterInFlight || detectPhase === 'entering') {
      return;
    }

    if (commandPhase === 'restart-sent' || commandPhase === 'waiting-accept') {
      return;
    }

    if (entryPasses >= MAX_ENTRY_PASSES) {
      commandPhase = 'rejected';
      failDetect(REBOOTED_ENTRY);
      return;
    }

    entryPasses += 1;
    reentryHold = false;
    detectPhase = 'entering';
    enterIndex = 0;
    detectDeadline = Number.POSITIVE_INFINITY;
    void writeEnterStep();
  }

  function freshSessionPrompt(): boolean {
    return isAprsHostCommandLink(hostLink)
      && hasCommandPromptAfter(sessionBytes, hostLink.prompt, enterPromptWatermark);
  }

  function freshCommandPrompt(): boolean {
    return isAprsHostCommandLink(hostLink)
      && hasCommandPromptAfter(sessionBytes, hostLink.prompt, enterPromptWatermark)
      && endsWithBareCommandPrompt(sessionBytes, hostLink.prompt);
  }

  function enterPromptReady(): boolean {
    if (!isAprsHostCommandLink(hostLink) || !freshSessionPrompt()) {
      return false;
    }

    if (!endsWithBareCommandPrompt(sessionBytes, hostLink.prompt)) {
      return false;
    }

    if (!sawBootOutput) {
      return true;
    }

    return now() >= bootQuietAfter;
  }

  function detectionOwnsWait(): boolean {
    return detectPhase === 'listening' || detectPhase === 'awaiting-prompt' || detectPhase === 'entering';
  }

  function clearKissHold(): void {
    kiss.pending = [];
    kiss.inFrame = false;
    kiss.escaped = false;
    kiss.frameStartedAt = undefined;
    incompleteBytes = 0;
  }

  function hasLineEnd(bytes: Uint8Array): boolean {
    for (const byte of bytes) {
      if (byte === 0x0a || byte === 0x0d) {
        return true;
      }
    }

    return false;
  }

  function clearDetectClock(): void {
    if (detectTimer) {
      clearInterval(detectTimer);
      detectTimer = undefined;
    }
  }

  function armDetectPoll(): void {
    if (!options?.useRetryClock || detectTimer) {
      return;
    }

    detectTimer = setInterval(() => {
      tickDetectClock();
    }, 250);
  }

  function armDetectClock(): void {
    armDetectPoll();
  }

  function failDetect(detail: string): void {
    commandActive = false;
    detectPhase = 'failed';
    detectDetail = detail;
    detectDeadline = Number.POSITIVE_INFINITY;
    clearDetectClock();
    record('note', new Uint8Array(), detail);
    publish();
  }

  function finishKissTraffic(): void {
    if (!detectionOwnsWait()) {
      return;
    }

    commandActive = false;
    detectPhase = 'waiting-traffic';
    detectDetail = kissConfirmed ? DETECT_UI : DETECT_TRAFFIC;
    detectDeadline = Number.POSITIVE_INFINITY;
    clearDetectClock();
    record('note', new Uint8Array(), detectDetail);
  }

  function beginDetect(): void {
    if (!hostLink || !port?.isOpen) {
      return;
    }

    clearKissHold();
    commandActive = false;
    enterIndex = 0;
    hostEnterRequested = false;

    if (commandPhase === 'restart-sent' || commandPhase === 'waiting-accept') {
      commandPhase = 'idle';
    }

    interruptTried = false;
    exitTried = false;
    nudgeTried = false;
    textAfterInterrupt = false;
    sawText = false;
    sawOther = false;
    clearMonitorLine();
    detectRx = rxBytes;
    detectStep = 'listen';

    if (hostLink.entry === 'manual') {
      detectPhase = 'waiting-traffic';
      detectDetail = 'Listening for KISS frames. Nothing was sent.';
      detectDeadline = Number.POSITIVE_INFINITY;
      clearDetectClock();
      record('note', new Uint8Array(), detectDetail);
      publish();
      return;
    }

    enterPromptWatermark = 0;
    sawBootOutput = false;
    bootQuietAfter = 0;
    promptWaitUntil = 0;
    promptWaitLogged = false;
    resetEntryGuards();
    if (!kissConfirmed && frames === 0 && enterPromptReady()) {
      detectPhase = 'awaiting-prompt';
      detectStep = 'after-text';
      detectDetail = `${hostLink.prompt} was already on this connection. Entering host KISS.`;
      record('note', new Uint8Array(), detectDetail);
      maybeStartEnter();

      if (detectPhase === 'awaiting-prompt') {
        beginPromptBudget();
        showPromptWait();
      }

      return;
    }

    if (!kissConfirmed && frames === 0 && promptSeen(sessionBytes)) {
      detectPhase = 'awaiting-prompt';
      detectStep = 'after-text';
      sawText = true;
      beginPromptBudget();
      showPromptWait();
      maybeStartEnter();
      return;
    }

    detectPhase = 'listening';
    detectDeadline = now() + hostLink.listenMs;
    detectDetail = 'Listening for a KISS frame or command text.';
    record('note', new Uint8Array(), detectDetail);
    armDetectClock();
  }

  function isDetectTextByte(byte: number): boolean {
    return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
  }

  function plausibleAx25Address(bytes: Uint8Array, offset: number): boolean {
    if (offset + 7 > bytes.length) {
      return false;
    }

    let call = '';

    for (let index = 0; index < 6; index += 1) {
      const shifted = bytes[offset + index] ?? 0;

      if ((shifted & 0x01) !== 0) {
        return false;
      }

      call += String.fromCharCode((shifted >> 1) & 0x7f);
    }

    const ssidByte = bytes[offset + 6] ?? 0;

    if ((ssidByte & 0x60) !== 0x60) {
      return false;
    }

    const station = { call: call.trim().toUpperCase(), ssid: (ssidByte >> 1) & 0x0f };
    return canonicalAx25Call(formatAx25Call(station)) !== undefined;
  }

  /** 0x00 plus a UI frame, or 0x00 plus destination and source address fields. */
  function plausibleKissPayload(payload: Uint8Array): boolean {
    if (parseAx25Ui(payload)) {
      return true;
    }

    return plausibleAx25Address(payload, 0) && plausibleAx25Address(payload, 7);
  }

  function bytesLookLikeKissData(bytes: Uint8Array): boolean {
    for (let index = 0; index < bytes.length; index += 1) {
      if (bytes[index] !== 0x00) {
        continue;
      }

      if (plausibleKissPayload(bytes.subarray(index + 1))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Bytes already sitting in the adapter when the listener attaches.
   *
   * Only a KISS data command followed by an AX.25 address field counts.
   * Monitor text with ESC or a trailing FEND does not.
   */
  function unframedOpenBuffer(ignored: Uint8Array, dataFrames: number): boolean {
    if (!openingBuffer || dataFrames > 0) {
      return false;
    }

    if (bytesLookLikeKissData(ignored)) {
      return true;
    }

    return kiss.pending.length > 0 && kiss.pending[0] === 0x00 && bytesLookLikeKissData(Uint8Array.from(kiss.pending));
  }

  function noteUnframedOpen(): void {
    if (!hostLink || !detectionOwnsWait()) {
      return;
    }

    commandActive = false;
    detectPhase = 'waiting-traffic';
    detectDeadline = Number.POSITIVE_INFINITY;
    clearDetectClock();
    detectDetail = 'Unframed bytes were already buffered when the port opened. Treated as KISS, not silence. KISS on, waiting for traffic. Nothing was sent.';
    record('note', new Uint8Array(), detectDetail);
  }

  function clearMonitorLine(): void {
    monitorPlain = '';
    sawMonitorLine = false;
  }

  /**
   * Remember a TNC2 monitor line from bytes outside a KISS frame.
   *
   * A header that is still missing its colon does not count. The prompt
   * clears the flag. Nothing is written.
   */
  function noteMonitorBytes(bytes: Uint8Array): void {
    if (sawMonitorLine || bytes.length === 0 || kissConfirmed) {
      return;
    }

    if (detectPhase !== 'listening' && detectPhase !== 'awaiting-prompt' && detectPhase !== 'failed') {
      return;
    }

    monitorPlain = `${monitorPlain}${new TextDecoder().decode(bytes)}`.slice(-2048);

    if (containsAprsMonitorLine(monitorPlain)) {
      sawMonitorLine = true;
    }
  }

  function noteDetectBytes(ignored: Uint8Array): void {
    if ((detectPhase !== 'listening' && detectPhase !== 'awaiting-prompt') || !hostLink) {
      return;
    }

    for (const byte of ignored) {
      const text = isDetectTextByte(byte);

      if (text) {
        sawText = true;

        if (detectStep === 'after-interrupt') {
          textAfterInterrupt = true;
        }
      } else {
        sawOther = true;
      }
    }

    if (detectPhase === 'listening' && sawText) {
      detectPhase = 'awaiting-prompt';
      detectStep = 'after-text';
      beginPromptBudget();
      armPromptDeadline();
    }
  }

  /**
   * Command mode after a KISS guess, or while KISS is still unconfirmed.
   *
   * A decoded KISS data frame is the only confirmation. cmd: or the Kenwood
   * banner before that runs the same enter steps as a prompt in the open buffer.
   */
  function resumeUnconfirmedCommand(): void {
    if (
      !hostLink
      || hostLink.entry === 'manual'
      || kissConfirmed
      || detectPhase === 'entering'
      || enterInFlight
      || commandModeEcho
      || reentryHold
    ) {
      return;
    }

    if (detectPhase !== 'waiting-traffic' && detectPhase !== 'failed') {
      return;
    }

    if (
      detectPhase !== 'failed'
      && (commandPhase === 'waiting-prompt' || commandPhase === 'restart-sent' || hostEnterRequested)
    ) {
      return;
    }

    const prompt = promptSeen(sessionBytes);
    const banner = new TextDecoder().decode(sessionBytes).includes('Kenwood Radio Modem');

    if (!prompt && !banner) {
      return;
    }

    const fromFailed = detectPhase === 'failed';
    detectPhase = 'awaiting-prompt';
    detectStep = 'after-text';
    commandActive = false;
    if (fromFailed || commandPhase === 'waiting-prompt' || commandPhase === 'timed-out') {
      commandPhase = 'idle';
    }
    beginPromptBudget();
    showPromptWait();
  }

  function tickDetectClock(): void {
    if (restartWatch && restartQuietUntil > 0 && now() >= restartQuietUntil && !kissConfirmed && !commandModeEcho) {
      settleRestartWatch();
    }

    const owned = detectionOwnsWait();
    void expireDetect();

    if (!owned) {
      expireCommand();
    }

    if (sawBootOutput && now() >= bootQuietAfter && detectPhase === 'awaiting-prompt') {
      maybeStartEnter();
    }
  }

  function maybeStartEnter(): void {
    if (!isAprsHostCommandLink(hostLink) || commandModeEcho) {
      return;
    }

    if (reentryHold) {
      if (now() < bootQuietAfter || !enterPromptReady() || enterInFlight) {
        return;
      }

      reentryHold = false;
      startHostEnter();
      return;
    }

    if (hostEnterRequested || commandPhase === 'restart-sent' || commandPhase === 'waiting-accept') {
      return;
    }

    if (detectPhase !== 'awaiting-prompt' || !enterPromptReady() || enterInFlight) {
      return;
    }

    startHostEnter();
  }

  async function writeDetectInterrupt(): Promise<void> {
    if (interruptTried || !isAprsHostCommandLink(hostLink)) {
      return;
    }

    interruptTried = true;
    textAfterInterrupt = false;
    detectStep = 'after-interrupt';
    // Bytes already in the buffer, including cmd:HB, are not a fresh prompt.
    enterPromptWatermark = sessionBytes.length;
    const wrote = await writeBytes(hostLink.interrupt);

    if (!wrote.ok) {
      failDetect(`The prompt request was not accepted. ${wrote.reason} Nothing else was sent.`);
      return;
    }

    detectPhase = 'awaiting-prompt';
    commandBytes = new Uint8Array();
    commandActive = true;
    commandPhase = 'waiting-prompt';
    const followUp = now() + hostLink.waitMs;
    detectDeadline = scriptNeedsFreshPrompt() && promptWaitUntil > 0
      ? Math.min(followUp, Math.max(now(), promptWaitUntil))
      : followUp;
    commandDeadline = detectDeadline;
    commandDetail = `Prompt request written once. ${acceptanceNote(wrote)}Waiting for ${hostLink.prompt}.`;
    detectDetail = sessionTailNote(commandDetail);
    record('tx-command', hostLink.interrupt, detectDetail);
    armDetectClock();
    publish();
  }

  async function writeDetectNudge(): Promise<void> {
    const nudge = hostLink?.promptNudge;

    if (!hostLink || !nudge || nudgeTried) {
      return;
    }

    nudgeTried = true;
    const wrote = await writeBytes(nudge);

    if (!wrote.ok) {
      failDetect(`The prompt nudge was not accepted. ${wrote.reason} Nothing else was sent.`);
      return;
    }

    detectPhase = 'awaiting-prompt';
    detectStep = 'after-nudge';
    commandBytes = new Uint8Array();
    commandActive = true;
    commandPhase = 'waiting-prompt';
    detectDeadline = now() + hostLink.waitMs;
    commandDeadline = detectDeadline;
    commandDetail = `Prompt nudge written once. ${acceptanceNote(wrote)}Waiting for ${hostLink.prompt}.`;
    detectDetail = commandDetail;
    record('tx-command', nudge, commandDetail);
    publish();
  }

  /**
   * ECHO is on in command mode. A KISS TNC does not send our bytes back.
   * The match is the nudge signal when the prompt itself has not arrived.
   */
  function noteCommandEcho(): void {
    if (!hostLink || kissConfirmed || detectPhase === 'entering' || detectPhase === 'waiting-traffic' || !detectionOwnsWait()) {
      return;
    }

    if (promptSeen(sessionBytes)) {
      return;
    }

    if (hostLink.promptNudge && !nudgeTried) {
      void writeDetectNudge();
    }
  }

  async function writeDetectExit(): Promise<void> {
    const exit = hostLink?.kissExit;

    if (exitTried || !hostLink || !exit) {
      failDetect(DETECT_SILENCE);
      return;
    }

    exitTried = true;
    const wrote = await writeBytes(exit);

    if (!wrote.ok) {
      failDetect(`The KISS exit was not accepted. ${wrote.reason} Nothing else was sent.`);
      return;
    }

    detectPhase = 'awaiting-prompt';
    detectStep = 'after-exit';
    commandBytes = new Uint8Array();
    commandActive = true;
    commandPhase = 'waiting-prompt';
    detectDeadline = now() + hostLink.waitMs;
    commandDeadline = detectDeadline;
    commandDetail = `KISS exit written once. ${acceptanceNote(wrote)}Waiting for ${hostLink.prompt}.`;
    detectDetail = commandDetail;
    record('tx-command', exit, commandDetail);
    publish();
  }

  function settleRestartWatch(): void {
    if (!restartWatch) {
      return;
    }

    const text = restartText;
    const questionOnly = bareQuestionRejection(text) && !textShowsTncBoot(text) && !/\?EH|HBAUD|UNPROTO|KWXIMON/u.test(text);
    restartQuietUntil = 0;
    restartText = '';

    if (!restartLooksLikeCommand(text)) {
      restartWatch = false;
      clearDetectClock();
      return;
    }

    if (restartRetried) {
      restartWatch = false;
      commandActive = false;
      commandPhase = 'rejected';
      hostEnterRequested = false;
      failDetect(COMMAND_MODE_RESTART);
      return;
    }

    restartRetried = true;
    restartWatch = false;
    entryPasses = 1;
    beginReentry(questionOnly ? 'reject' : 'reboot');
  }

  function noteRestartResult(bytes: Uint8Array): void {
    if (!restartWatch || kissConfirmed || commandModeEcho || bytes.length === 0) {
      return;
    }

    const text = new TextDecoder().decode(bytes);

    if (!/\S/u.test(text)) {
      return;
    }

    restartText += text;

    if (textShowsTncBoot(text) || text.includes('cmd:') || bareQuestionRejection(text) || text.includes('?EH')) {
      restartQuietUntil = now() + APRS_HOST_BOOT_QUIET_MS;
      detectDeadline = restartQuietUntil;
      armDetectClock();
    }
  }

  async function expireDetect(): Promise<void> {
    if (reentryHold && detectPhase === 'awaiting-prompt' && !enterInFlight && !detectBusy) {
      if (now() >= bootQuietAfter && enterPromptReady()) {
        maybeStartEnter();
        return;
      }

      const overallDue = promptWaitUntil > 0 && now() >= promptWaitUntil;

      if (!overallDue) {
        detectDeadline = now() < bootQuietAfter ? bootQuietAfter : promptWaitUntil;
        armDetectClock();
        return;
      }

      reentryHold = false;
      commandActive = false;
      commandPhase = 'rejected';
      hostEnterRequested = false;
      failDetect(reentryReason === 'reject' ? REJECTED_KISS : REBOOTED_ENTRY);
      return;
    }

    if (
      !detectBusy
      && isAprsHostCommandLink(hostLink)
      && port?.isOpen
      && detectPhase === 'awaiting-prompt'
      && !enterInFlight
    ) {
      if (enterPromptReady()) {
        maybeStartEnter();
        return;
      }
    }

    releaseKissHold();

    if (detectBusy || !hostLink || hostLink.entry === 'manual' || !port?.isOpen || !detectionOwnsWait()) {
      return;
    }

    if (detectPhase === 'entering') {
      if (!commandActive || now() < commandDeadline) {
        return;
      }

      detectBusy = true;
      commandActive = false;
      const waitingForAccept = commandPhase === 'waiting-accept';
      const previous = hostLink.enter[enterIndex - 1]?.label;
      const following = hostLink.enter[enterIndex]?.label;
      commandPhase = 'timed-out';
      commandDetail = waitingForAccept && previous && following
        ? `No ${hostLink.prompt} after ${previous}. ${following} was not sent.`
        : `No ${hostLink.prompt} prompt. The request was not repeated, and no carriage return was sent.`;
      detectPhase = 'failed';
      detectDetail = commandDetail;
      detectDeadline = Number.POSITIVE_INFINITY;
      clearDetectClock();
      record('note', new Uint8Array(), commandDetail);
      publish();
      detectBusy = false;
      return;
    }

    if (now() < detectDeadline) {
      return;
    }

    detectBusy = true;
    detectDeadline = Number.POSITIVE_INFINITY;

    try {
      if (detectPhase === 'awaiting-prompt') {
        if (enterPromptReady()) {
          maybeStartEnter();
          return;
        }

        const overallDue = promptWaitUntil > 0 && now() >= promptWaitUntil;
        const quietPending = sawBootOutput && now() < bootQuietAfter;

        if (quietPending && !overallDue) {
          detectDeadline = bootQuietAfter;
          armDetectClock();
          return;
        }

        const bare = barePromptAtEnd();

        if (overallDue && bare) {
          startHostEnter();
          return;
        }

        if (!interruptTried && !bare) {
          await writeDetectInterrupt();

          if (
            detectPhase === 'awaiting-prompt'
            && scriptNeedsFreshPrompt()
            && promptWaitUntil > 0
            && now() >= promptWaitUntil
          ) {
            startHostEnter();
          }

          return;
        }

        if (interruptTried && overallDue && scriptNeedsFreshPrompt()) {
          startHostEnter();
          return;
        }

        if (!interruptTried && (detectStep === 'after-text' || sawText) && !promptSeen(sessionBytes)) {
          await writeDetectInterrupt();
          return;
        }
      }

      if (detectPhase === 'listening') {
        if (sawText) {
          await writeDetectInterrupt();
          return;
        }

        if (sawOther || incompleteBytes > 0 || rxBytes !== detectRx) {
          failDetect(incompleteBytes > 0
            ? 'An incomplete KISS frame was still open. Nothing more was written.'
            : 'Bytes arrived that are not a KISS frame or command text. Nothing more was written.');
          return;
        }

        await writeDetectInterrupt();
        return;
      }

      if (detectStep === 'after-interrupt' && hostLink.promptNudge && !nudgeTried && !promptSeen(sessionBytes)) {
        await writeDetectNudge();
        return;
      }

      if (
        (detectStep === 'after-nudge' || detectStep === 'after-interrupt')
        && !sawText
        && !textAfterInterrupt
        && commandBytes.length === 0
        && !promptSeen(sessionBytes)
        && hostLink.kissExit
        && !exitTried
      ) {
        await writeDetectExit();
        return;
      }

      if (!interruptTried && (detectStep === 'after-text' || sawText) && !promptSeen(sessionBytes)) {
        await writeDetectInterrupt();
        return;
      }

      if (sawText || textAfterInterrupt || detectStep === 'after-nudge' || detectStep === 'after-text') {
        failDetect(detectTextWithoutPrompt(hostLink.prompt));
        return;
      }

      failDetect(DETECT_SILENCE);
    } finally {
      detectBusy = false;
    }
  }

  function expireCommand(): void {
    if (detectionOwnsWait() || !commandActive || now() < commandDeadline || !hostLink) {
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

    clearMonitorLine();

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
    const entering = detectPhase === 'awaiting-prompt'
      || detectPhase === 'listening'
      || (!kissConfirmed && (detectPhase === 'waiting-traffic' || detectPhase === 'failed'));
    commandDetail = entering
      ? `${hostLink.prompt} arrived. Entering host KISS.`
      : afterInterrupt
        ? `${hostLink.prompt} arrived after the prompt request. The enter steps have not been written.`
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

    if (commandPhase === 'waiting-accept' && detectPhase === 'entering') {
      const reply = new TextDecoder().decode(commandBytes);

      if (bareQuestionRejection(reply)) {
        beginReentry('reject');
        return;
      }

      if (textShowsTncBoot(reply)) {
        beginReentry('reboot');
        return;
      }
    }

    if (!freshCommandPrompt()) {
      return;
    }

    if (commandPhase === 'waiting-prompt') {
      commandActive = false;
      commandPhase = 'prompt';
      commandDetail = `${hostLink.prompt} arrived after the prompt request. The enter steps have not been written.`;
      record('note', new Uint8Array(), commandDetail);
      return;
    }

    if (commandPhase === 'waiting-accept') {
      if (enterInFlight) {
        return;
      }

      commandActive = false;
      void writeEnterStep();
    }
  }

  async function writeEnterStep(): Promise<string | undefined> {
    const step = hostLink?.enter[enterIndex];

    if (enterInFlight) {
      return 'Already waiting. Nothing more was sent.';
    }

    if (!hostLink || !step) {
      return 'This radio has no host command procedure. Nothing was sent.';
    }

    const automatic = detectPhase === 'entering';
    enterInFlight = true;
    const bytes = new TextEncoder().encode(step.text);
    const following = hostLink.enter[enterIndex + 1];
    if (following) {
      enterIndex += 1;
      commandBytes = new Uint8Array();
      commandActive = true;
      commandDeadline = now() + hostLink.waitMs;
      commandPhase = 'waiting-accept';
    }

    const wrote = await writeBytes(bytes);
    enterInFlight = false;

    if (wrote.ok) {
      enterPromptWatermark = sessionBytes.length;
    }

    if (automatic && detectPhase !== 'entering') {
      return undefined;
    }

    if (!wrote.ok) {
      commandActive = false;
      commandPhase = 'rejected';
      commandDetail = following
        ? `${step.label} was not accepted. ${wrote.reason} ${following.label} was not sent.`
        : `${step.label} was not written. ${wrote.reason}`;
      if (automatic) {
        detectPhase = 'failed';
        detectDetail = commandDetail;
        clearDetectClock();
      }
      record('note', new Uint8Array(), commandDetail);
      publish();
      return commandDetail;
    }

    if (!following) {
      commandActive = false;
      commandPhase = 'restart-sent';
      hostEnterRequested = true;
      commandBytes = new Uint8Array();
      commandDetail = `${step.label} written once after ${hostLink.prompt}. ${acceptanceNote(wrote)}KISS unconfirmed. This is not repeated.`;
      if (automatic) {
        detectPhase = 'waiting-traffic';
        detectDetail = DETECT_TRAFFIC;
        detectDeadline = Number.POSITIVE_INFINITY;
        clearDetectClock();
        restartWatch = true;
        restartText = '';
        restartQuietUntil = 0;
        commandDetail = `${commandDetail} ${DETECT_TRAFFIC}`;
      }
      record('tx-command', bytes, commandDetail);
      publish();
      return undefined;
    }

    commandDetail = `${step.label} written once. ${acceptanceNote(wrote)}Waiting for another ${hostLink.prompt} before ${following.label}.`;
    record('tx-command', bytes, commandDetail);

    if (hostLink.errorReply && hasTncError(commandBytes, hostLink.errorReply) && !promptSeen(commandBytes)) {
      commandActive = false;
      commandPhase = 'rejected';
      commandDetail = `The TNC answered ${hostLink.errorReply}. ${following.label} was not sent.`;
      if (automatic) {
        detectPhase = 'failed';
        detectDetail = commandDetail;
        clearDetectClock();
      }
      record('note', new Uint8Array(), commandDetail);
    } else if (freshCommandPrompt()) {
      commandActive = false;
      void writeEnterStep();
    }

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

  function readKiss(chunk: Uint8Array): ReturnType<typeof pushKissBytes> {
    const decoded = pushKissBytes(kiss, chunk, now());
    const pending = Uint8Array.from(kiss.pending);

    if (!hostLink || !kiss.inFrame || pending.length === 0 || pending[0] === 0x00 || !promptSeen(pending)) {
      return decoded;
    }

    clearKissHold();
    const ignoredBytes = new Uint8Array(decoded.ignoredBytes.length + pending.length);
    ignoredBytes.set(decoded.ignoredBytes, 0);
    ignoredBytes.set(pending, decoded.ignoredBytes.length);
    return {
      ...decoded,
      ignored: decoded.ignored + pending.length,
      ignoredBytes,
      holding: 0,
    };
  }

  function noteKissLost(ignored: Uint8Array): void {
    if (!hostLink || !kissConfirmed || ignored.length === 0 || (kiss.inFrame && kiss.pending.length > 0)) {
      return;
    }

    const promptHit = hasCommandPrompt(ignored, hostLink.prompt);

    if (!promptHit && !hasLineEnd(ignored)) {
      return;
    }

    loseKissConfirmation(promptHit
      ? `${hostLink.prompt} arrived on this connection. KISS is not confirmed. Queued transmissions were stopped.`
      : 'Command text arrived on this connection. KISS is not confirmed. Queued transmissions were stopped.');

    if (detectPhase === 'idle' || detectPhase === 'waiting-traffic' || detectPhase === 'failed') {
      beginDetect();
    }

    if (detectPhase === 'listening') {
      noteDetectBytes(ignored);
    }
  }

  const onData = (chunk: Uint8Array): void => {
    const current = generation;
    const stripped = stripEcho(chunk);
    let commandEcho = stripped.echoed
      && !kissConfirmed
      && chunk.length >= 3
      && chunk[0] === 0xc0
      && chunk[1] === 0x00
      && chunk[chunk.length - 1] === 0xc0;

    if (commandEcho) {
      noteCommandModeEcho();
    }

    const splitEcho = takeCommandEcho(stripped.data);
    commandEcho = commandEcho || splitEcho.echo;
    const decoded = readKiss(splitEcho.data);
    const dataFrames = decoded.frames.filter((frame) => !isKissReturn(frame));
    const kissReturns = decoded.frames.length - dataFrames.length;
    const quiet = chunk.length === 0 && decoded.ignored === 0 && dataFrames.length === 0 && kissReturns === 0 && decoded.overflow === 0 && decoded.invalid === 0;
    incompleteBytes = decoded.holding;

    if (quiet) {
      return;
    }

    if (chunk.length > 0) {
      rxBytes += chunk.length;
      rxChunks += 1;
    }
    commandTextBytes += decoded.ignored;
    invalidBytes += decoded.invalid;
    overflowDrops += decoded.overflow;
    incompleteBytes = decoded.holding;
    const payloads = dataFrames.filter((frame) => (frame.command & 0x0f) === 0).map((frame) => frame.data);
    frames += dataFrames.length;
    const notes: string[] = [];

    if (stripped.echoed || commandEcho) {
      notes.push('echo of the last write, not a KISS frame');
    }

    if (decoded.ignored > 0) {
      notes.push(`${decoded.ignored} command-text`);
    }

    if (dataFrames.length > 0) {
      notes.push(`${dataFrames.length} KISS`);
    }

    if (kissReturns > 0) {
      notes.push('KISS return, not a data frame');

      if (dataFrames.length === 0 && decoded.ignored === 0 && decoded.invalid === 0 && detectPhase === 'listening') {
        detectRx = rxBytes;
      }
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
      for (const listener of kissListeners) {
        try {
          listener(payload);
        } catch {
          // A packet listener cannot stop APRS decode.
        }
      }

      if (!parseAx25Ui(payload)) {
        continue;
      }

      kissConfirmed = true;
      commandTextAtConfirm = commandText.length;
      notes.push('AX.25 UI');
      options?.onAx25Ui?.(payload);
    }

    const openLeftover = unframedOpenBuffer(decoded.ignoredBytes, dataFrames.length);

    if (dataFrames.length > 0 && detectionOwnsWait()) {
      finishKissTraffic();
    } else if (!openLeftover && decoded.ignoredBytes.length > 0) {
      noteDetectBytes(decoded.ignoredBytes);
    }

    if (openLeftover) {
      noteUnframedOpen();
    }

    if (decoded.ignoredBytes.length > 0 && !openLeftover) {
      commandText = appendCommandBytes(commandText, decoded.ignoredBytes);
      noteRestartResult(decoded.ignoredBytes);
    }

    record('rx', chunk, notes.join(', ') || 'empty');

    if (openLeftover) {
      if (current === generation) {
        publish();
      }

      return;
    }

    noteKissLost(decoded.ignoredBytes);

    if (kissConfirmed && promptSeen(commandText.subarray(commandTextAtConfirm))) {
      noteKissLost(commandText.subarray(commandTextAtConfirm));
    }

    if (!openLeftover && decoded.ignoredBytes.length > 0) {
      noteMonitorBytes(decoded.ignoredBytes);
    }

    sessionBytes = appendCommandBytes(sessionBytes, chunk);
    noteBootChunk(chunk);
    if (stripped.echoed) {
      noteCommandEcho();
    }
    resumeUnconfirmedCommand();
    noteConnectionPrompt();

    if (
      openingBuffer
      && hostLink
      && dataFrames.length === 0
      && !kissConfirmed
      && frames === 0
      && promptSeen(sessionBytes)
      && detectPhase === 'listening'
    ) {
      detectPhase = 'awaiting-prompt';
      detectStep = 'after-text';
      sawText = true;
      beginPromptBudget();
    }

    if (detectPhase === 'awaiting-prompt' && !interruptTried && !enterPromptReady()) {
      showPromptWait();
    }

    if (commandActive) {
      commandBytes = appendCommandBytes(commandBytes, chunk);
      considerCommandReply(dataFrames.length);
    }

    maybeStartEnter();

    if (detectPhase === 'entering' && commandPhase === 'rejected') {
      detectPhase = 'failed';
      detectDetail = commandDetail;
      clearDetectClock();
    }

    if (kissConfirmed && detectPhase === 'waiting-traffic' && detectDetail === DETECT_TRAFFIC) {
      detectDetail = DETECT_UI;
      record('note', new Uint8Array(), DETECT_UI);
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

  function releaseKissHold(): void {
    onData(new Uint8Array());
  }

  const onError = (cause: Error): void => {
    error = cause.message;
    publish();
  };

  /** Best-effort KISS exit on a port handle that is not yet (or no longer) the session port. */
  async function writeManualKissExitOnHandle(handle: AprsHostBytePort, exit: Uint8Array): Promise<void> {
    if (!handle.isOpen || !handle.write) {
      return;
    }

    try {
      await handle.write(exit);
    } catch {
      // Superseded opens still close when exit is rejected.
    }
  }

  /**
   * One declared KISS exit before the handle closes. Best effort: a missing
   * port or a rejected write is logged and does not stop the close.
   */
  async function exitKissBeforeClose(): Promise<'sent' | 'failed' | 'skipped'> {
    if (!aprsHostShouldExitKiss({
      open: port?.isOpen ? 'host' : undefined,
      kissConfirmed,
      detectPhase,
      commandPhase,
    })) {
      return 'skipped';
    }

    const exit = hostLink?.kissExit;

    if (!exit) {
      return 'skipped';
    }

    if (!port?.isOpen || !port.write) {
      record('note', new Uint8Array(), 'KISS exit was not sent. The port was already gone. The port will still close.');
      return 'failed';
    }

    const wrote = await writeBytes(exit);

    if (!wrote.ok) {
      record('note', new Uint8Array(), `KISS exit was not accepted. ${wrote.reason} The port will still close.`);
      return 'failed';
    }

    record('tx-command', exit, `KISS exit. ${acceptanceNote(wrote)}Disconnect returns the TNC to command mode.`);
    return 'sent';
  }

  return {
    snapshot() {
      const committed = trace.map((line) => ({ ...line }));
      const pending = rxTraceCoalesce.peekPending();

      if (pending) {
        committed.push({
          ...makeTraceLine(pending.startedAtMs, 'rx', pending.data, rxTraceNoteLabel()),
          provisional: true,
        });
      }

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
        detectPhase,
        detectDetail,
        sawMonitorLine,
        hostFlow,
        trace: committed,
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
      enterPromptWatermark = 0;
      sawBootOutput = false;
      bootQuietAfter = 0;
      promptWaitUntil = 0;
      promptWaitLogged = false;
      commandActive = false;
      hostEnterRequested = false;
      hostFlow = capture?.flowControl ?? 'software';

      try {
        const opened = await openPort();

        if (current !== generation) {
          if (hostLink?.entry === 'manual' && hostLink.kissExit) {
            await writeManualKissExitOnHandle(opened, hostLink.kissExit);
          }

          await opened.close();
          return;
        }

        port = opened;
        path = nextPath;
        ackOptIn = false;
        record('note', new Uint8Array(), hostListenNote(hostFlow));
        beginDetect();
        if (hostLink?.entry !== 'manual') {
          armDetectPoll();
        }
        openingBuffer = true;

        try {
          opened.on('data', onData);
        } finally {
          openingBuffer = false;
        }

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
      flushCoalescedRxTrace();
      const hooks = [...disconnectHooks];

      for (const hook of hooks) {
        try {
          await hook();
        } catch {
          // The port still closes when a packet shutdown throws.
        }
      }

      let kissExit: 'sent' | 'failed' | 'skipped' = 'skipped';

      try {
        kissExit = await exitKissBeforeClose();
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : 'The KISS exit failed.';
        record('note', new Uint8Array(), `KISS exit was not accepted. ${reason} The port will still close.`);
        kissExit = 'failed';
      }

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
      clearDetectClock();
      clearMonitorLine();
      detectPhase = 'idle';
      detectDetail = '';
      detectDeadline = Number.POSITIVE_INFINITY;
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
      echoBytes = undefined;
      kiss.frameStartedAt = undefined;

      if (!current) {
        publish();
        return;
      }

      current.off('data', onData);
      current.off('error', onError);
      const closed = kissExit === 'sent'
        ? 'Disconnected after KISS exit. The reply log is kept until Clear.'
        : kissExit === 'failed'
          ? 'Disconnected. KISS exit did not complete. The reply log is kept until Clear.'
          : hooks.length > 0
            ? 'Disconnected. Packet shutdown ran before the port closed. The reply log is kept until Clear.'
            : 'Disconnected. The reply log is kept until Clear. Nothing was sent.';
      record('note', new Uint8Array(), closed);
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

      if (!isAprsHostCommandLink(hostLink)) {
        return 'This radio has no host command procedure. Nothing was sent.';
      }

      if (commandPhase === 'prompt') {
        return `${hostLink.prompt} is already on this connection. Nothing was sent.`;
      }

      if (commandActive || enterInFlight || detectPhase === 'entering') {
        return 'Already waiting. Nothing more was sent.';
      }

      if (detectPhase === 'listening' || detectPhase === 'awaiting-prompt') {
        detectPhase = 'idle';
        detectDeadline = Number.POSITIVE_INFINITY;
        clearDetectClock();
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
      if (!commandActive && !detectionOwnsWait()) {
        return;
      }

      commandActive = false;
      commandPhase = 'cancelled';
      commandDetail = 'Cancelled. No further command bytes will be written for this request.';
      detectPhase = 'failed';
      detectDetail = commandDetail;
      detectDeadline = Number.POSITIVE_INFINITY;
      clearDetectClock();
      record('note', new Uint8Array(), commandDetail);
      publish();
    },
    poll() {
      tickDetectClock();
    },
    runDetectClock() {
      tickDetectClock();
    },
    retryDetection() {
      if (!port?.isOpen) {
        return 'Listen is not open. Nothing was sent.';
      }

      if (!hostLink) {
        return 'This radio has no host command procedure. Nothing was sent.';
      }

      if (hostLink.entry === 'manual') {
        beginDetect();
        publish();
        return undefined;
      }

      if (detectionOwnsWait() || commandActive || enterInFlight) {
        return 'Detection is already running. Nothing more was sent.';
      }

      beginDetect();

      if (detectPhase === 'entering') {
        publish();
        return undefined;
      }

      if (!kissConfirmed && promptSeen(commandText)) {
        sawText = true;
        detectPhase = 'awaiting-prompt';
        detectStep = 'after-text';
        beginPromptBudget();
        showPromptWait();
        maybeStartEnter();
      }

      publish();
      return undefined;
    },
    async enterHostKiss() {
      if (!port?.isOpen || !port.write) {
        return 'Listen is not open. Nothing was sent.';
      }

      if (!isAprsHostCommandLink(hostLink)) {
        return 'This radio has no host command procedure. Nothing was sent.';
      }

      if (commandPhase !== 'prompt') {
        return `No ${hostLink.prompt} prompt on this connection. Nothing was sent.`;
      }

      enterIndex = 0;
      return writeEnterStep();
    },
    clearTrace() {
      clearCoalesceIdleTimer(rxTraceIdleTimer);
      rxTraceCoalesce.clear();
      rxTraceNotes.length = 0;
      trace.splice(0, trace.length);
      traceDropped = 0;
      publish();
    },
    async send(input) {
      const mine = canonicalAx25Call(input.mine);

      if (!mine) {
        return undefined;
      }

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

      if (!to) {
        return blocked(destinationCallsignError(input.to));
      }

      if (textError) {
        return blocked(textError);
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
      await expireDetect();

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
    addKissDataListener(listener) {
      kissListeners.add(listener);
      return () => {
        kissListeners.delete(listener);
      };
    },
    addDisconnectHook(hook) {
      disconnectHooks.add(hook);
      return () => {
        disconnectHooks.delete(hook);
      };
    },
    packetSendBlock() {
      return packetLinkBlockReason({
        connected: port?.isOpen === true,
        detectPhase,
        kissConfirmed,
        hardwareTransmit: allowHardwareTransmit,
        detectDetail,
      });
    },
    async writeKissData(payload) {
      const reason = this.packetSendBlock();

      if (reason) {
        return reason;
      }

      const wrote = await writeBytes(encodeKissData(payload));

      if (!wrote.ok) {
        return wrote.reason;
      }

      record('tx-frame', encodeKissData(payload), 'Packet link frame. Not an APRS message or beacon.');
      publish();
      return undefined;
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
