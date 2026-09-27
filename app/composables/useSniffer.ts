import type { SnifferEvent, SnifferHealth, SnifferLogResponse, SnifferPacket, SnifferPortsResponse, SnifferStatus } from '~/utils/sniffer-api';
import { mergeSnifferPackets, snifferEventSourceErrorAction, snifferFetchErrorMessage, snifferPacketsNeedReload } from '~/utils/sniffer-api';
import {
  defaultSnifferCaptureFileName,
  serializeSnifferCaptureFile,
  snifferCaptureEntryCount,
} from '~/utils/sniffer-capture';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';
import { saveJsonFileWithPicker } from '~/utils/radio-memory-file-io';
import { serialPortSelectItems, type SerialPortOption } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { readSnifferSettings, snifferApiUrl, snifferHttpUrl } from '~/utils/sniffer-settings';

const MAX_LIVE_PACKETS = 2000;
const HEALTH_POLL_MS = 3000;

/**
 * Talks to the headless ham-radio-sniffer HTTP API.
 *
 * Reachability is polled so the page can recover when the sidecar starts after
 * the UI. Live frames arrive over SSE; control uses ordinary JSON fetches.
 */
export function useSniffer() {
  const toast = useToast();
  const baseUrl = useState('sniffer-base-url', () => snifferHttpUrl(readSnifferSettings()));
  const reachable = useState('sniffer-reachable', () => false);
  const snifferVersion = useState<string | undefined>('sniffer-version', () => undefined);
  const status = useState<SnifferStatus>('sniffer-status', () => ({ running: false, packetCount: 0 }));
  const ports = useState<SerialPortOption[]>('sniffer-ports', () => []);
  const portsPending = useState('sniffer-ports-pending', () => false);
  const packets = useState<SnifferPacket[]>('sniffer-packets', () => []);
  const clearedThroughPacketId = useState('sniffer-cleared-through-packet-id', () => 0);
  const errorMessage = useState('sniffer-error', () => '');
  const starting = useState('sniffer-starting', () => false);
  const stopping = useState('sniffer-stopping', () => false);
  const saving = useState('sniffer-saving', () => false);

  let eventSource: EventSource | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  let packetSync: Promise<void> | undefined;

  async function request<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    return await $fetch<T>(snifferApiUrl(baseUrl.value, path), options);
  }

  function applyStatus(nextStatus: SnifferStatus): void {
    status.value = nextStatus;
  }

  function replacePackets(incoming: SnifferPacket[]): void {
    const merged = mergeSnifferPackets(packets.value, incoming, clearedThroughPacketId.value);
    packets.value = merged.length > MAX_LIVE_PACKETS ? merged.slice(-MAX_LIVE_PACKETS) : merged;
  }

  function noteStatus(nextStatus: SnifferStatus): void {
    applyStatus(nextStatus);

    if (nextStatus.packetCount === 0) {
      clearedThroughPacketId.value = 0;
    }

    if (snifferPacketsNeedReload(packets.value.length, nextStatus.packetCount, clearedThroughPacketId.value)) {
      void syncPacketsFromServer();
    }
  }

  function syncPacketsFromServer(): Promise<void> {
    if (packetSync) {
      return packetSync;
    }

    packetSync = request<SnifferLogResponse>('/api/sniffer/log')
      .then((response) => {
        applyStatus(response.status);
        replacePackets(response.packets);
      })
      .catch(() => undefined)
      .finally(() => {
        packetSync = undefined;
      });

    return packetSync;
  }

  function disconnectEvents(): void {
    const source = eventSource;
    eventSource = undefined;

    if (!source) {
      return;
    }

    source.onerror = null;
    source.onmessage = null;
    source.close();
  }

  function markUnreachable(): void {
    reachable.value = false;
    snifferVersion.value = undefined;
    disconnectEvents();

    // Drop "running" so a stale useState value cannot disagree with the
    // connection badge after the API drops offline.
    if (status.value.running) {
      applyStatus({
        ...status.value,
        running: false,
      });
    }
  }

  async function refreshPorts(): Promise<void> {
    portsPending.value = true;

    try {
      const response = await request<SnifferPortsResponse>('/api/ports');
      ports.value = serialPortSelectItems(
        response.ports.map((port) => port.path),
        readSerialPortSettings(),
      );
      reachable.value = true;
    } catch (error) {
      markUnreachable();
      ports.value = [];
      errorMessage.value = snifferFetchErrorMessage(error);
    } finally {
      portsPending.value = false;
    }
  }

  async function checkHealth(): Promise<boolean> {
    try {
      const health = await request<SnifferHealth>('/api/health');
      reachable.value = health.ok !== false;
      snifferVersion.value = typeof health.version === 'string' && health.version.length > 0 ? health.version : undefined;
      return reachable.value;
    } catch {
      markUnreachable();
      return false;
    }
  }

  function handleEvent(event: SnifferEvent): void {
    if (event.type === 'status') {
      noteStatus(event.status);
      return;
    }

    if (event.type === 'packet') {
      replacePackets([event.packet]);
      return;
    }

    if (event.type === 'error') {
      errorMessage.value = event.message;
    }
  }

  function connectEvents(): void {
    if (!import.meta.client) {
      return;
    }

    disconnectEvents();
    const source = new EventSource(snifferApiUrl(baseUrl.value, '/api/sniffer/events'));
    eventSource = source;

    source.onmessage = (message) => {
      handleEvent(JSON.parse(message.data) as SnifferEvent);
    };

    source.onerror = () => {
      if (snifferEventSourceErrorAction({ current: eventSource, source, readyState: source.readyState }) === 'ignore') {
        return;
      }

      if (eventSource === source) {
        eventSource = undefined;
      }
    };
  }

  async function start(computerPort: string | undefined, radioPort: string | undefined, baudRate: number): Promise<void> {
    errorMessage.value = '';
    starting.value = true;

    try {
      const nextStatus = await request<SnifferStatus>('/api/sniffer/start', {
        method: 'POST',
        body: {
          computerPort,
          radioPort,
          baudRate,
        },
      });

      packets.value = [];
      clearedThroughPacketId.value = 0;
      noteStatus(nextStatus);

      if (!eventSource) {
        connectEvents();
      }
    } catch (error) {
      errorMessage.value = snifferFetchErrorMessage(error);
    } finally {
      starting.value = false;
    }
  }

  async function stop(): Promise<void> {
    errorMessage.value = '';
    stopping.value = true;

    try {
      applyStatus(await request<SnifferStatus>('/api/sniffer/stop', { method: 'POST' }));
    } catch (error) {
      errorMessage.value = snifferFetchErrorMessage(error);
    } finally {
      stopping.value = false;
    }
  }

  function clearPackets(): void {
    const maxId = packets.value.reduce((max, packet) => Math.max(max, packet.id), clearedThroughPacketId.value);
    clearedThroughPacketId.value = maxId;
    packets.value = [];
  }

  /**
   * Save the current capture as JSON for offline review or driver verification.
   *
   * Prefers the sniffer API SerialLogger payload (SEND/RECV) and includes the
   * coalesced UI packets so agents can compare against a driver serial log.
   */
  async function saveCapture(): Promise<void> {
    if (!reachable.value) {
      toast.add({
        title: 'Sniffer is offline',
        description: 'Start ham-radio-sniffer before saving a capture.',
        color: 'warning',
        icon: 'i-lucide-unplug',
      });
      return;
    }

    saving.value = true;

    try {
      const response = await request<SnifferLogResponse>('/api/sniffer/log');
      applyStatus(response.status);
      const capturePackets = response.packets.length > 0 ? response.packets : packets.value;
      const entryCount = snifferCaptureEntryCount(response.file.data, capturePackets);

      if (entryCount === 0) {
        toast.add({
          title: 'Nothing to save',
          description: 'Capture some serial traffic first.',
          color: 'warning',
          icon: 'i-lucide-triangle-alert',
        });
        return;
      }

      const contents = serializeSnifferCaptureFile({
        status: response.status,
        packets: capturePackets,
        log: response.file.data,
      });

      const destination = await saveJsonFileWithPicker(contents, defaultSnifferCaptureFileName(), {
        title: 'Save Sniffer Capture',
        filterName: 'Sniffer Capture',
      });

      if (destination === undefined) {
        return;
      }

      toast.add({
        title: 'Sniffer capture saved',
        description: `${memoryFileDisplayName(destination)} · ${entryCount} frames`,
        color: 'success',
        icon: 'i-lucide-file-text',
      });
    } catch (error) {
      toast.add({
        title: 'Could not save capture',
        description: snifferFetchErrorMessage(error),
        color: 'error',
        icon: 'i-lucide-circle-alert',
      });
    } finally {
      saving.value = false;
    }
  }

  async function connect(): Promise<void> {
    baseUrl.value = snifferHttpUrl(readSnifferSettings());
    const isReachable = await checkHealth();

    if (!isReachable) {
      return;
    }

    errorMessage.value = '';
    await refreshPorts();

    try {
      noteStatus(await request<SnifferStatus>('/api/sniffer'));
    } catch {
      // Health succeeded; status sync is best-effort until SSE connects.
    }

    connectEvents();
  }

  function startWatching(): void {
    if (!import.meta.client || healthTimer) {
      return;
    }

    void connect();
    healthTimer = setInterval(() => {
      const storedUrl = snifferHttpUrl(readSnifferSettings());
      const needsEvents = !eventSource;

      if (storedUrl !== baseUrl.value || !reachable.value || needsEvents) {
        void connect();
      } else if (reachable.value) {
        void checkHealth().then((isReachable) => {
          if (!isReachable) {
            return;
          }

          void request<SnifferStatus>('/api/sniffer')
            .then(noteStatus)
            .catch(() => undefined);
        });
      }
    }, HEALTH_POLL_MS);
  }

  function stopWatching(): void {
    if (healthTimer) {
      clearInterval(healthTimer);
      healthTimer = undefined;
    }

    disconnectEvents();
  }

  return {
    baseUrl,
    reachable,
    snifferVersion,
    status,
    ports,
    portsPending,
    packets,
    errorMessage,
    starting,
    stopping,
    saving,
    refreshPorts,
    start,
    stop,
    clearPackets,
    saveCapture,
    startWatching,
    stopWatching,
    connect,
  };
}
