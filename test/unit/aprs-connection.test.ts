import { describe, expect, it } from 'vitest';
import { aprsConnectAction, aprsConnectionView, aprsDisconnectAction } from '~/utils/aprs-connection';

describe('APRS COM connection', () => {
  it('opens the passive monitor without a host or KISS action', () => {
    expect(aprsConnectAction({ mode: 'passive', passiveOpen: false, hostOpen: false })).toEqual({ kind: 'open-passive' });
    expect(aprsConnectionView({
      mode: 'passive',
      passiveOpen: true,
      hostOpen: false,
      passiveConnecting: false,
      hostConnecting: false,
      kissConfirmed: false,
    })).toMatchObject({ badge: 'Connected', open: 'passive', kiss: 'hidden' });
  });

  it('opens the host session without entering KISS', () => {
    expect(aprsConnectAction({ mode: 'host', passiveOpen: false, hostOpen: false })).toEqual({ kind: 'open-host' });
    const view = aprsConnectionView({
      mode: 'host',
      passiveOpen: false,
      hostOpen: true,
      passiveConnecting: false,
      hostConnecting: false,
      kissConfirmed: false,
    });
    expect(view.badge).toBe('Connected');
    expect(view.kiss).toBe('unconfirmed');
    expect(view.detail).toContain('KISS unconfirmed');
    expect(view.detail).not.toContain('Listening');
  });

  it('keeps KISS confirmation separate from the port badge', () => {
    const view = aprsConnectionView({
      mode: 'host',
      passiveOpen: false,
      hostOpen: true,
      passiveConnecting: false,
      hostConnecting: false,
      kissConfirmed: true,
    });
    expect(view.badge).toBe('Connected');
    expect(view.kiss).toBe('confirmed');
    expect(view.detail).toContain('AX.25 UI seen');
  });

  it('blocks a second open so another tab cannot race the port', () => {
    expect(aprsConnectAction({ mode: 'passive', passiveOpen: false, hostOpen: true }).kind).toBe('blocked');
    expect(aprsConnectAction({ mode: 'host', passiveOpen: true, hostOpen: false }).kind).toBe('blocked');
    expect(aprsConnectAction({ mode: 'host', passiveOpen: true, hostOpen: true }).kind).toBe('blocked');
  });

  it('disconnects the session that is actually open', () => {
    expect(aprsDisconnectAction({ passiveOpen: true, hostOpen: false })).toEqual({ kind: 'close-passive' });
    expect(aprsDisconnectAction({ passiveOpen: false, hostOpen: true })).toEqual({ kind: 'close-host' });
    expect(aprsDisconnectAction({ passiveOpen: true, hostOpen: true })).toEqual({ kind: 'close-both' });
    expect(aprsDisconnectAction({ passiveOpen: false, hostOpen: false }).kind).toBe('blocked');
  });

  it('has no action that writes a command, beacon, or message', () => {
    const kinds = [
      aprsConnectAction({ mode: 'passive', passiveOpen: false, hostOpen: false }).kind,
      aprsConnectAction({ mode: 'host', passiveOpen: false, hostOpen: false }).kind,
      aprsDisconnectAction({ passiveOpen: true, hostOpen: true }).kind,
    ];
    expect(kinds).toEqual(['open-passive', 'open-host', 'close-both']);
  });

  it('names the closed port without a second status', () => {
    const passive = aprsConnectionView({
      mode: 'passive',
      passiveOpen: false,
      hostOpen: false,
      passiveConnecting: false,
      hostConnecting: false,
      kissConfirmed: false,
    });
    const host = aprsConnectionView({
      mode: 'host',
      passiveOpen: false,
      hostOpen: false,
      passiveConnecting: false,
      hostConnecting: false,
      kissConfirmed: false,
    });
    expect(passive.badge).toBe('Disconnected');
    expect(host.badge).toBe('Disconnected');
    expect(passive.detail).toContain('not the CAT connection');
    expect(host.detail).toContain('Enter host KISS is a separate step');
  });
});
