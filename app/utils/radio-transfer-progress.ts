import type { RadioErrorReport } from '~/utils/radio-error-report';
import { serialPortMatchKey } from '~/utils/serial-port-list';

/** Shared with `useRadio` and the serial reconnect plugin. */
export const RADIO_CARD_TRANSFERS_KEY = 'radio-card-transfers';

export type RadioTransferKind = 'import' | 'write' | 'backup';

/**
 * One radio card's read, write, or pre-write backup.
 * Keyed by card id so a second port can run at the same time.
 */
export interface RadioTransferProgress {
  cardId: string;
  /** Serial path this operation opened. Progress for another path is ignored. */
  port: string;
  kind: RadioTransferKind;
  /** Driver fraction from 0 to 1. */
  progress: number;
  error: RadioErrorReport | null;
  startedAt: number;
  canceled: boolean;
  /** Card overlay is visible. Stays up after a failure until the operator closes it. */
  open: boolean;
  /** Driver call has not returned. Holds the port against a second operation. */
  inFlight: boolean;
}

export type RadioTransferMap = Record<string, RadioTransferProgress>;

export type BeginRadioTransferResult =
  | { ok: true; transfers: RadioTransferMap }
  | { ok: false; reason: 'card' | 'port'; blockingCardId: string };

export function transferBlockedMessage(reason: 'card' | 'port'): { title: string; description: string } {
  if (reason === 'port') {
    return {
      title: 'Serial port in use',
      description: 'Another radio is already using this port. Wait for that read or write to finish.',
    };
  }

  return {
    title: 'Transfer already in progress',
    description: "Wait for this radio's read or write to finish before starting another.",
  };
}

export function radioTransferForCard(
  transfers: RadioTransferMap,
  cardId: string | undefined,
): RadioTransferProgress | undefined {
  if (!cardId) {
    return undefined;
  }

  return transfers[cardId];
}

/** Ports whose driver call is still running. */
export function inFlightTransferPorts(transfers: RadioTransferMap): string[] {
  return Object.values(transfers)
    .filter((transfer) => transfer.inFlight)
    .map((transfer) => transfer.port);
}

/**
 * True when this path's in-flight transfer was canceled.
 * A cancel on another port does not abort this wait.
 */
export function transferCanceledForPort(transfers: RadioTransferMap, path: string): boolean {
  const key = serialPortMatchKey(path);

  return Object.values(transfers).some(
    (transfer) =>
      transfer.inFlight && transfer.canceled && serialPortMatchKey(transfer.port) === key,
  );
}

/**
 * Claim `cardId` and `port` for a read or write.
 * The same card cannot start a second operation, and neither can another card on the same port.
 * A finished card (overlay still showing an error) can start again.
 */
export function beginRadioTransfer(
  transfers: RadioTransferMap,
  input: { cardId: string; port: string; now?: number },
): BeginRadioTransferResult {
  const current = transfers[input.cardId];

  if (current?.inFlight) {
    return { ok: false, reason: 'card', blockingCardId: input.cardId };
  }

  const portKey = serialPortMatchKey(input.port);
  const blocking = Object.values(transfers).find(
    (transfer) =>
      transfer.cardId !== input.cardId &&
      transfer.inFlight &&
      serialPortMatchKey(transfer.port) === portKey,
  );

  if (blocking) {
    return { ok: false, reason: 'port', blockingCardId: blocking.cardId };
  }

  const now = input.now ?? Date.now();

  return {
    ok: true,
    transfers: {
      ...transfers,
      [input.cardId]: {
        cardId: input.cardId,
        port: input.port,
        kind: 'import',
        progress: 0,
        error: null,
        startedAt: now,
        canceled: false,
        open: false,
        inFlight: true,
      },
    },
  };
}

/** Show the card overlay for this phase. Does not clear `inFlight` from the claim. */
export function openRadioTransferProgress(
  transfers: RadioTransferMap,
  input: { cardId: string; port: string; kind: RadioTransferKind; now?: number },
): RadioTransferMap {
  const current = transfers[input.cardId];

  return {
    ...transfers,
    [input.cardId]: {
      cardId: input.cardId,
      port: input.port,
      kind: input.kind,
      progress: 0,
      error: null,
      startedAt: input.now ?? Date.now(),
      canceled: false,
      open: true,
      inFlight: current?.inFlight ?? true,
    },
  };
}

/**
 * Apply a driver progress callback.
 * Ignored when it names a different port than the one this card is using.
 */
export function applyRadioTransferProgress(
  transfers: RadioTransferMap,
  cardId: string,
  port: string,
  progress: number,
): RadioTransferMap {
  const current = transfers[cardId];

  if (!current || serialPortMatchKey(current.port) !== serialPortMatchKey(port)) {
    return transfers;
  }

  if (current.progress === progress) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, progress },
  };
}

export function setRadioTransferKind(
  transfers: RadioTransferMap,
  cardId: string,
  kind: RadioTransferKind,
): RadioTransferMap {
  const current = transfers[cardId];

  if (!current || current.kind === kind) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, kind },
  };
}

export function setRadioTransferError(
  transfers: RadioTransferMap,
  cardId: string,
  error: RadioErrorReport | null,
): RadioTransferMap {
  const current = transfers[cardId];

  if (!current) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, error },
  };
}

export function setRadioTransferCanceled(
  transfers: RadioTransferMap,
  cardId: string,
  canceled: boolean,
): RadioTransferMap {
  const current = transfers[cardId];

  if (!current || current.canceled === canceled) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, canceled },
  };
}

export function setRadioTransferOpen(
  transfers: RadioTransferMap,
  cardId: string,
  open: boolean,
): RadioTransferMap {
  const current = transfers[cardId];

  if (!current || current.open === open) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, open },
  };
}

/** Operator canceled. The record stays until the driver call returns so the port stays busy. */
export function cancelRadioTransfer(transfers: RadioTransferMap, cardId: string): RadioTransferMap {
  const current = transfers[cardId];

  if (!current) {
    return transfers;
  }

  return {
    ...transfers,
    [cardId]: { ...current, canceled: true, open: false },
  };
}

export function removeRadioTransfer(transfers: RadioTransferMap, cardId: string): RadioTransferMap {
  if (!transfers[cardId]) {
    return transfers;
  }

  const next = { ...transfers };
  delete next[cardId];
  return next;
}

/** Dev fixture and restored overlay: the card shows this state whenever it is mounted. */
export function presentRadioTransfer(
  transfers: RadioTransferMap,
  input: {
    cardId: string;
    port: string;
    kind: RadioTransferKind;
    progress: number;
    startedAt: number;
    error: RadioErrorReport | null;
    inFlight?: boolean;
  },
): RadioTransferMap {
  return {
    ...transfers,
    [input.cardId]: {
      cardId: input.cardId,
      port: input.port,
      kind: input.kind,
      progress: input.progress,
      error: input.error,
      startedAt: input.startedAt,
      canceled: false,
      open: true,
      inFlight: input.inFlight ?? false,
    },
  };
}
