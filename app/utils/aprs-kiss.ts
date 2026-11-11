/** KISS FEND. Frame delimiter from the KISS protocol, not a Kenwood command. */
export const KISS_FEND = 0xc0;

/** KISS FESC. */
export const KISS_FESC = 0xdb;

/** Transposed FEND. */
export const KISS_TFEND = 0xdc;

/** Transposed FESC. */
export const KISS_TFESC = 0xdd;

/** Data command on port 0. Parameter commands are not used. */
export const KISS_DATA_COMMAND = 0x00;

/**
 * Largest partial KISS frame kept in memory.
 *
 * Kenwood documents 4 kB of KISS buffer in the TM-D710. A longer run with no
 * FEND is dropped so a noisy port cannot grow without bound.
 */
export const KISS_MAX_FRAME_BYTES = 4096;

/**
 * A data frame that never reaches FEND is dropped after this long.
 *
 * Command text is not held for this long. A byte that is not a port-0 KISS
 * command ends the frame immediately, and a line break does the same unless
 * the frame is a data frame (command 0x00), which may carry a CR in the info.
 */
export const KISS_HOLD_MS = 1000;

export interface KissFrame {
  command: number;
  data: Uint8Array;
}

export interface KissDecoder {
  frames: KissFrame[];
  /** Times a partial frame passed the cap and was dropped. */
  overflow: number;
  /** Bytes seen before a frame starts. Command text lands here. */
  ignored: number;
  /** Those same bytes, so a `cmd:` outside a KISS frame can be told from one inside. */
  ignoredBytes: Uint8Array;
  /** Bytes dropped because an escape was not FEND or FESC. */
  invalid: number;
  /** Bytes of a KISS frame still waiting for FEND. */
  holding: number;
}

export interface KissDecoderState {
  pending: number[];
  inFrame: boolean;
  escaped: boolean;
  /** Set when a partial frame accepts its command byte. Cleared when the frame ends. */
  frameStartedAt?: number;
}

export function createKissDecoderState(): KissDecoderState {
  return { pending: [], inFrame: false, escaped: false };
}

/** Port 0 KISS commands, plus the 0xFF return. Text such as `cmd:` is not one of these. */
function isPort0Command(byte: number): boolean {
  return byte <= 0x06 || byte === 0x0f || byte === 0xff;
}

function isCommandTextByte(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
}

function hasLineBreak(bytes: number[]): boolean {
  return bytes.some((byte) => byte === 0x0a || byte === 0x0d);
}

/**
 * Wrap an AX.25 frame in one KISS data frame.
 *
 * FEND and FESC inside the payload are escaped. The command byte is data on
 * port 0. This does not build a KISS return, parameter, or TX-delay command.
 */
export function encodeKissData(payload: Uint8Array): Uint8Array {
  const out: number[] = [KISS_FEND, KISS_DATA_COMMAND];

  for (const byte of payload) {
    if (byte === KISS_FEND) {
      out.push(KISS_FESC, KISS_TFEND);
    } else if (byte === KISS_FESC) {
      out.push(KISS_FESC, KISS_TFESC);
    } else {
      out.push(byte);
    }
  }

  out.push(KISS_FEND);
  return Uint8Array.from(out);
}

/**
 * Pull complete KISS frames out of an arbitrary chunk.
 *
 * Bytes before the first FEND are ignored. After a FEND, only a port-0 KISS
 * command keeps the next bytes inside a frame. Command text, a line break in
 * any other partial, and a data frame that stays open for `KISS_HOLD_MS` are
 * returned as ignored bytes or dropped. They are not left in `holding`.
 * A command other than data is still returned so the caller can count it and
 * drop it. Escapes that do not form FEND or FESC end the partial frame.
 * `now` is the caller's clock, in milliseconds, so a test can expire a hold.
 */
export function pushKissBytes(state: KissDecoderState, chunk: Uint8Array, now = Date.now()): KissDecoder {
  const frames: KissFrame[] = [];
  const ignoredBytes: number[] = [];
  let overflow = 0;
  let ignored = 0;
  let invalid = 0;

  const dropPartial = (): void => {
    state.pending = [];
    state.escaped = false;
    state.inFrame = false;
    state.frameStartedAt = undefined;
  };

  const releasePending = (asText: boolean): void => {
    if (asText) {
      ignored += state.pending.length;
      ignoredBytes.push(...state.pending);
    } else if (state.pending.length > 0) {
      overflow += 1;
    }

    dropPartial();
  };

  if (
    state.inFrame
    && state.pending.length > 0
    && state.frameStartedAt !== undefined
    && now - state.frameStartedAt >= KISS_HOLD_MS
  ) {
    releasePending(state.pending.every((byte) => isCommandTextByte(byte)));
  }

  for (const byte of chunk) {
    if (byte === KISS_FEND) {
      if (state.inFrame && state.pending.length > 0 && !state.escaped) {
        frames.push({
          command: state.pending[0] ?? 0,
          data: Uint8Array.from(state.pending.slice(1)),
        });
      }

      state.pending = [];
      state.escaped = false;
      state.inFrame = true;
      state.frameStartedAt = undefined;
      continue;
    }

    if (state.inFrame && state.pending.length === 0 && !state.escaped && !isPort0Command(byte)) {
      state.inFrame = false;
      state.frameStartedAt = undefined;
    }

    if (!state.inFrame) {
      ignored += 1;
      ignoredBytes.push(byte);
      continue;
    }

    if (state.pending.length === 0 && !state.escaped) {
      state.frameStartedAt = now;
    }

    if (state.escaped) {
      state.escaped = false;

      if (byte === KISS_TFEND) {
        state.pending.push(KISS_FEND);
      } else if (byte === KISS_TFESC) {
        state.pending.push(KISS_FESC);
      } else {
        invalid += state.pending.length + 1;
        dropPartial();
      }

      continue;
    }

    if (byte === KISS_FESC) {
      state.escaped = true;
      continue;
    }

    state.pending.push(byte);

    if (state.pending[0] !== KISS_DATA_COMMAND && hasLineBreak(state.pending)) {
      releasePending(true);
      continue;
    }

    if (state.pending.length > KISS_MAX_FRAME_BYTES) {
      overflow += 1;
      dropPartial();
    }
  }

  return {
    frames,
    overflow,
    ignored,
    ignoredBytes: Uint8Array.from(ignoredBytes),
    invalid,
    holding: state.inFrame ? state.pending.length : 0,
  };
}
