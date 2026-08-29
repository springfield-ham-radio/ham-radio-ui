<template>
  <div class="flex h-full min-h-0 flex-col gap-3 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold text-highlighted">Sniffer</h2>
          <UBadge :color="connectionBadgeColor" variant="subtle" size="sm">
            {{ connectionLabel }}
          </UBadge>
          <UBadge v-if="showBridgeBadge" :color="bridgeBadgeColor" variant="subtle" size="sm">
            {{ bridgeLabel }}
          </UBadge>
          <span v-if="reachable && status.packetCount" class="text-xs text-muted">{{ status.packetCount }} packets</span>
        </div>
        <p class="mt-0.5 text-xs text-muted">Bridge two serial ports and watch clone-protocol traffic.</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
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
      </div>
    </div>

    <UAlert
      v-if="!reachable"
      color="warning"
      variant="subtle"
      icon="i-lucide-unplug"
      title="Sniffer is not reachable"
      :description="offlineDescription"
    />

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
      <div class="flex h-fit flex-col gap-3 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">Bridge</p>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-refresh-cw"
            label="Refresh ports"
            :loading="portsPending"
            :disabled="!reachable"
            @click="refreshPorts"
          />
        </div>

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
            <UButton type="submit" icon="i-lucide-play" label="Start bridge" :disabled="!reachable || status.running" :loading="starting" />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-square"
              label="Stop bridge"
              :disabled="!reachable || !status.running"
              :loading="stopping"
              @click="stop"
            />
          </div>
        </form>
      </div>

      <div class="flex min-h-0 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
        <div class="flex items-center justify-between gap-2 border-b border-default px-4 py-2">
          <p class="text-sm font-medium text-highlighted">Traffic</p>
          <UButton color="neutral" variant="ghost" size="xs" label="Clear" :disabled="packets.length === 0" @click="clearPackets" />
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
          <p v-if="packets.length === 0" class="text-muted">Start the bridge to capture serial traffic.</p>
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
import { canUseRemoteSnifferSsh, remoteSnifferStatus } from '~/utils/sniffer-remote';
import { readSnifferSettings } from '~/utils/sniffer-settings';

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
const remoteTunnelRunning = ref(false);

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

const sshConfigured = computed(() => canUseRemoteSnifferSsh(snifferSettings.value));

const connectionLabel = computed(() => {
  if (sshConfigured.value) {
    // Prefer API reachability: an orphaned tunnel or URL-only path can still
    // serve traffic after the app loses track of the SSH child process.
    if (reachable.value) {
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
  if (sshConfigured.value) {
    if (reachable.value) {
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
  return status.value.running ? 'Bridge running' : 'Bridge stopped';
});

const bridgeBadgeColor = computed(() => {
  return status.value.running ? 'success' : 'neutral';
});

const showBridgeBadge = computed(() => reachable.value);

const offlineDescription = computed(() => {
  if (sshConfigured.value) {
    return `Start the remote sniffer under Preferences → Sniffer, then this page will connect to ${baseUrl.value}.`;
  }

  return `Start ham-radio-sniffer on ${baseUrl.value}, then this page will connect automatically.`;
});

async function refreshRemoteTunnelStatus(): Promise<void> {
  if (!sshConfigured.value) {
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
