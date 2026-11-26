import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalAx25Call, encodeAx25Ui } from '~/utils/aprs-ax25';
import { encodeKissData } from '~/utils/aprs-kiss';
import { createAprsHostSession, type AprsHostBytePort } from '~/utils/aprs-host-session';
import { d710AprsHostLink } from '~/utils/aprs-d710-host';
import { encodeAx25Frame } from '~/utils/packet-ax25';
import {
  clearPacketMonitor,
  createPacketMonitor,
  filterPacketRows,
  formatPacketCopy,
  formatPacketTime,
  packetFixturePayloads,
  pausePacketMonitor,
  pushPacketMonitor,
} from '~/utils/packet-monitor';
import { packetLinkBlockReason } from '~/utils/packet-port';
import {
  isPacketRadioIdentityMigrationDone,
  markPacketRadioIdentityMigrationDone,
  migratePacketRadioIdentity,
  PACKET_RADIO_IDENTITY_MIGRATED_KEY,
  normalizePacketSettings,
  packetMyCall,
  packetSettingsForCard,
  readPacketSettings,
  PACKET_DEFAULT_SETTINGS,
  PACKET_SETTINGS_KEY,
} from '~/utils/packet-settings';
import {
  packetCallStationTooltip,
  packetCallTransmitNote,
  packetLinePayload,
  packetLinkBadgeLabel,
  packetScrollText,
  packetTerminalView,
} from '~/utils/packet-terminal';
import type { SavedRadio } from '~/utils/saved-radios';

function fakePort(): { port: AprsHostBytePort; writes: Uint8Array[]; push: (chunk: Uint8Array) => void } {
  const writes: Uint8Array[] = [];
  let onData: ((chunk: Uint8Array) => void) | undefined;
  const port: AprsHostBytePort = {
    isOpen: true,
    on(event, handler) {
      if (event === 'data') {
        onData = handler as (chunk: Uint8Array) => void;
      }
    },
    off() {
      onData = undefined;
    },
    close() {
      port.isOpen = false;
    },
    write(bytes) {
      writes.push(bytes);
    },
  };

  return {
    port,
    writes,
    push(chunk) {
      onData?.(chunk);
    },
  };
}

describe('Packet monitor and terminal', () => {
  it('lists I, S, and U frames and filters, pauses, clears, and copies them', () => {
    let monitor = createPacketMonitor();
    const at = Date.parse('2026-11-11T18:00:00Z');

    for (const payload of packetFixturePayloads()) {
      monitor = pushPacketMonitor(monitor, payload, at);
    }

    expect(monitor.rows.map((row) => row.control)).toEqual(['I', 'RR', 'SABM']);
    expect(monitor.rows[0]?.path).toBe('WIDE1-1*');
    expect(monitor.rows[0]?.ns).toBe('1');
    expect(monitor.rows[0]?.pf).toBe('P');
    expect(monitor.rows[0]?.pid).toBe('f0');
    expect(monitor.rows[0]?.text).toContain('Hello');
    expect(monitor.rows[0]?.hex).toContain('0d');
    expect(monitor.rows[1]?.cr).toBe('rsp');
    expect(monitor.rows[1]?.pf).toBe('F');

    expect(filterPacketRows(monitor.rows, 'w1aw', 'all').map((row) => row.control)).toEqual(['I', 'RR', 'SABM']);
    expect(filterPacketRows(monitor.rows, 'wide1', 'all').map((row) => row.control)).toEqual(['I']);
    expect(filterPacketRows(monitor.rows, '', 'U').map((row) => row.control)).toEqual(['SABM']);
    expect(filterPacketRows(monitor.rows, 'KF5UFJ', 'RR')).toHaveLength(1);

    const paused = pausePacketMonitor(monitor);
    const during = pushPacketMonitor(paused, packetFixturePayloads()[0] ?? new Uint8Array(), at + 1000);
    expect(during.rows).toHaveLength(3);
    expect(during.held).toHaveLength(1);
    const resumed = pausePacketMonitor(during);
    expect(resumed.paused).toBe(false);
    expect(resumed.rows).toHaveLength(4);

    const copy = formatPacketCopy(filterPacketRows(monitor.rows, '', 'I'), 'America/Chicago');
    expect(copy.startsWith('12:00:00 ')).toBe(true);
    expect(copy).not.toContain('18:00:00');
    expect(formatPacketTime(at, 'America/Chicago')).toBe('12:00:00');
    expect(formatPacketTime(Date.UTC(2026, 10, 11, 23, 42, 58), 'America/Chicago')).toBe('17:42:58');
    expect(copy).toContain('W1AW-1>KF5UFJ,WIDE1-1*');
    expect(copy).toContain('N(S)=1');
    expect(copy).toContain('N(R)=0');
    expect(copy).toContain('PID f0');
    expect(copy).toContain('Hello\\r');
    expect(clearPacketMonitor(monitor).rows).toEqual([]);
  });

  it('sends a terminal line with CR and keeps connect disabled until KISS is ready', () => {
    expect(packetLinePayload('Hello')).toEqual(Uint8Array.from([...'Hello\r'].map((character) => character.charCodeAt(0))));
    expect(packetLinePayload('Hello\n')?.[5]).toBe(0x0d);
    expect(packetLinePayload('bad\u0001')).toBeUndefined();
    const at = Date.UTC(2026, 10, 11, 23, 42, 58);
    const clock = { at, timeZone: 'America/Chicago' };
    expect(packetScrollText('', [{ kind: 'rx', text: 'Hi\r' }, { kind: 'status', text: 'Connected to W1AW.' }], 'Bye', clock)).toBe('17:42:58 Bye\n17:42:58 Hi\n17:42:58 [Connected to W1AW.]\n');

    expect(PACKET_DEFAULT_SETTINGS.acceptIncoming).toBe(false);
    expect(readPacketSettings({ getItem: () => null }).acceptIncoming).toBe(false);
    expect(normalizePacketSettings({ acceptIncoming: true, modulo: 128, paclen: 1, n2: 99 }).paclen).toBe(32);
    expect(packetMyCall('KF5UFJ', 7)).toEqual({ call: 'KF5UFJ', ssid: 7 });
    expect(packetMyCall('KF5UFJ-1', 7)?.ssid).toBe(1);

    const closed = packetTerminalView({
      portOpen: false,
      detectPhase: 'idle',
      kissConfirmed: false,
      hardwareTransmit: true,
      phase: 'none',
      myCall: 'KF5UFJ',
    });
    expect(closed.canConnect).toBe(false);
    expect(closed.canSend).toBe(false);
    expect(closed.connectBlocked).toMatch(/KISS port is closed/);

    const detecting = packetTerminalView({
      portOpen: true,
      detectPhase: 'listening',
      kissConfirmed: false,
      hardwareTransmit: true,
      phase: 'disconnected',
      myCall: 'KF5UFJ',
    });
    expect(detecting.canConnect).toBe(false);
    expect(packetLinkBlockReason({
      connected: true,
      detectPhase: 'listening',
      kissConfirmed: false,
      hardwareTransmit: true,
    })).toMatch(/detection/);

    const ready = packetTerminalView({
      portOpen: true,
      detectPhase: 'waiting-traffic',
      kissConfirmed: false,
      hardwareTransmit: true,
      phase: 'disconnected',
      myCall: 'KF5UFJ',
    });
    expect(ready.canConnect).toBe(true);
    expect(ready.canSend).toBe(false);

    const up = packetTerminalView({
      portOpen: true,
      detectPhase: 'waiting-traffic',
      kissConfirmed: true,
      hardwareTransmit: true,
      phase: 'connected',
      myCall: 'KF5UFJ',
      peer: 'W1AW',
    });
    expect(up.canSend).toBe(true);
    expect(up.canDisconnect).toBe(true);
    expect(up.linkLabel).toBe('Connected to W1AW');
    expect(packetTerminalView({ ...up, myCall: undefined, phase: 'none' }).connectBlocked).toMatch(/Preferences/);
  });

  it('names the station button Call station and uses link tabs', () => {
    const source = readFileSync(new URL('../../app/components/RadioPacket.vue', import.meta.url), 'utf8');
    expect(source).toContain('label="Call station"');
    expect(source).toContain(':text="callStationTooltip ?? \'\'"');
    expect(source).toContain(':disabled="!callStationTooltip"');
    expect(source).toContain(':disabled="!portOpen || !terminal.canConnect || !peerReady"');
    expect(source).toContain(":variant=\"portOpen && terminal.canConnect ? 'solid' : 'outline'\"");
    expect(source).toContain('label="Disconnect"');
    expect(source).not.toContain('Hang up');
    expect(source).toContain('variant="link"');
    expect(source).not.toContain("pane === 'monitor'");
  });

  it('explains every disabled Call station state and stays quiet when enabled', () => {
    const ready = {
      portOpen: true,
      phase: 'disconnected' as const,
      detectPhase: 'waiting-traffic' as const,
      kissConfirmed: false,
      hardwareTransmit: true,
      myCall: 'KF5UFJ',
      station: 'W1AW-1',
    };

    expect(packetCallStationTooltip({ ...ready, portOpen: false, station: '' })).toBe('Connect (Host) first');
    expect(packetCallStationTooltip({ ...ready, station: '' })).toBe('Enter a station callsign');
    expect(packetCallStationTooltip({ ...ready, station: '   ' })).toBe('Enter a station callsign');
    expect(packetCallStationTooltip({ ...ready, station: 'NO' })).toBe('Use a callsign of 3 to 6 characters');
    expect(packetCallStationTooltip({ ...ready, phase: 'connecting' })).toBe('A call is already in progress');
    expect(packetCallStationTooltip({ ...ready, phase: 'connected', station: '' })).toBe('Already linked to a station');
    expect(packetCallStationTooltip({ ...ready, phase: 'timer-recovery' })).toBe('Already linked to a station');
    expect(packetCallStationTooltip({ ...ready, phase: 'disconnecting' })).toBe('The link is closing');
    expect(packetCallStationTooltip({ ...ready, detectPhase: 'listening' })).toBe('Wait until KISS detection finishes');
    expect(packetCallStationTooltip({ ...ready, detectPhase: 'failed' })).toBe('KISS detection did not finish');
    expect(packetCallStationTooltip({
      ...ready,
      detectPhase: 'failed',
      detectDetail: 'TNC rejected KISS ON.',
    })).toBe('TNC rejected KISS ON');
    expect(packetCallStationTooltip({
      ...ready,
      detectPhase: 'failed',
      detectDetail: 'TNC is in command mode (echoing).',
    })).toBe('TNC is in command mode (echoing)');
    expect(packetCallStationTooltip({
      ...ready,
      detectPhase: 'waiting-traffic',
      detectDetail: 'KISS on, waiting for traffic.',
    })).toBeUndefined();
    expect(packetCallStationTooltip({ ...ready, hardwareTransmit: false })).toBe('Transmit is off for this session');
    expect(packetCallStationTooltip({ ...ready, myCall: undefined })).toBe('Set a callsign in Preferences');
    expect(packetCallStationTooltip(ready)).toBeUndefined();
  });

  it('shows calling progress, no-answer, and the transmit note', () => {
    expect(packetLinkBadgeLabel({
      phase: 'connecting',
      peer: 'KF5UFJ-8',
      connectAttempt: 2,
      n2: 10,
    })).toBe('Calling KF5UFJ-8, attempt 2 of 10');

    expect(packetLinkBadgeLabel({
      phase: 'disconnected',
      noAnswer: 'No answer from KF5UFJ-8.',
    })).toBe('No answer from KF5UFJ-8.');

    expect(packetCallTransmitNote(3000, 10)).toMatch(/every 3 s.*10 times/u);
  });

  it('migrates per-radio SSID once from global settings', () => {
    const storage = {
      values: new Map<string, string>(),
      getItem(key: string) {
        return this.values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.values.set(key, value);
      },
    };
    storage.setItem(PACKET_SETTINGS_KEY, JSON.stringify({ ssid: 7, acceptIncoming: true, modulo: 8, n2: 10 }));
    const radio: SavedRadio = {
      id: 'r1',
      name: 'Mobile',
      manufacturer: 'Kenwood',
      model: 'TM-D710A',
      serialPort: '/dev/cu.test',
      createdAt: 1,
      updatedAt: 1,
    };
    const migrated = migratePacketRadioIdentity(radio, storage);
    expect(migrated.packetSsid).toBe(7);
    expect(migrated.packetAcceptIncoming).toBe(true);
    expect(packetSettingsForCard(migrated, storage).ssid).toBe(7);
    expect(migratePacketRadioIdentity({ ...migrated, packetSsid: 3 }, storage).packetSsid).toBe(3);
    expect(packetSettingsForCard({ id: 'r2', name: 'Base', manufacturer: 'K', model: 'M', serialPort: '/dev/x', createdAt: 1, updatedAt: 1, packetSsid: 1 }, storage).ssid).toBe(1);
  });

  it('does not copy global SSID onto new radios after migration is marked done', () => {
    const storage = {
      values: new Map<string, string>(),
      getItem(key: string) {
        return this.values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.values.set(key, value);
      },
    };
    storage.setItem(PACKET_SETTINGS_KEY, JSON.stringify({ ssid: 7, acceptIncoming: true, modulo: 8, n2: 10 }));
    markPacketRadioIdentityMigrationDone(storage);
    const legacy: SavedRadio = {
      id: 'r-old',
      name: 'Legacy',
      manufacturer: 'Kenwood',
      model: 'M',
      serialPort: '/dev/cu',
      createdAt: 1,
      updatedAt: 1,
    };
    const migrated = migratePacketRadioIdentity(legacy, storage);
    expect(migrated.packetSsid).toBe(0);
    expect(migrated.packetAcceptIncoming).toBe(false);
    expect(isPacketRadioIdentityMigrationDone(storage)).toBe(true);
    expect(storage.getItem(PACKET_RADIO_IDENTITY_MIGRATED_KEY)).toBe('1');
  });
});

describe('Packet writes on the shared KISS session', () => {
  it('does not transmit on connect, and an I frame does not confirm APRS', async () => {
    const seen: Uint8Array[] = [];
    const session = createAprsHostSession({ host: d710AprsHostLink(), onAx25Ui: () => undefined });
    const fake = fakePort();
    session.addKissDataListener((payload) => {
      seen.push(payload);
    });
    await session.connect('/dev/cu.pg5g', async () => fake.port);

    expect(fake.writes).toEqual([]);
    expect(session.packetSendBlock()).toMatch(/detection/);
    expect(await session.writeKissData(Uint8Array.of(0x00))).toMatch(/detection/);

    const info = encodeAx25Frame({
      destination: canonicalAx25Call('KF5UFJ') ?? { call: 'KF5UFJ', ssid: 0 },
      source: canonicalAx25Call('W1AW') ?? { call: 'W1AW', ssid: 0 },
      cr: 'command',
      kind: 'I',
      ns: 0,
      nr: 0,
      info: Uint8Array.from([0x41]),
    });
    fake.push(encodeKissData(info ?? new Uint8Array()));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(seen).toHaveLength(1);
    expect(session.snapshot().kissConfirmed).toBe(false);
    expect(session.snapshot().detectPhase).toBe('waiting-traffic');
    const blocked = await session.send({ mine: 'KF5UFJ', to: 'W1AW', text: 'Hi' });
    expect(blocked.status).toBe('blocked');
    expect(await session.writeKissData(info ?? new Uint8Array())).toBeUndefined();
    expect(fake.writes).toHaveLength(1);
    expect(session.snapshot().trace.some((line) => line.note.includes('Packet link frame'))).toBe(true);

    let hooked = false;
    session.addDisconnectHook(async () => {
      hooked = true;
      await session.writeKissData(info ?? new Uint8Array());
    });
    await session.disconnect();
    expect(hooked).toBe(true);
    expect(fake.writes).toHaveLength(2);
    expect(fake.port.isOpen).toBe(false);
  });

  it('still confirms KISS only from a UI frame', async () => {
    const session = createAprsHostSession({ host: d710AprsHostLink() });
    const fake = fakePort();
    await session.connect('/dev/cu.pg5g', async () => fake.port);
    const heard = canonicalAx25Call('N0HRD');
    const ui = heard ? encodeAx25Ui(heard, '>Heard') : undefined;
    fake.push(encodeKissData(ui ?? new Uint8Array()));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(session.snapshot().kissConfirmed).toBe(true);
    await session.disconnect();
  });
});
