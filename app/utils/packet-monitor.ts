/**
 * All-traffic monitor rows. Pause freezes the visible list and keeps
 * capturing. Clear and copy do not write to the radio.
 */

import { formatAx25Call } from '~/utils/aprs-ax25';
import { formatTraceClock } from '~/utils/aprs-serial-trace';
import { encodeAx25Frame } from '~/utils/packet-ax25';
import {
  ax25ControlLabel,
  ax25InfoHex,
  ax25InfoText,
  formatAx25Path,
  parseAx25Frame,
  type Ax25Modulo,
} from '~/utils/packet-ax25';

export const PACKET_MONITOR_CAP = 500;

export type PacketTypeFilter =
  | 'all'
  | 'I'
  | 'S'
  | 'U'
  | 'RR'
  | 'RNR'
  | 'REJ'
  | 'SREJ'
  | 'SABM'
  | 'SABME'
  | 'UA'
  | 'DM'
  | 'DISC'
  | 'FRMR'
  | 'UI'
  | 'XID'
  | 'TEST';

export interface PacketMonitorRow {
  id: number;
  at: number;
  source: string;
  destination: string;
  path: string;
  control: string;
  ns: string;
  nr: string;
  pf: string;
  cr: string;
  pid: string;
  text: string;
  hex: string;
  group: 'I' | 'S' | 'U' | 'raw';
}

export interface PacketMonitor {
  rows: PacketMonitorRow[];
  paused: boolean;
  /** Rows captured while the visible list is frozen. */
  held: PacketMonitorRow[];
  nextId: number;
}

export function createPacketMonitor(): PacketMonitor {
  return { rows: [], paused: false, held: [], nextId: 1 };
}

/** Local `HH:MM:SS`, the same clock as the APRS raw log. Pass `timeZone` in tests. */
export function formatPacketTime(at: number, timeZone?: string): string {
  return formatTraceClock(at, timeZone);
}

export function packetRowFromKiss(payload: Uint8Array, at: number, id: number, modulo: Ax25Modulo): PacketMonitorRow {
  const frame = parseAx25Frame(payload, { modulo });

  if (!frame) {
    return {
      id,
      at,
      source: '—',
      destination: '—',
      path: '',
      control: 'KISS',
      ns: '',
      nr: '',
      pf: '',
      cr: '',
      pid: '',
      text: '',
      hex: ax25InfoHex(payload),
      group: 'raw',
    };
  }

  const control = ax25ControlLabel(frame);

  return {
    id,
    at,
    source: formatAx25Call(frame.source),
    destination: formatAx25Call(frame.destination),
    path: formatAx25Path(frame.path),
    control,
    ns: frame.ns === undefined ? '' : String(frame.ns),
    nr: frame.nr === undefined ? '' : String(frame.nr),
    pf: frame.pf ? (frame.cr === 'response' ? 'F' : 'P') : '',
    cr: frame.cr === 'command' ? 'cmd' : frame.cr === 'response' ? 'rsp' : 'v1',
    pid: frame.pid === undefined ? '' : frame.pid.toString(16).padStart(2, '0'),
    text: ax25InfoText(frame.info),
    hex: ax25InfoHex(frame.info),
    group: frame.kind,
  };
}

function remember(list: PacketMonitorRow[], row: PacketMonitorRow): PacketMonitorRow[] {
  const next = [...list, row];
  return next.length > PACKET_MONITOR_CAP ? next.slice(next.length - PACKET_MONITOR_CAP) : next;
}

export function pushPacketMonitor(monitor: PacketMonitor, payload: Uint8Array, at: number, modulo: Ax25Modulo = 8): PacketMonitor {
  const row = packetRowFromKiss(payload, at, monitor.nextId, modulo);
  const nextId = monitor.nextId + 1;

  if (monitor.paused) {
    return { ...monitor, nextId, held: remember(monitor.held, row) };
  }

  return { ...monitor, nextId, rows: remember(monitor.rows, row) };
}

export function pausePacketMonitor(monitor: PacketMonitor): PacketMonitor {
  if (monitor.paused) {
    const rows = [...monitor.rows, ...monitor.held];

    return {
      ...monitor,
      paused: false,
      held: [],
      rows: rows.length > PACKET_MONITOR_CAP ? rows.slice(rows.length - PACKET_MONITOR_CAP) : rows,
    };
  }

  return { ...monitor, paused: true };
}

export function clearPacketMonitor(monitor: PacketMonitor): PacketMonitor {
  return { ...monitor, rows: [], held: [] };
}

export function visiblePacketRows(monitor: PacketMonitor): PacketMonitorRow[] {
  return monitor.rows;
}

export function filterPacketRows(rows: readonly PacketMonitorRow[], callsign: string, type: PacketTypeFilter): PacketMonitorRow[] {
  const query = callsign.trim().toUpperCase();

  return rows.filter((row) => {
    const typeOk = type === 'all' || row.control === type || row.group === type;
    const callOk = query.length === 0
      || row.source.toUpperCase().includes(query)
      || row.destination.toUpperCase().includes(query)
      || row.path.toUpperCase().includes(query);
    return typeOk && callOk;
  });
}

export function formatPacketRow(row: PacketMonitorRow, timeZone?: string): string {
  const path = row.path ? `,${row.path}` : '';
  const ns = row.ns === '' ? '' : ` N(S)=${row.ns}`;
  const nr = row.nr === '' ? '' : ` N(R)=${row.nr}`;
  const pf = row.pf ? ` ${row.pf}` : '';
  const cr = row.cr ? ` ${row.cr}` : '';
  const pid = row.pid ? ` PID ${row.pid}` : '';
  return `${formatPacketTime(row.at, timeZone)} ${row.source}>${row.destination}${path} <${row.control}${pf}${cr}>${ns}${nr}${pid} | ${row.text} | ${row.hex}`;
}

export function formatPacketCopy(rows: readonly PacketMonitorRow[], timeZone?: string): string {
  return rows.map((row) => formatPacketRow(row, timeZone)).join('\n');
}

/** Dev fixture frames: one I, one S, and one U, with a digipeater H bit. */
export function packetFixturePayloads(): Uint8Array[] {
  const me = { call: 'KF5UFJ', ssid: 0 };
  const peer = { call: 'W1AW', ssid: 1 };
  const via = { call: 'WIDE1', ssid: 1, repeated: true };
  const info = Uint8Array.from([...'Hello\r'].map((character) => character.charCodeAt(0)));
  const frames = [
    encodeAx25Frame({
      destination: me,
      source: peer,
      path: [via],
      cr: 'command',
      kind: 'I',
      ns: 1,
      nr: 0,
      pf: true,
      info,
    }),
    encodeAx25Frame({
      destination: me,
      source: peer,
      cr: 'response',
      kind: 'S',
      sType: 'RR',
      nr: 2,
      pf: true,
    }),
    encodeAx25Frame({
      destination: peer,
      source: me,
      cr: 'command',
      kind: 'U',
      uType: 'SABM',
      pf: true,
    }),
  ];

  return frames.filter((frame): frame is Uint8Array => frame !== undefined);
}
