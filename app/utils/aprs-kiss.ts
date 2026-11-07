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

export interface KissFrame {
  command: number;
  data: Uint8Array;
}

export interface KissDecoder {
  frames: KissFrame[];
  /** Bytes discarded because a partial frame passed the cap. */
  overflow: number;
  /** Bytes seen before a frame starts. Monitor text lands here. */
  ignored: number;
}

export interface KissDecoderState {
  pending: number[];
  inFrame: boolean;
  escaped: boolean;
}

export function createKissDecoderState(): KissDecoderState {
  return { pending: [], inFrame: false, escaped: false };
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
 * Bytes before the first FEND are ignored. A command other than data is still
 * returned so the caller can count it and drop it. Escapes that do not form
 * FEND or FESC end the partial frame.
 */
export function pushKissBytes(state: KissDecoderState, chunk: Uint8Array): KissDecoder {
  const frames: KissFrame[] = [];
  let overflow = 0;
  let ignored = 0;

  const dropPartial = (): void => {
    state.pending = [];
    state.escaped = false;
    state.inFrame = false;
  };

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
      continue;
    }

    if (!state.inFrame) {
      ignored += 1;
      continue;
    }

    if (state.escaped) {
      state.escaped = false;

      if (byte === KISS_TFEND) {
        state.pending.push(KISS_FEND);
      } else if (byte === KISS_TFESC) {
        state.pending.push(KISS_FESC);
      } else {
        dropPartial();
      }

      continue;
    }

    if (byte === KISS_FESC) {
      state.escaped = true;
      continue;
    }

    state.pending.push(byte);

    if (state.pending.length > KISS_MAX_FRAME_BYTES) {
      overflow += 1;
      dropPartial();
    }
  }

  return { frames, overflow, ignored };
}
