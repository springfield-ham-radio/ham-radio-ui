<template>
  <div class="flex h-full min-h-0 flex-col gap-3 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-highlighted">Sniffer</h2>
          <UBadge :color="connectionBadgeColor" variant="subtle" size="sm">
            {{ connectionLabel }}
          </UBadge>
          <UBadge v-if="reachable" :color="bridgeBadgeColor" variant="subtle" size="sm">
            {{ bridgeLabel }}
          </UBadge>
          <span v-if="status.packetCount" class="text-xs text-muted">{{ status.packetCount }} packets</span>
        </div>
        <p class="mt-0.5 text-xs text-muted">Bridge two serial ports and watch clone-protocol traffic.</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <template v-if="showRemoteSshControls">
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-play"
            label="Start remote"
            :loading="remoteBusy === 'start'"
            :disabled="remoteBusy !== undefined"
            @click="onStartRemote"
          />
          <UButton
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-square"
            label="Stop remote"
            :loading="remoteBusy === 'stop'"
            :disabled="remoteBusy !== undefined"
            @click="onStopRemote"
          />
        </template>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-file-down"
          label="Save capture"
          :loading="saving"
          :disabled="!reachable || (packets.length === 0 && status.packetCount === 0)"
          @click="saveCapture"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          label="Refresh ports"
          :loading="portsPending"
          :disabled="!reachable"
          @click="refreshPorts"
        />
      </div>
    </div>

    <UAlert
      v-if="!reachable"
      color="warning"
      variant="subtle"
      icon="i-lucide-unplug"
      title="Sniffer is not running"
      :description="`Start ham-radio-sniffer on ${baseUrl}, then this page will connect automatically.`"
    />

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
      <div class="flex h-fit flex-col gap-3 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
        <p class="text-sm font-medium text-highlighted">Bridge</p>

        <form class="flex flex-col gap-3" @submit.prevent="onStart">
          <UFormField label="Computer port" required class="w-full">
            <USelectMenu
              v-model="computerPort"
              :items="ports"
              placeholder="Programming cable"
              class="w-full"
              :disabled="!reachable || status.running"
              :search-input="false"
            />
          </UFormField>

          <UFormField label="Radio port" required class="w-full">
            <USelectMenu
              v-model="radioPort"
              :items="ports"
              placeholder="Radio"
              class="w-full"
              :disabled="!reachable || status.running"
              :search-input="false"
            />
          </UFormField>

          <UFormField label="Baud rate" class="w-full">
            <USelectMenu
              v-model="baudRate"
              :items="baudRateItems"
              value-key="value"
              class="w-full"
              :disabled="!reachable || status.running"
              :search-input="false"
            />
          </UFormField>

          <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>

          <div class="flex gap-2">
            <UButton type="submit" icon="i-lucide-play" label="Start" :disabled="!reachable || status.running" :loading="starting" />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-square"
              label="Stop"
              :disabled="!reachable || !status.running"
              :loading="stopping"
              @click="stop"
            />
          </div>
        </form>
      </div>

      <div class="flex min-h-0 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
        <div class="flex items-center justify-between gap-2 border-b border-default px-4 py-2">
          <p class="text-sm font-medium text-highlighted">Live traffic</p>
          <UButton color="neutral" variant="ghost" size="xs" label="Clear" :disabled="packets.length === 0" @click="clearPackets" />
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
          <p v-if="packets.length === 0" class="text-muted">Start the sniffer to capture serial traffic.</p>
          <div v-for="packet in packets" :key="packet.id" class="flex gap-3 whitespace-nowrap">
            <span class="text-muted">{{ packet.timestamp }}</span>
            <span :class="packet.direction === 'COMPUTER->RADIO' ? 'text-warning' : 'text-success'">
              {{ packet.direction }}
            </span>
            <span class="text-highlighted">{{ snifferPacketToHex(packet.data) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { snifferPacketToHex } from '~/utils/sniffer-api';
import {
  canUseRemoteSnifferSsh,
  remoteSnifferStatus,
  startRemoteSniffer,
  stopRemoteSniffer,
} from '~/utils/sniffer-remote';
import {
  readSnifferSettings,
  snifferLocalForwardBaseUrl,
  writeSnifferSettings,
} from '~/utils/sniffer-settings';

useHead({ title: 'Sniffer' });

const REMOTE_STATUS_POLL_MS = 3000;

const baudRateItems = [
  { label: '9600', value: 9600 },
  { label: '19200', value: 19200 },
  { label: '38400', value: 38400 },
  { label: '57600', value: 57600 },
  { label: '115200', value: 115200 },
];

const computerPort = ref<string>();
const radioPort = ref<string>();
const baudRate = ref(9600);
const remoteBusy = ref<'start' | 'stop'>();
const remoteTunnelRunning = ref(false);
const toast = useToast();

const {
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
} = useSniffer();

const snifferSettings = ref(readSnifferSettings());
let remoteStatusTimer: ReturnType<typeof setInterval> | undefined;

const showRemoteSshControls = computed(() => canUseRemoteSnifferSsh(snifferSettings.value));

const connectionLabel = computed(() => {
  if (showRemoteSshControls.value) {
    if (remoteTunnelRunning.value && reachable.value) {
      return 'Remote connected';
    }

    if (remoteTunnelRunning.value) {
      return 'Remote tunnel up';
    }

    return 'Remote disconnected';
  }

  return reachable.value ? 'Connected' : 'Disconnected';
});

const connectionBadgeColor = computed(() => {
  if (showRemoteSshControls.value) {
    if (remoteTunnelRunning.value && reachable.value) {
      return 'success';
    }

    if (remoteTunnelRunning.value) {
      return 'warning';
    }

    return 'neutral';
  }

  return reachable.value ? 'success' : 'warning';
});

const bridgeLabel = computed(() => {
  return status.value.running ? 'Running' : 'Stopped';
});

const bridgeBadgeColor = computed(() => {
  return status.value.running ? 'success' : 'neutral';
});

async function refreshRemoteTunnelStatus(): Promise<void> {
  if (!showRemoteSshControls.value) {
    remoteTunnelRunning.value = false;
    return;
  }

  try {
    const result = await remoteSnifferStatus();
    remoteTunnelRunning.value = result.running;
  } catch {
    remoteTunnelRunning.value = false;
  }
}

function startRemoteStatusPolling(): void {
  if (!import.meta.client || remoteStatusTimer) {
    return;
  }

  void refreshRemoteTunnelStatus();
  remoteStatusTimer = setInterval(() => {
    snifferSettings.value = readSnifferSettings();
    void refreshRemoteTunnelStatus();
  }, REMOTE_STATUS_POLL_MS);
}

function stopRemoteStatusPolling(): void {
  if (remoteStatusTimer) {
    clearInterval(remoteStatusTimer);
    remoteStatusTimer = undefined;
  }
}

async function onStart(): Promise<void> {
  await start(computerPort.value, radioPort.value, baudRate.value);
}

async function onStartRemote(): Promise<void> {
  remoteBusy.value = 'start';

  try {
    const settings = readSnifferSettings();
    const result = await startRemoteSniffer(settings);

    if (!result.ok) {
      toast.add({ title: 'Remote start failed', description: result.message, color: 'error' });
      await refreshRemoteTunnelStatus();
      return;
    }

    const forwardUrl = snifferLocalForwardBaseUrl(settings.localPort);
    writeSnifferSettings({ ...settings, baseUrl: forwardUrl });
    baseUrl.value = forwardUrl;
    snifferSettings.value = readSnifferSettings();
    await refreshRemoteTunnelStatus();
    toast.add({ title: 'Remote sniffer started', description: result.message, color: 'success' });
  } catch (error) {
    toast.add({
      title: 'Remote start failed',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    });
    await refreshRemoteTunnelStatus();
  } finally {
    remoteBusy.value = undefined;
  }
}

async function onStopRemote(): Promise<void> {
  remoteBusy.value = 'stop';

  try {
    const result = await stopRemoteSniffer();

    if (!result.ok) {
      toast.add({ title: 'Remote stop failed', description: result.message, color: 'error' });
      await refreshRemoteTunnelStatus();
      return;
    }

    await refreshRemoteTunnelStatus();
    toast.add({ title: 'Remote sniffer stopped', description: result.message, color: 'neutral' });
  } catch (error) {
    toast.add({
      title: 'Remote stop failed',
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
    });
    await refreshRemoteTunnelStatus();
  } finally {
    remoteBusy.value = undefined;
  }
}

onMounted(() => {
  snifferSettings.value = readSnifferSettings();
  startWatching();
  startRemoteStatusPolling();
});

onBeforeUnmount(() => {
  stopWatching();
  stopRemoteStatusPolling();
});
</script>
