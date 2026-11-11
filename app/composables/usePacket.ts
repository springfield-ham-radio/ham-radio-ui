import { formatAx25Call, canonicalAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import type { AprsHostSnapshot } from '~/utils/aprs-host-session';
import type { PacketLinkPhase } from '~/utils/packet-link';
import { createPacketMux, type PacketMux } from '~/utils/packet-link';
import {
  clearPacketMonitor,
  createPacketMonitor,
  filterPacketRows,
  formatPacketCopy,
  pausePacketMonitor,
  pushPacketMonitor,
  type PacketMonitor,
  type PacketMonitorRow,
  type PacketTypeFilter,
} from '~/utils/packet-monitor';
import { packetLinkBlockReason } from '~/utils/packet-port';
import {
  normalizePacketSettings,
  packetMyCall,
  readPacketSettings,
  writePacketSettings,
  type PacketSettings,
  type PacketSettingsStorage,
} from '~/utils/packet-settings';
import { packetLinePayload, packetPeerPath, packetScrollText } from '~/utils/packet-terminal';

export interface PacketCardState {
  rows: PacketMonitorRow[];
  visible: PacketMonitorRow[];
  paused: boolean;
  heldCount: number;
  filterCall: string;
  filterType: PacketTypeFilter;
  settings: PacketSettings;
  phase: PacketLinkPhase | 'none';
  peer?: string;
  scrollback: string;
  error?: string;
  sessionId?: string;
  sessionCount: number;
}

interface Runtime {
  monitor: PacketMonitor;
  mux?: PacketMux;
  settings: PacketSettings;
  scrollback: string;
  filterCall: string;
  filterType: PacketTypeFilter;
  error?: string;
  sessionId?: string;
  me?: Ax25Call;
  offKiss?: () => void;
  offHook?: () => void;
  timer?: ReturnType<typeof setInterval>;
  writing: boolean;
  queue: Uint8Array[];
}

const runtimes = new Map<string, Runtime>();

function browserStorage(): PacketSettingsStorage {
  if (import.meta.client) {
    return localStorage;
  }

  return {
    getItem: () => null,
    setItem() {
      return undefined;
    },
  };
}

function activePhase(runtime: Runtime): PacketLinkPhase | 'none' {
  const phases = runtime.mux?.snapshots() ?? [];
  const live = phases.find((item) => item.phase !== 'disconnected');
  return live?.phase ?? (phases.length > 0 ? 'disconnected' : 'none');
}

/**
 * Packet monitor and connected-mode sessions for one radio card.
 *
 * Frames come from the shared host KISS session. Leaving the tab sends DISC
 * once and stops timers. The monitor subscription stays until the card closes.
 */
export function usePacket() {
  const host = useAprsHost();
  const states = useState<Record<string, PacketCardState>>('packet-card-state', () => ({}));

  function runtimeFor(cardId: string): Runtime {
    const existing = runtimes.get(cardId);

    if (existing) {
      return existing;
    }

    const created: Runtime = {
      monitor: createPacketMonitor(),
      settings: readPacketSettings(browserStorage()),
      scrollback: '',
      filterCall: '',
      filterType: 'all',
      writing: false,
      queue: [],
    };
    runtimes.set(cardId, created);
    return created;
  }

  function publish(cardId: string): void {
    const runtime = runtimes.get(cardId);

    if (!runtime) {
      return;
    }

    const live = runtime.mux?.snapshots().find((item) => item.phase !== 'disconnected')
      ?? runtime.mux?.snapshots()[0];

    states.value = {
      ...states.value,
      [cardId]: {
        rows: runtime.monitor.rows,
        visible: filterPacketRows(runtime.monitor.rows, runtime.filterCall, runtime.filterType),
        paused: runtime.monitor.paused,
        heldCount: runtime.monitor.held.length,
        filterCall: runtime.filterCall,
        filterType: runtime.filterType,
        settings: runtime.settings,
        phase: activePhase(runtime),
        peer: live?.peer,
        scrollback: runtime.scrollback,
        error: runtime.error,
        sessionId: runtime.sessionId,
        sessionCount: runtime.mux?.snapshots().length ?? 0,
      },
    };
  }

  function apply(runtime: Runtime, step: { notices: Array<{ kind: 'status' | 'rx'; text: string }> }, sent?: string): void {
    runtime.scrollback = packetScrollText(runtime.scrollback, step.notices, sent);

    if (step.notices.some((notice) => notice.kind === 'status' && notice.text.startsWith('Ignored'))) {
      runtime.error = undefined;
    }
  }

  async function flush(cardId: string): Promise<void> {
    const runtime = runtimes.get(cardId);

    if (!runtime) {
      return;
    }

    while (runtime.writing) {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    runtime.writing = true;

    try {
      while (runtime.queue.length > 0) {
        const next = runtime.queue.shift();

        if (!next) {
          break;
        }

        const reason = await host.writeKissData(cardId, next);

        if (reason) {
          runtime.error = reason;
          runtime.queue.length = 0;
          runtime.mux?.stopAll();
          break;
        }
      }
    } finally {
      runtime.writing = false;
      publish(cardId);
    }
  }

  function stopTimer(runtime: Runtime): void {
    if (runtime.timer) {
      clearInterval(runtime.timer);
      runtime.timer = undefined;
    }
  }

  function ensureTimer(cardId: string): void {
    const runtime = runtimeFor(cardId);

    if (runtime.timer) {
      return;
    }

    runtime.timer = setInterval(() => {
      const step = runtime.mux?.tick(Date.now());

      if (!step || (step.frames.length === 0 && step.notices.length === 0)) {
        if (activePhase(runtime) === 'disconnected' || activePhase(runtime) === 'none') {
          stopTimer(runtime);
        }

        return;
      }

      apply(runtime, step);
      runtime.queue.push(...step.frames);
      void flush(cardId);
      publish(cardId);
    }, 200);
  }

  function ensureMux(cardId: string, me: Ax25Call): void {
    const runtime = runtimeFor(cardId);
    const live = activePhase(runtime);

    if (runtime.mux && runtime.me && formatAx25Call(runtime.me) === formatAx25Call(me) && live !== 'none') {
      return;
    }

    if (live === 'connecting' || live === 'connected' || live === 'timer-recovery' || live === 'disconnecting') {
      return;
    }

    runtime.me = me;
    runtime.mux = createPacketMux({
      me,
      modulo: runtime.settings.modulo,
      paclen: runtime.settings.paclen,
      maxframe: runtime.settings.maxframe,
      t1Ms: runtime.settings.t1Ms,
      t3Ms: runtime.settings.t3Ms,
      n2: runtime.settings.n2,
      acceptIncoming: runtime.settings.acceptIncoming,
      now: () => Date.now(),
    });
  }

  function attach(cardId: string): void {
    const runtime = runtimeFor(cardId);

    if (!runtime.offKiss) {
      runtime.offKiss = host.addKissDataListener(cardId, (payload) => {
        runtime.monitor = pushPacketMonitor(runtime.monitor, payload, Date.now(), runtime.settings.modulo);
        const step = runtime.mux?.receive(payload);

        if (step) {
          if (step.id) {
            runtime.sessionId = step.id;
          }

          apply(runtime, step);
          runtime.queue.push(...step.frames);

          if (step.frames.length > 0) {
            ensureTimer(cardId);
            void flush(cardId);
          }
        }

        publish(cardId);
      });
    }

    if (!runtime.offHook) {
      runtime.offHook = host.addDisconnectHook(cardId, async () => {
        const step = runtime.mux?.disconnectAll(true);

        if (step) {
          apply(runtime, step);
          runtime.queue.push(...step.frames);
          await flush(cardId);
        }

        runtime.mux?.stopAll();
        stopTimer(runtime);
        publish(cardId);
      });
    }

    publish(cardId);
  }

  async function endLink(cardId: string): Promise<void> {
    const runtime = runtimes.get(cardId);

    if (!runtime?.mux) {
      return;
    }

    const step = runtime.mux.disconnectAll(true);
    apply(runtime, step);
    runtime.queue.push(...step.frames);
    await flush(cardId);
    runtime.mux.stopAll();
    stopTimer(runtime);
    publish(cardId);
  }

  async function closeCard(cardId: string): Promise<void> {
    await endLink(cardId);
    const runtime = runtimes.get(cardId);
    runtime?.offKiss?.();
    runtime?.offHook?.();
    stopTimer(runtime ?? { timer: undefined } as Runtime);
    runtimes.delete(cardId);

    const next = { ...states.value };
    delete next[cardId];
    states.value = next;
  }

  function notePort(cardId: string, snapshot: AprsHostSnapshot | undefined): void {
    const runtime = runtimes.get(cardId);

    if (!runtime?.mux || !snapshot) {
      return;
    }

    const block = packetLinkBlockReason({
      connected: snapshot.connected,
      detectPhase: snapshot.detectPhase,
      kissConfirmed: snapshot.kissConfirmed,
      hardwareTransmit: snapshot.hardwareTransmit,
    });
    const phase = activePhase(runtime);

    if (!block || phase === 'disconnected' || phase === 'none') {
      return;
    }

    const step = runtime.mux.stopAll();
    apply(runtime, step);
    runtime.error = block;
    stopTimer(runtime);
    publish(cardId);
  }

  async function connectLink(cardId: string, baseCall: string | undefined, peerText: string, pathText: string): Promise<void> {
    const runtime = runtimeFor(cardId);
    const me = packetMyCall(baseCall, runtime.settings.ssid);

    if (!me) {
      runtime.error = 'Set a callsign in Preferences. Nothing was sent.';
      publish(cardId);
      return;
    }

    const block = host.packetSendBlock(cardId);

    if (block) {
      runtime.error = block;
      publish(cardId);
      return;
    }

    const peer = canonicalAx25Call(peerText);
    const path = packetPeerPath(pathText);

    if (!peer || path.error || !path.path) {
      runtime.error = path.error ?? 'Enter the station callsign. Nothing was sent.';
      publish(cardId);
      return;
    }

    ensureMux(cardId, me);
    const step = runtime.mux?.connect({ call: peer, path: path.path });

    if (!step) {
      return;
    }

    if (step.error) {
      runtime.error = step.error;
      publish(cardId);
      return;
    }

    runtime.error = undefined;
    runtime.sessionId = step.id;
    apply(runtime, step);
    runtime.queue.push(...step.frames);
    ensureTimer(cardId);
    publish(cardId);
    await flush(cardId);
  }

  async function disconnectLink(cardId: string): Promise<void> {
    const runtime = runtimes.get(cardId);
    const id = runtime?.sessionId;

    if (!runtime?.mux || !id) {
      await endLink(cardId);
      return;
    }

    const step = runtime.mux.disconnect(id, false);
    apply(runtime, step);
    runtime.queue.push(...step.frames);
    ensureTimer(cardId);
    publish(cardId);
    await flush(cardId);
  }

  async function sendLine(cardId: string, line: string): Promise<void> {
    const runtime = runtimes.get(cardId);
    const id = runtime?.sessionId;

    if (!runtime?.mux || !id) {
      return;
    }

    const payload = packetLinePayload(line);

    if (!payload) {
      runtime.error = 'Use printable text. The line is sent with a carriage return.';
      publish(cardId);
      return;
    }

    const step = runtime.mux.send(id, payload);

    if (step.error) {
      runtime.error = step.error;
      publish(cardId);
      return;
    }

    runtime.error = undefined;
    apply(runtime, step, line);
    runtime.queue.push(...step.frames);
    ensureTimer(cardId);
    publish(cardId);
    await flush(cardId);
  }

  function setFilter(cardId: string, callsign: string, type: PacketTypeFilter): void {
    const runtime = runtimeFor(cardId);
    runtime.filterCall = callsign;
    runtime.filterType = type;
    publish(cardId);
  }

  function togglePause(cardId: string): void {
    const runtime = runtimeFor(cardId);
    runtime.monitor = pausePacketMonitor(runtime.monitor);
    publish(cardId);
  }

  function clearMonitor(cardId: string): void {
    const runtime = runtimeFor(cardId);
    runtime.monitor = clearPacketMonitor(runtime.monitor);
    publish(cardId);
  }

  function copyText(cardId: string): string {
    const runtime = runtimes.get(cardId);

    if (!runtime) {
      return '';
    }

    return formatPacketCopy(filterPacketRows(runtime.monitor.rows, runtime.filterCall, runtime.filterType));
  }

  function clearScrollback(cardId: string): void {
    const runtime = runtimeFor(cardId);
    runtime.scrollback = '';
    publish(cardId);
  }

  function updateSettings(cardId: string, patch: Partial<PacketSettings>): void {
    const runtime = runtimeFor(cardId);
    runtime.settings = normalizePacketSettings({ ...runtime.settings, ...patch });
    writePacketSettings(browserStorage(), runtime.settings);
    runtime.mux?.setAcceptIncoming(runtime.settings.acceptIncoming);

    if (activePhase(runtime) === 'disconnected' || activePhase(runtime) === 'none') {
      runtime.mux = undefined;
      runtime.sessionId = undefined;
    }

    publish(cardId);
  }

  function showFixture(cardId: string, payloads: Uint8Array[], at: number): void {
    const runtime = runtimeFor(cardId);

    for (const payload of payloads) {
      runtime.monitor = pushPacketMonitor(runtime.monitor, payload, at, runtime.settings.modulo);
    }

    publish(cardId);
  }

  return {
    states,
    attach,
    endLink,
    closeCard,
    notePort,
    connectLink,
    disconnectLink,
    sendLine,
    setFilter,
    togglePause,
    clearMonitor,
    copyText,
    clearScrollback,
    updateSettings,
    showFixture,
  };
}
