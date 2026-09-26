<script setup lang="ts">
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { readSnifferSettings, snifferHttpUrl } from '~/utils/sniffer-settings';

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

const {
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
} = useSniffer();

const snifferSettings = ref(readSnifferSettings());

const connectionLabel = computed(() => {
  return reachable.value ? 'Connected' : 'Disconnected';
});

const connectionBadgeColor = computed(() => {
  return reachable.value ? 'success' : 'warning';
});

const bridgeLabel = computed(() => {
  return status.value.running ? 'Running' : 'Stopped';
});

const bridgeBadgeColor = computed(() => {
  return status.value.running ? 'success' : 'neutral';
});

const showBridgeBadge = computed(() => reachable.value);

const bridgeDiagnostics = computed(() => {
  const computer = status.value.computerPortOpen ? 'Computer open' : 'Computer closed';
  const radio = status.value.radioPortOpen ? 'Radio open' : 'Radio closed';
  const computerBytes = status.value.bytesComputerToRadio ?? 0;
  const radioBytes = status.value.bytesRadioToComputer ?? 0;
  const writeErrors = status.value.writeErrors ?? 0;
  const parts = [`${computer}`, `${radio}`, `C→R ${computerBytes} B`, `R→C ${radioBytes} B`];

  if (writeErrors > 0) {
    parts.push(`${writeErrors} write errors`);
  }

  return parts.join(' · ');
});

const canToggleBridge = computed(() => {
  if (!reachable.value || starting.value || stopping.value) {
    return false;
  }

  if (status.value.running) {
    return true;
  }

  return Boolean(computerPort.value && radioPort.value);
});

const emptyTrafficHint = computed(() => {
  if (!status.value.running) {
    return 'Turn on Bridge ports to capture serial traffic.';
  }

  const received = (status.value.bytesComputerToRadio ?? 0) + (status.value.bytesRadioToComputer ?? 0);

  if (received === 0) {
    return 'Bridge is up but the UART has delivered 0 bytes. The selected port is not receiving, even if a scope sees TX.';
  }

  return 'Bytes arrived; waiting for a coalesced traffic frame.';
});

const offlineDescription = computed(() => {
  return `Start the sniffer under Preferences → Sniffer (${snifferHttpUrl(snifferSettings.value)}).`;
});

async function onToggleBridge(next: boolean): Promise<void> {
  if (next) {
    await start(computerPort.value, radioPort.value, baudRate.value);
    return;
  }

  await stop();
}

onMounted(() => {
  snifferSettings.value = readSnifferSettings();
  startWatching();
});

onBeforeUnmount(() => {
  stopWatching();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 pt-2">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-sm font-medium text-highlighted">Sniffer</p>
          <UBadge :color="connectionBadgeColor" variant="subtle" size="md">
            {{ connectionLabel }}
          </UBadge>
          <UBadge v-if="reachable && snifferVersion" color="neutral" variant="subtle" size="sm">
            v{{ snifferVersion }}
          </UBadge>
          <span v-if="reachable && status.running" class="text-xs text-muted">{{ status.packetCount }} packets</span>
        </div>
        <p class="mt-0.5 text-xs text-muted">Bridges the computer and radio serial ports so you can watch clone-protocol traffic from a 3rd party application.</p>
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
          <div class="flex min-w-0 items-center gap-2">
            <p class="text-sm font-medium text-highlighted">Bridge</p>
            <UBadge v-if="showBridgeBadge" :color="bridgeBadgeColor" variant="subtle" size="sm">
              {{ bridgeLabel }}
            </UBadge>
          </div>
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

        <div class="flex flex-col gap-3">
          <UFormField
            label="Computer port"
            description="Debug cable between the computer and the sniffer"
            required
            class="w-full"
          >
            <USelect
              v-model="computerPort"
              :items="ports"
              value-key="value"
              placeholder="Select port"
              class="w-full"
              :disabled="!reachable || status.running"
            />
          </UFormField>

          <UFormField
            label="Radio port"
            description="Programming cable between the sniffer and the radio"
            required
            class="w-full"
          >
            <USelect
              v-model="radioPort"
              :items="ports"
              value-key="value"
              placeholder="Select port"
              class="w-full"
              :disabled="!reachable || status.running"
            />
          </UFormField>

          <UFormField label="Baud rate" class="w-full">
            <USelect
              v-model="baudRate"
              :items="baudRateItems"
              value-key="value"
              class="w-full"
              :disabled="!reachable || status.running"
            />
          </UFormField>

          <p v-if="errorMessage" class="text-sm text-error">{{ errorMessage }}</p>

          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium text-highlighted">Bridge ports</span>
            <USwitch
              size="sm"
              aria-label="Bridge ports"
              :model-value="status.running"
              :disabled="!canToggleBridge"
              :loading="starting || stopping"
              @update:model-value="onToggleBridge"
            />
          </div>
        </div>
      </div>

      <div class="flex min-h-0 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
        <div class="flex flex-col gap-0.5 border-b border-default px-4 py-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">Traffic</p>
            <UButton color="neutral" variant="ghost" size="xs" label="Clear" :disabled="packets.length === 0" @click="clearPackets" />
          </div>
          <p v-if="status.running" class="text-xs text-muted">{{ bridgeDiagnostics }}</p>
        </div>
        <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
          <p v-if="packets.length === 0" class="text-muted">{{ emptyTrafficHint }}</p>
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
