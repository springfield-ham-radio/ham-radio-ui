<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import {
  aprsConnectAction,
  aprsConnectDisabledReason,
  aprsConnectLabel,
  aprsConnectionView,
  aprsDisconnectAction,
  aprsTncModeBadge,
  type AprsConnectionMode,
  type AprsTncModeInput,
} from '~/utils/aprs-connection';
import { serialEventHeadline } from '~/utils/aprs-serial-trace';
import { aprsHostFlowForConnect, browserAprsHostFlowStorage, readAprsHostFlow } from '~/utils/aprs-host-flow';
import { aprsConnectBlocked } from '~/utils/cat-memory-transfer';
import { serialPortLabel } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { isSerialPortPathAvailable } from '~/utils/serial-port-reconnect';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const monitor = useAprs();
const host = useAprsHost();
const { radioById } = useSavedRadios();
const { configurations } = useRadio();
const { requestedModes, setSelectedMode } = useAprsTncMode();
const route = useRoute();

const tncPreview = computed(() => {
  if (!import.meta.dev || route.query.fixture !== 'aprs-tnc-badge') {
    return undefined;
  }

  return typeof route.query.tnc === 'string' ? route.query.tnc : 'confirmed';
});
const kissFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-kiss-feed');

const savedRadio = computed(() => (props.cardId ? radioById(props.cardId) : undefined));
const profile = computed(() => {
  const config = configurations.value.find((item) => String(item.id.model) === props.model);
  return aprsReceiveProfile({ config, model: props.model, name: props.radioName ?? savedRadio.value?.name });
});
const snapshot = computed(() => (props.cardId ? monitor.snapshots.value[props.cardId] : undefined));
const hostSnapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const isConnected = computed(() => snapshot.value?.connected === true || tncPreview.value === 'monitor');
const kissListening = computed(() => hostSnapshot.value?.connected === true || (tncPreview.value !== undefined && tncPreview.value !== 'monitor'));
const isConnecting = computed(() => (props.cardId ? monitor.connecting.value[props.cardId] === true : false));
const hostConnecting = computed(() => (props.cardId ? host.connecting.value[props.cardId] === true : false));
const connecting = computed(() => (isConnecting.value || hostConnecting.value) && !tncPreview.value);

const selectedMode = computed<AprsConnectionMode>(() => {
  const chosen = props.cardId ? requestedModes.value[props.cardId] : undefined;

  if (chosen) {
    return chosen;
  }

  return profile.value?.host ? 'host' : 'passive';
});
const activeMode = computed<AprsConnectionMode>(() => {
  if (kissListening.value) {
    return 'host';
  }

  if (isConnected.value) {
    return 'passive';
  }

  return selectedMode.value;
});
const connection = computed(() => aprsConnectionView({
  mode: activeMode.value,
  passiveOpen: isConnected.value,
  hostOpen: kissListening.value,
  passiveConnecting: isConnecting.value && !tncPreview.value,
  hostConnecting: hostConnecting.value && !tncPreview.value,
  kissConfirmed: tncPreview.value === 'confirmed' || hostSnapshot.value?.kissConfirmed === true,
}));
const tncMode = computed(() => {
  const preview = tncPreview.value;
  const live: AprsTncModeInput = {
    open: connection.value.open,
    kissConfirmed: hostSnapshot.value?.kissConfirmed === true,
    detectPhase: hostSnapshot.value?.detectPhase,
    commandPhase: hostSnapshot.value?.commandPhase,
  };

  if (!preview) {
    return aprsTncModeBadge(live);
  }

  const shown: Record<string, AprsTncModeInput> = {
    monitor: { open: 'passive', kissConfirmed: false, detectPhase: 'idle', commandPhase: 'idle' },
    detecting: { open: 'host', kissConfirmed: false, detectPhase: 'listening', commandPhase: 'idle' },
    command: { open: 'host', kissConfirmed: false, detectPhase: 'entering', commandPhase: 'prompt' },
    waiting: { open: 'host', kissConfirmed: false, detectPhase: 'waiting-traffic', commandPhase: 'restart-sent' },
    confirmed: { open: 'host', kissConfirmed: true, detectPhase: 'waiting-traffic', commandPhase: 'restart-sent' },
    failed: { open: 'host', kissConfirmed: false, detectPhase: 'failed', commandPhase: 'timed-out' },
  };

  return aprsTncModeBadge(shown[preview] ?? shown.confirmed);
});

const aprsPort = computed(() => savedRadio.value?.aprsSerialPort);
const aprsBaud = computed(() => savedRadio.value?.aprsBaudRate ?? profile.value?.baudRate ?? 9600);
const portLabel = computed(() => (aprsPort.value ? serialPortLabel(aprsPort.value, readSerialPortSettings().portAliases) : undefined));
const portBusy = computed(() => {
  const path = aprsPort.value;
  const cardId = props.cardId;

  if (!path || !cardId) {
    return false;
  }

  const held = host.cardPorts.value[cardId] ?? monitor.cardPorts.value[cardId];
  return aprsConnectBlocked(monitor.lockedPorts.value, path, held);
});
const connectTooltip = computed(() => {
  if (connection.value.open || connecting.value) {
    return undefined;
  }

  return aprsConnectDisabledReason({
    hasRadio: Boolean(savedRadio.value),
    hasPort: Boolean(aprsPort.value),
    portBusy: portBusy.value,
    hostAvailable: Boolean(profile.value?.host),
    mode: selectedMode.value,
  });
});
const connectLabel = computed(() => aprsConnectLabel(selectedMode.value));
const modeMenu = computed<DropdownMenuItem[][]>(() => [[
  {
    label: 'Host',
    icon: selectedMode.value === 'host' ? 'i-lucide-check' : undefined,
    onSelect: () => chooseMode('host'),
  },
  {
    label: 'Monitor only',
    icon: selectedMode.value === 'passive' ? 'i-lucide-check' : undefined,
    onSelect: () => chooseMode('passive'),
  },
]]);

const statusLine = computed(() => {
  if (kissFixture.value && !kissListening.value && !isConnected.value) {
    return 'Fixture AX.25 UI frame. Not a radio, and no port was opened. This is not the CAT connection.';
  }

  const openPath = kissListening.value ? hostSnapshot.value?.path : isConnected.value ? snapshot.value?.path : undefined;
  const where = openPath ? serialPortLabel(openPath, readSerialPortSettings().portAliases) : portLabel.value;

  if (!savedRadio.value) {
    return `${connection.value.detail} Save this radio under Preferences to choose an APRS port. The memory port is not used.`;
  }

  if (!where) {
    return `${connection.value.detail} Choose an APRS serial port under Preferences. The memory port is not used.`;
  }

  const flow = activeMode.value === 'host' && profile.value?.host ? ` ${profile.value.host.flowHelp}` : '';
  const detection = kissListening.value && hostSnapshot.value?.detectDetail
    ? ` ${serialEventHeadline(hostSnapshot.value.detectDetail)}`
    : '';

  return `${connection.value.detail} ${where} at ${aprsBaud.value} baud.${flow}${detection}`;
});

if (props.cardId) {
  monitor.watchCard(props.cardId);
  host.watchCard(props.cardId);
}

function chooseMode(mode: AprsConnectionMode): void {
  if (!props.cardId || connection.value.open || connecting.value) {
    return;
  }

  setSelectedMode(props.cardId, mode);
}

async function onConnect(): Promise<void> {
  if (tncPreview.value || connectTooltip.value) {
    return;
  }

  const cardId = props.cardId;
  const path = aprsPort.value;
  const action = aprsConnectAction({
    mode: selectedMode.value,
    passiveOpen: isConnected.value,
    hostOpen: kissListening.value,
  });

  if (!cardId || !path || action.kind === 'blocked') {
    return;
  }

  try {
    const present = await isSerialPortPathAvailable(path);

    if (!present) {
      if (action.kind === 'open-host') {
        host.unavailable(cardId, aprsPortMissingMessage(path));
      } else {
        monitor.unavailable(cardId, aprsPortMissingMessage(path));
      }

      return;
    }
  } catch {
    // The port list is unavailable outside the desktop shell. Open reports that failure.
  }

  if (action.kind === 'open-host') {
    const storage = browserAprsHostFlowStorage();
    const saved = storage ? readAprsHostFlow(storage, cardId) : undefined;
    const flow = aprsHostFlowForConnect(saved, profile.value?.host?.defaultFlow);
    await host.connect(cardId, path, aprsBaud.value, flow);
    return;
  }

  await monitor.connect(cardId, path, aprsBaud.value);
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId || tncPreview.value) {
    return;
  }

  const action = aprsDisconnectAction({ passiveOpen: isConnected.value, hostOpen: kissListening.value });

  if (action.kind === 'close-passive' || action.kind === 'close-both') {
    await monitor.disconnect(props.cardId);
  }

  if (action.kind === 'close-host' || action.kind === 'close-both') {
    await host.disconnect(props.cardId);
  }
}

function onRetryDetection(): void {
  if (!props.cardId || tncPreview.value) {
    return;
  }

  host.retryDetection(props.cardId);
}
</script>

<template>
  <div class="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2">
    <p class="min-w-0 flex-1 pb-1.5 text-xs text-muted">
      {{ statusLine }}
      <NuxtLink v-if="!connection.open" to="/preferences?section=radios" class="text-primary underline">Edit in Preferences</NuxtLink>
    </p>
    <div class="flex flex-wrap items-center gap-1.5">
      <UBadge
        :label="connection.badge"
        :color="connection.badge === 'Connected' ? 'success' : 'neutral'"
        variant="subtle"
        :icon="connection.badge === 'Connected' ? 'i-lucide-plug-zap' : 'i-lucide-plug'"
      />
      <UTooltip v-if="tncMode.visible" :text="tncMode.tooltip">
        <UBadge
          :label="tncMode.label"
          :color="tncMode.color"
          variant="subtle"
          :aria-label="`TNC mode: ${tncMode.label}. ${tncMode.tooltip}`"
        />
      </UTooltip>
      <UFieldGroup v-if="!connection.open" size="sm">
        <UTooltip :text="connectTooltip ?? ''" :disabled="!connectTooltip">
          <span class="inline-flex">
            <UButton
              color="primary"
              icon="i-lucide-cable"
              :label="connectLabel"
              :loading="connecting"
              :disabled="Boolean(connectTooltip)"
              @click="onConnect"
            />
          </span>
        </UTooltip>
        <UDropdownMenu :items="modeMenu" :content="{ align: 'end' }" :disabled="connecting">
          <UButton
            color="primary"
            icon="i-lucide-chevron-down"
            aria-label="Choose connection mode"
            :disabled="connecting"
          />
        </UDropdownMenu>
      </UFieldGroup>
      <template v-else>
        <UButton
          v-if="kissListening"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-search"
          label="Retry detection"
          :disabled="hostSnapshot?.detectPhase === 'listening' || hostSnapshot?.detectPhase === 'awaiting-prompt' || hostSnapshot?.detectPhase === 'entering'"
          @click="onRetryDetection"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-unplug"
          label="Disconnect"
          @click="onDisconnect"
        />
      </template>
    </div>
  </div>
</template>
