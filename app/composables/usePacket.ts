import { watch } from 'vue';
import { formatAx25Call, canonicalAx25Call, type Ax25Call } from '~/utils/aprs-ax25';
import type { AprsHostSnapshot } from '~/utils/aprs-host-session';
import type { PacketLinkPhase } from '~/utils/packet-link';
import { type PacketMux } from '~/utils/packet-link';
import {
  createPacketCardMux,
  packetMuxBuildParams,
  samePacketMuxBuild,
  type PacketMuxBuildParams,
} from '~/utils/packet-card-session';
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
  applyPacketRadioIdentityMigration,
  isPacketRadioIdentityMigrationDone,
  markPacketRadioIdentityMigrationDone,
  normalizePacketSettings,
  packetMyCall,
  packetSettingsForCard,
  readPacketSettings,
  samePacketSettings,
  writePacketSettings,
  type PacketSettings,
  type PacketSettingsStorage,
} from '~/utils/packet-settings';
import { packetLinePayload, packetPeerPath, packetScrollText } from '~/utils/packet-terminal';
import {
  readSavedRadioStore,
  upsertSavedRadio,
  writeSavedRadioStore,
  patchSavedRadioPacketFields,
  type SavedRadio,
  type SavedRadioStore,
} from '~/utils/saved-radios';

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
  connectAttempt: number;
  n2: number;
  noAnswer?: string;
}

interface Runtime {
  monitor: PacketMonitor;
  mux?: PacketMux;
  muxBuild?: PacketMuxBuildParams;
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
let packetRadioMigrationStarted = false;

function packetStorageReady(): boolean {
  return import.meta.client || typeof localStorage !== 'undefined';
}

function browserStorage(): PacketSettingsStorage {
  if (packetStorageReady()) {
    return localStorage;
  }

  return {
    getItem: () => null,
    setItem() {
      return undefined;
    },
  };
}

function savedRadio(cardId: string): SavedRadio | undefined {
  return readSavedRadioStore().radios.find((radio) => radio.id === cardId);
}

function commitSavedRadioStore(next: SavedRadioStore): void {
  writeSavedRadioStore(next);

  if (!packetStorageReady()) {
    return;
  }

  const saved = useState<SavedRadioStore>('saved-radios', () => next);
  saved.value = next;
}

/**
 * Copy global Packet SSID onto radios that predate per-radio fields.
 *
 * Runs once per page load, from composable setup, before the Packet tab watch.
 * Later reads only load what was stored.
 */
function migratePacketRadiosOnce(): void {
  if (packetRadioMigrationStarted || !packetStorageReady()) {
    return;
  }

  packetRadioMigrationStarted = true;
  const storage = browserStorage();

  if (isPacketRadioIdentityMigrationDone(storage)) {
    return;
  }

  const current = readSavedRadioStore();
  const migrated = applyPacketRadioIdentityMigration(current.radios, storage);

  if (migrated.changed) {
    commitSavedRadioStore({ radios: migrated.radios });
  }

  markPacketRadioIdentityMigrationDone(storage);
}

function activePhase(runtime: Runtime): PacketLinkPhase | 'none' {
  const phases = runtime.mux?.snapshots() ?? [];
  const live = phases.find((item) => item.phase !== 'disconnected');
  return live?.phase ?? (phases.length > 0 ? 'disconnected' : 'none');
}

function linkIdle(runtime: Runtime): boolean {
  const phase = activePhase(runtime);
  return phase === 'disconnected' || phase === 'none';
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
  migratePacketRadiosOnce();

  function loadSettings(cardId: string): PacketSettings {
    return packetSettingsForCard(savedRadio(cardId), browserStorage());
  }

  function runtimeFor(cardId: string): Runtime {
    const existing = runtimes.get(cardId);
    const settings = loadSettings(cardId);

    if (existing) {
      if (!samePacketSettings(existing.settings, settings)) {
        existing.settings = settings;
      }

      return existing;
    }

    const created: Runtime = {
      monitor: createPacketMonitor(),
      settings,
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
        connectAttempt: live?.connectAttempt ?? 0,
        n2: live?.n2 ?? runtime.settings.n2,
        noAnswer: live?.noAnswer,
      },
    };
  }

  function apply(runtime: Runtime, step: { notices: Array<{ kind: 'status' | 'rx'; text: string }> }, sent?: string): void {
    runtime.scrollback = packetScrollText(runtime.scrollback, step.notices, sent, { at: Date.now() });

    if (step.notices.some((notice) => notice.kind === 'status' && notice.text.startsWith('Ignored'))) {
      runtime.error = undefined;
    }

    const failed = step.notices.find((notice) => notice.kind === 'status' && notice.text.includes('failed after'));

    if (failed) {
      runtime.error = failed.text;
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
    const runtime = runtimes.get(cardId);

    if (!runtime) {
      return;
    }

    const live = activePhase(runtime);

    if (live === 'connecting' || live === 'connected' || live === 'timer-recovery' || live === 'disconnecting') {
      return;
    }

    const build = packetMuxBuildParams(me, runtime.settings);

    if (runtime.mux && runtime.me && formatAx25Call(runtime.me) === formatAx25Call(me) && samePacketMuxBuild(runtime.muxBuild, build)) {
      return;
    }

    runtime.me = me;
    runtime.mux = createPacketCardMux(me, runtime.settings);
    runtime.muxBuild = build;
  }

  function syncStation(cardId: string, baseCall: string | undefined): void {
    const runtime = runtimeFor(cardId);
    const me = packetMyCall(baseCall, runtime.settings.ssid);
    const published = states.value[cardId];

    if (!me) {
      const needsClear = runtime.mux !== undefined || runtime.me !== undefined || runtime.sessionId !== undefined;

      if (linkIdle(runtime) && needsClear) {
        runtime.mux = undefined;
        runtime.muxBuild = undefined;
        runtime.sessionId = undefined;
        runtime.me = undefined;
      }

      if (!published || needsClear) {
        publish(cardId);
      }

      return;
    }

    const build = packetMuxBuildParams(me, runtime.settings);
    const callMatches = runtime.me !== undefined && formatAx25Call(runtime.me) === formatAx25Call(me);
    const muxMatches = runtime.mux !== undefined && callMatches && samePacketMuxBuild(runtime.muxBuild, build);
    const stateMatches = published !== undefined
      && published.settings.ssid === runtime.settings.ssid
      && published.settings.acceptIncoming === runtime.settings.acceptIncoming;

    if (muxMatches && stateMatches) {
      return;
    }

    ensureMux(cardId, me);
    publish(cardId);
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
    runtime.error = undefined;
    const step = runtime.mux?.connect({ call: peer, path: path.path });

    if (!step) {
      return;
    }

    if (step.error) {
      runtime.error = step.error;
      publish(cardId);
      return;
    }

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
    const next = normalizePacketSettings({ ...runtime.settings, ...patch });

    if (samePacketSettings(runtime.settings, next)) {
      return;
    }

    const store = readSavedRadioStore();
    const radio = store.radios.find((entry) => entry.id === cardId);
    const global = readPacketSettings(browserStorage());
    const { ssid, acceptIncoming, ...rest } = patch;
    const globalPatch = { ...rest } as Partial<PacketSettings>;

    if (Object.keys(globalPatch).length > 0) {
      writePacketSettings(browserStorage(), normalizePacketSettings({ ...global, ...globalPatch }));
    }

    if (radio && (ssid !== undefined || acceptIncoming !== undefined)) {
      const packetSsid = ssid !== undefined ? Math.min(15, Math.max(0, ssid)) : radio.packetSsid;
      const packetAcceptIncoming = acceptIncoming !== undefined ? acceptIncoming : radio.packetAcceptIncoming;

      if (radio.packetSsid !== packetSsid || radio.packetAcceptIncoming !== packetAcceptIncoming) {
        const updated = patchSavedRadioPacketFields(radio, {
          ...(ssid !== undefined ? { packetSsid: ssid } : {}),
          ...(acceptIncoming !== undefined ? { packetAcceptIncoming: acceptIncoming } : {}),
        });
        commitSavedRadioStore(upsertSavedRadio(store, updated));
      }
    } else if (!radio && (ssid !== undefined || acceptIncoming !== undefined)) {
      writePacketSettings(browserStorage(), normalizePacketSettings({
        ...global,
        ...globalPatch,
        ...(ssid !== undefined ? { ssid } : {}),
        ...(acceptIncoming !== undefined ? { acceptIncoming } : {}),
      }));
    }

    const loaded = loadSettings(cardId);

    if (!samePacketSettings(runtime.settings, loaded)) {
      runtime.settings = loaded;
    }

    runtime.mux?.setAcceptIncoming(runtime.settings.acceptIncoming);

    if (linkIdle(runtime) && runtime.me) {
      const build = packetMuxBuildParams(runtime.me, runtime.settings);

      if (!runtime.mux || !samePacketMuxBuild(runtime.muxBuild, build)) {
        runtime.mux = createPacketCardMux(runtime.me, runtime.settings);
        runtime.muxBuild = build;
      }
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
    syncStation,
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

/**
 * Keep the Packet mux aligned with the operator callsign and this radio's SSID.
 *
 * Sources are compared as values. A publish that leaves those values the same
 * does not call syncStation again, and syncStation itself returns without
 * writing when the station is already current.
 */
export function watchPacketStation(
  cardId: () => string | undefined,
  baseCall: () => string | undefined,
  packet: Pick<ReturnType<typeof usePacket>, 'states' | 'syncStation'>,
): void {
  watch(
    [
      cardId,
      baseCall,
      () => {
        const id = cardId();
        return id ? packet.states.value[id]?.settings.ssid : undefined;
      },
      () => {
        const id = cardId();
        return id ? packet.states.value[id]?.settings.acceptIncoming : undefined;
      },
    ],
    (next, previous) => {
      const id = next[0];

      if (!id) {
        return;
      }

      if (
        previous
        && next[0] === previous[0]
        && next[1] === previous[1]
        && next[2] === previous[2]
        && next[3] === previous[3]
      ) {
        return;
      }

      packet.syncStation(id, next[1]);
    },
    { immediate: true },
  );
}