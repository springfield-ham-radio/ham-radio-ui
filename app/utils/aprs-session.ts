import { decodeAprsMonitorLine, type AprsDecodedPacket } from '~/utils/aprs-decode';
import { consumeAprsBytes, createAprsLineBuffer, takeAprsPartial, type AprsLineBuffer } from '~/utils/aprs-line-buffer';
import { createAprsFoldState, foldAprsLine, type AprsFoldState, type AprsLogLine, type AprsStation } from '~/utils/aprs-stations';

export interface AprsBytePort {
  isOpen: boolean;
  on(event: 'data', handler: (chunk: Uint8Array) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  off(event: 'data' | 'error', handler: (payload: Uint8Array | Error) => void): void;
  close(): void | Promise<void>;
}

export interface AprsSessionSnapshot {
  connected: boolean;
  path?: string;
  error?: string;
  stations: AprsStation[];
  log: AprsLogLine[];
}

export interface AprsReceiveSession {
  snapshot(): AprsSessionSnapshot;
  connect(path: string, openPort: () => Promise<AprsBytePort>): Promise<void>;
  /** Record a connect refusal without opening a port or clearing the log. */
  unavailable(message: string): void;
  /** Feed monitor text already received. Does not write to the port. */
  receiveText(text: string): void;
  disconnect(): Promise<void>;
  clear(): void;
  subscribe(listener: () => void): void;
  unsubscribe(listener: () => void): void;
}

/**
 * Receive-only TNC session.
 *
 * The port object is only listened to and closed. This session has no
 * method that writes bytes, and it does not send a TNC command.
 */
export function createAprsReceiveSession(now: () => string = () => new Date().toISOString()): AprsReceiveSession {
  const lines: AprsLineBuffer = createAprsLineBuffer();
  const folded: AprsFoldState = createAprsFoldState();
  let port: AprsBytePort | undefined;
  let path: string | undefined;
  let error: string | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();

  function publish(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  const onData = (chunk: Uint8Array): void => {
    const current = generation;

    for (const line of consumeAprsBytes(lines, chunk)) {
      if (current !== generation) {
        return;
      }

      const packet: AprsDecodedPacket = line.truncated
        ? {
            kind: 'unparsed',
            path: [],
            raw: line.text,
            unsupportedReason: 'Line exceeded 4096 bytes without a newline',
          }
        : decodeAprsMonitorLine(line.text);

      foldAprsLine(folded, line.text, packet, now());
    }

    if (current === generation) {
      publish();
    }
  };

  const onError = (cause: Error): void => {
    if (!port) {
      return;
    }

    error = cause.message || 'Serial port disconnected';
    void disconnect();
  };

  function snapshot(): AprsSessionSnapshot {
    return {
      connected: port?.isOpen === true,
      path,
      error,
      stations: folded.stations.map((station) => ({ ...station })),
      log: folded.log.map((entry) => ({ ...entry })),
    };
  }

  async function closePort(): Promise<void> {
    const current = port;
    port = undefined;
    path = undefined;
    takeAprsPartial(lines);

    if (!current) {
      return;
    }

    current.off('data', onData as (payload: Uint8Array | Error) => void);
    current.off('error', onError as (payload: Uint8Array | Error) => void);

    try {
      await current.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not close the COM port';
    }
  }

  async function connect(nextPath: string, openPort: () => Promise<AprsBytePort>): Promise<void> {
    generation += 1;
    const token = generation;
    await closePort();

    if (token !== generation) {
      publish();
      return;
    }

    error = undefined;
    let opened: AprsBytePort;

    try {
      opened = await openPort();
    } catch (cause) {
      if (token !== generation) {
        return;
      }

      error = cause instanceof Error ? cause.message : 'Could not open the COM port';
      path = undefined;
      publish();
      return;
    }

    if (token !== generation) {
      await opened.close();
      publish();
      return;
    }

    port = opened;
    path = nextPath;
    opened.on('data', onData);
    opened.on('error', onError);
    publish();
  }

  function receiveText(text: string): void {
    const bytes = new Uint8Array(text.length);

    for (let index = 0; index < text.length; index += 1) {
      bytes[index] = text.charCodeAt(index) & 0xff;
    }

    onData(bytes);
  }

  function unavailable(message: string): void {
    if (port?.isOpen) {
      return;
    }

    error = message;
    publish();
  }

  async function disconnect(): Promise<void> {
    generation += 1;
    await closePort();
    publish();
  }

  function clear(): void {
    folded.stations = [];
    folded.log = [];
    publish();
  }

  return {
    snapshot,
    connect,
    unavailable,
    receiveText,
    disconnect,
    clear,
    subscribe(listener) {
      listeners.add(listener);
    },
    unsubscribe(listener) {
      listeners.delete(listener);
    },
  };
}

/** APRS port holds keyed by radio card, replaced as a group so CAT holds stay. */
export function nextAprsPortHolds(current: Readonly<Record<string, string>>, cardId: string, path: string | undefined): Record<string, string> {
  const next = { ...current };

  if (path === undefined) {
    delete next[cardId];
  } else {
    next[cardId] = path;
  }

  return next;
}
