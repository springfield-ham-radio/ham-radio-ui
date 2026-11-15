import { describe, expect, it } from 'vitest';
import {
  applyRadioTransferProgress,
  beginRadioTransfer,
  cancelRadioTransfer,
  inFlightTransferPorts,
  openRadioTransferProgress,
  presentRadioTransfer,
  removeRadioTransfer,
  transferCanceledForPort,
  type RadioTransferMap,
} from '../../app/utils/radio-transfer-progress.ts';

describe('per-radio transfer progress', () => {
  it('runs two ports at once and keeps their progress apart', () => {
    let transfers: RadioTransferMap = {};
    const first = beginRadioTransfer(transfers, { cardId: 'handheld', port: '/dev/ttyUSB0', now: 1_000 });
    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    transfers = openRadioTransferProgress(first.transfers, {
      cardId: 'handheld',
      port: '/dev/ttyUSB0',
      kind: 'import',
      now: 1_000,
    });

    const second = beginRadioTransfer(transfers, { cardId: 'mobile', port: '/dev/ttyUSB1', now: 1_500 });
    expect(second.ok).toBe(true);

    if (!second.ok) {
      return;
    }

    transfers = openRadioTransferProgress(second.transfers, {
      cardId: 'mobile',
      port: '/dev/ttyUSB1',
      kind: 'write',
      now: 1_500,
    });
    transfers = applyRadioTransferProgress(transfers, 'handheld', '/dev/ttyUSB0', 0.25);
    transfers = applyRadioTransferProgress(transfers, 'mobile', '/dev/ttyUSB1', 0.8);
    transfers = applyRadioTransferProgress(transfers, 'handheld', '/dev/ttyUSB1', 0.99);

    expect(transfers.handheld).toMatchObject({
      port: '/dev/ttyUSB0',
      kind: 'import',
      progress: 0.25,
      inFlight: true,
      open: true,
    });
    expect(transfers.mobile).toMatchObject({
      port: '/dev/ttyUSB1',
      kind: 'write',
      progress: 0.8,
      inFlight: true,
      open: true,
    });
    expect(inFlightTransferPorts(transfers)).toEqual(['/dev/ttyUSB0', '/dev/ttyUSB1']);
  });

  it('refuses a second operation on the same port and the same card', () => {
    let transfers: RadioTransferMap = {};
    const started = beginRadioTransfer(transfers, { cardId: 'handheld', port: '/dev/cu.usbserial-A' });

    if (!started.ok) {
      throw new Error('expected the first claim to succeed');
    }

    transfers = started.transfers;

    const samePort = beginRadioTransfer(transfers, { cardId: 'mobile', port: 'cu.usbserial-A' });
    const sameCard = beginRadioTransfer(transfers, { cardId: 'handheld', port: '/dev/ttyUSB9' });

    expect(samePort).toMatchObject({ ok: false, reason: 'port', blockingCardId: 'handheld' });
    expect(sameCard).toMatchObject({ ok: false, reason: 'card', blockingCardId: 'handheld' });
    expect(transfers.mobile).toBeUndefined();
  });

  it('canceling one radio does not cancel the other', () => {
    let transfers: RadioTransferMap = {};
    const first = beginRadioTransfer(transfers, { cardId: 'handheld', port: '/dev/ttyUSB0' });
    if (!first.ok) {
      throw new Error('expected the first claim to succeed');
    }

    transfers = openRadioTransferProgress(first.transfers, {
      cardId: 'handheld',
      port: '/dev/ttyUSB0',
      kind: 'import',
    });
    const second = beginRadioTransfer(transfers, { cardId: 'mobile', port: '/dev/ttyUSB1' });
    if (!second.ok) {
      throw new Error('expected the second claim to succeed');
    }

    transfers = openRadioTransferProgress(second.transfers, {
      cardId: 'mobile',
      port: '/dev/ttyUSB1',
      kind: 'write',
    });
    transfers = cancelRadioTransfer(transfers, 'handheld');

    expect(transfers.handheld).toMatchObject({ canceled: true, open: false, inFlight: true });
    expect(transfers.mobile).toMatchObject({ canceled: false, open: true, inFlight: true });
    expect(transferCanceledForPort(transfers, '/dev/ttyUSB0')).toBe(true);
    expect(transferCanceledForPort(transfers, 'ttyUSB1')).toBe(false);
  });

  it('keeps an in-progress record after the card leaves the screen', () => {
    const transfers = presentRadioTransfer({}, {
      cardId: 'handheld',
      port: '/dev/ttyUSB0',
      kind: 'import',
      progress: 0.64,
      startedAt: 500,
      error: null,
      inFlight: true,
    });

    const remembered = { ...transfers };
    expect(removeRadioTransfer(remembered, 'mobile')).toBe(remembered);
    expect(remembered.handheld).toMatchObject({ progress: 0.64, open: true, inFlight: true });
  });
});
