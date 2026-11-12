import { describe, expect, it } from 'vitest';
import {
  aprsConnectAction,
  aprsConnectDisabledReason,
  aprsConnectLabel,
  aprsConnectionView,
  aprsDisconnectAction,
  aprsTncModeBadge,
  packetNeedsHostNotice,
  type AprsTncModeInput,
} from '~/utils/aprs-connection';

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
    expect(host.detail).toContain('listens');
    expect(host.detail).toContain('kissExit');
    expect(host.detail).toContain('does not transmit on the air');
    expect(host.detail).not.toContain('Enter host KISS');
  });
});

describe('shared TNC connection bar', () => {
  it('names the connect face for the selected mode and does not connect from the caret', () => {
    expect(aprsConnectLabel('host')).toBe('Connect (Host)');
    expect(aprsConnectLabel('passive')).toBe('Connect (Monitor only)');
    expect(aprsConnectAction({ mode: 'host', passiveOpen: false, hostOpen: false })).toEqual({ kind: 'open-host' });
    expect(aprsConnectAction({ mode: 'passive', passiveOpen: false, hostOpen: false })).toEqual({ kind: 'open-passive' });
  });

  it('explains a disabled connect face and stays quiet when the port can open', () => {
    expect(aprsConnectDisabledReason({
      hasRadio: false,
      hasPort: false,
      portBusy: false,
      hostAvailable: true,
      mode: 'host',
    })).toMatch(/Preferences/);
    expect(aprsConnectDisabledReason({
      hasRadio: true,
      hasPort: false,
      portBusy: false,
      hostAvailable: true,
      mode: 'host',
    })).toBe('Choose an APRS serial port in Preferences.');
    expect(aprsConnectDisabledReason({
      hasRadio: true,
      hasPort: true,
      portBusy: true,
      hostAvailable: true,
      mode: 'passive',
    })).toMatch(/already open/);
    expect(aprsConnectDisabledReason({
      hasRadio: true,
      hasPort: true,
      portBusy: false,
      hostAvailable: false,
      mode: 'host',
    })).toMatch(/no host session/);
    expect(aprsConnectDisabledReason({
      hasRadio: true,
      hasPort: true,
      portBusy: false,
      hostAvailable: true,
      mode: 'host',
    })).toBeUndefined();
  });

  it('tells the Packet tab that Monitor only does not open KISS', () => {
    expect(packetNeedsHostNotice({ hostOpen: false, passiveOpen: false, selected: 'host' })).toBeUndefined();
    expect(packetNeedsHostNotice({ hostOpen: true, passiveOpen: false, selected: 'passive' })).toBeUndefined();
    expect(packetNeedsHostNotice({ hostOpen: false, passiveOpen: true, selected: 'host' })).toMatch(/Packet needs Host mode/);
    expect(packetNeedsHostNotice({ hostOpen: false, passiveOpen: false, selected: 'passive' })).toMatch(/does not open a KISS session/);
  });
});

describe('APRS TNC mode badge', () => {
  const host = (patch: Partial<AprsTncModeInput>): AprsTncModeInput => ({
    open: 'host',
    kissConfirmed: false,
    detectPhase: 'listening',
    commandPhase: 'idle',
    ...patch,
  });

  it('hides the mode when the port is closed', () => {
    expect(aprsTncModeBadge({ open: undefined, kissConfirmed: false, detectPhase: 'idle', commandPhase: 'idle' }).visible).toBe(false);
    expect(aprsTncModeBadge({ open: undefined, kissConfirmed: true, detectPhase: 'waiting-traffic', commandPhase: 'restart-sent' }).visible).toBe(false);
  });

  it('names the passive monitor instead of a TNC mode', () => {
    const badge = aprsTncModeBadge({ open: 'passive', kissConfirmed: false, detectPhase: 'idle', commandPhase: 'idle' });
    expect(badge).toMatchObject({ visible: true, label: 'Monitor', color: 'neutral' });
    expect(badge.tooltip).toContain('Nothing is written');
  });

  it('shows Detecting while the host session is still listening', () => {
    expect(aprsTncModeBadge(host({ detectPhase: 'listening' }))).toMatchObject({ label: 'Detecting…', color: 'info' });
    expect(aprsTncModeBadge(host({ detectPhase: 'awaiting-prompt', commandPhase: 'waiting-prompt' })).label).toBe('Detecting…');
    expect(aprsTncModeBadge(host({ detectPhase: 'idle', commandPhase: 'idle' })).label).toBe('Detecting…');
  });

  it('shows Command once a prompt is seen and before KISS is entered', () => {
    expect(aprsTncModeBadge(host({ detectPhase: 'awaiting-prompt', commandPhase: 'prompt' }))).toMatchObject({
      label: 'Command',
      color: 'secondary',
    });
    expect(aprsTncModeBadge(host({ detectPhase: 'entering', commandPhase: 'waiting-accept' })).label).toBe('Command');
    expect(aprsTncModeBadge(host({ detectPhase: 'entering', commandPhase: 'prompt' })).label).toBe('Command');
  });

  it('shows KISS waiting after the enter steps and before an AX.25 UI frame', () => {
    const badge = aprsTncModeBadge(host({ detectPhase: 'waiting-traffic', commandPhase: 'restart-sent' }));
    expect(badge).toMatchObject({ label: 'KISS · waiting', color: 'warning' });
    expect(badge.tooltip).toContain('No AX.25 UI');
    expect(aprsTncModeBadge(host({ detectPhase: 'listening', commandPhase: 'kiss-framed' })).label).toBe('KISS · waiting');
  });

  it('shows KISS confirmed only after an AX.25 UI frame', () => {
    const badge = aprsTncModeBadge(host({ kissConfirmed: true, detectPhase: 'waiting-traffic', commandPhase: 'restart-sent' }));
    expect(badge).toMatchObject({ label: 'KISS confirmed', color: 'primary' });
    expect(badge.tooltip).toContain('AX.25 UI');
  });

  it('shows No reply when detection has stopped', () => {
    expect(aprsTncModeBadge(host({ detectPhase: 'failed', commandPhase: 'timed-out' }))).toMatchObject({
      label: 'No reply',
      color: 'error',
    });
    expect(aprsTncModeBadge(host({ detectPhase: 'failed', commandPhase: 'cancelled' })).label).toBe('No reply');
  });

  it('uses a different color for each visible mode', () => {
    const colors = [
      aprsTncModeBadge({ open: 'passive', kissConfirmed: false, detectPhase: 'idle', commandPhase: 'idle' }).color,
      aprsTncModeBadge(host({ detectPhase: 'listening' })).color,
      aprsTncModeBadge(host({ detectPhase: 'entering', commandPhase: 'prompt' })).color,
      aprsTncModeBadge(host({ detectPhase: 'waiting-traffic' })).color,
      aprsTncModeBadge(host({ kissConfirmed: true, detectPhase: 'waiting-traffic' })).color,
      aprsTncModeBadge(host({ detectPhase: 'failed' })).color,
    ];
    expect(new Set(colors).size).toBe(colors.length);
  });
});
