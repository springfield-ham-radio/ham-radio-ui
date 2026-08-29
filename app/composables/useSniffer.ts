import type { SnifferEvent, SnifferLogResponse, SnifferPacket, SnifferPortsResponse, SnifferStatus } from '~/utils/sniffer-api';
import { snifferFetchErrorMessage } from '~/utils/sniffer-api';
import {
  defaultSnifferCaptureFileName,
  serializeSnifferCaptureFile,
  snifferCaptureEntryCount,
} from '~/utils/sniffer-capture';
import { memoryFileDisplayName } from '~/utils/radio-memory-file';
import { saveJsonFileWithPicker } from '~/utils/radio-memory-file-io';
import { readSnifferSettings, snifferApiUrl } from '~/utils/sniffer-settings';

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
  const baseUrl = useState('sniffer-base-url', () => readSnifferSettings().baseUrl);
  const reachable = useState('sniffer-reachable', () => false);
  const status = useState<SnifferStatus>('sniffer-status', () => ({ running: false, packetCount: 0 }));
  const ports = useState<string[]>('sniffer-ports', () => []);
  const portsPending = useState('sniffer-ports-pending', () => false);
  const packets = useState<SnifferPacket[]>('sniffer-packets', () => []);
  const errorMessage = useState('sniffer-error', () => '');
  const starting = useState('sniffer-starting', () => false);
  const stopping = useState('sniffer-stopping', () => false);
  const saving = useState('sniffer-saving', () => false);

  let eventSource: EventSource | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;

  async function request<T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    return await $fetch<T>(snifferApiUrl(baseUrl.value, path), options);
  }

  async function refreshPorts(): Promise<void> {
    portsPending.value = true;

    try {
      const response = await request<SnifferPortsResponse>('/api/ports');
      ports.value = response.ports.map((port) => port.path);
      reachable.value = true;
    } catch (error) {
      reachable.value = false;
      ports.value = [];
      errorMessage.value = snifferFetchErrorMessage(error);
    } finally {
      portsPending.value = false;
    }
  }

  async function checkHealth(): Promise<boolean> {
    try {
      await request('/api/health');
      reachable.value = true;
      return true;
    } catch {
      reachable.value = false;
      return false;
    }
  }

  function applyStatus(nextStatus: SnifferStatus): void {
    status.value = nextStatus;
  }

  function handleEvent(event: SnifferEvent): void {
    if (event.type === 'status') {
      applyStatus(event.status);
      return;
    }

    if (event.type === 'packet') {
      const nextPackets = [...packets.value, event.packet];
      packets.value = nextPackets.length > MAX_LIVE_PACKETS ? nextPackets.slice(-MAX_LIVE_PACKETS) : nextPackets;
      return;
    }

    if (event.type === 'error') {
      errorMessage.value = event.message;
    }
  }

  function disconnectEvents(): void {
    eventSource?.close();
    eventSource = undefined;
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
      reachable.value = false;
      disconnectEvents();
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
      applyStatus(nextStatus);
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
    baseUrl.value = readSnifferSettings().baseUrl;
    const isReachable = await checkHealth();

    if (!isReachable) {
      disconnectEvents();
      return;
    }

    errorMessage.value = '';
    await refreshPorts();
    connectEvents();
  }

  function startWatching(): void {
    if (!import.meta.client || healthTimer) {
      return;
    }

    void connect();
    healthTimer = setInterval(() => {
      const storedUrl = readSnifferSettings().baseUrl;

      if (storedUrl !== baseUrl.value || !reachable.value || !eventSource) {
        void connect();
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
