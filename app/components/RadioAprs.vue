<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';
import { canonicalAx25Call, encodeAx25Ui, formatAx25Call } from '~/utils/aprs-ax25';
import { APRS_MAP_EXAMPLE_TEXT } from '~/utils/aprs-map-example';
import { aprsMapFeatures, aprsMapUnlocatedCount } from '~/utils/aprs-map';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import { aprsWeatherLines, formatAprsHeardAt } from '~/utils/aprs-display';
import { aprsConnectAction, aprsConnectionView, aprsDisconnectAction, type AprsConnectionMode } from '~/utils/aprs-connection';
import { APRS_HOST_TRACE_FIXTURE, formatTrace } from '~/utils/aprs-serial-trace';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';
import { serialPortLabel } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { isSerialPortPathAvailable } from '~/utils/serial-port-reconnect';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const { snapshots, connecting, watchCard, connect, unavailable, receiveText, ingestAx25Ui, disconnect, clear } = useAprs();
const host = useAprsHost();
const { radioById } = useSavedRadios();
const { configurations } = useRadio();
const route = useRoute();
const examplePackets = computed(() => import.meta.dev && route.query.fixture === 'aprs-map');
const kissFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-kiss-feed');
const traceFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-host-trace');
const activeTab = ref('stations');
const aprsMap = useTemplateRef('aprsMap');
const selectedCall = ref<string | undefined>();
const stationScroller = useTemplateRef<HTMLElement>('stationScroller');
const logScroller = useTemplateRef<HTMLElement>('logScroller');

if (props.cardId) {
  watchCard(props.cardId);
  host.watchCard(props.cardId);
}

onMounted(() => {
  if (examplePackets.value && props.cardId) {
    receiveText(props.cardId, `${APRS_MAP_EXAMPLE_TEXT}\n`);
  }

  if (!kissFixture.value || !props.cardId) {
    return;
  }

  const source = canonicalAx25Call('K5KTF-4');
  const via = canonicalAx25Call('WIDE1-1');
  const frame = source && via ? encodeAx25Ui(source, '!3031.12NI09752.74W&K5KTF TX/RX-iGate', [via]) : undefined;

  if (frame) {
    ingestAx25Ui(props.cardId, frame);
  }
});

const savedRadio = computed(() => radioById(props.cardId));
const profile = computed(() => {
  const config = configurations.value.find((item) => String(item.id.model) === props.model);

  return aprsReceiveProfile({ config, model: props.model, name: props.radioName ?? savedRadio.value?.name });
});

const snapshot = computed(() => (props.cardId ? snapshots.value[props.cardId] : undefined));
const hostSnapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const traceLines = computed(() => (traceFixture.value ? APRS_HOST_TRACE_FIXTURE : (hostSnapshot.value?.trace ?? [])));
const traceText = computed(() => formatTrace(traceLines.value));
const isConnected = computed(() => snapshot.value?.connected === true);
const kissListening = computed(() => hostSnapshot.value?.connected === true);
const isConnecting = computed(() => (props.cardId ? connecting.value[props.cardId] === true : false));
const hostConnecting = computed(() => (props.cardId ? host.connecting.value[props.cardId] === true : false));
const mine = ref('');
const mineError = ref<string | undefined>();
const requestedMode = ref<AprsConnectionMode>('passive');
const requestedFlow = ref<AprsHostFlowControl>('software');
const activeMode = computed<AprsConnectionMode>(() => {
  if (kissListening.value) {
    return 'host';
  }

  if (isConnected.value) {
    return 'passive';
  }

  return profile.value?.host ? requestedMode.value : 'passive';
});
const activeFlow = computed(() => (kissListening.value ? (hostSnapshot.value?.hostFlow ?? requestedFlow.value) : requestedFlow.value));
const connection = computed(() =>
  aprsConnectionView({
    mode: activeMode.value,
    passiveOpen: isConnected.value,
    hostOpen: kissListening.value,
    passiveConnecting: isConnecting.value,
    hostConnecting: hostConnecting.value,
    kissConfirmed: hostSnapshot.value?.kissConfirmed === true,
  }),
);
const modeItems = computed(() => {
  const items: Array<{ label: string; value: AprsConnectionMode }> = [{ label: 'Passive monitor', value: 'passive' }];

  if (profile.value?.host) {
    items.push({ label: 'Host session', value: 'host' });
  }

  return items;
});
const flowLabels: Record<AprsHostFlowControl, string> = {
  software: 'Software (XON/XOFF)',
  none: 'Off',
  hardware: 'Hardware (RTS/CTS)',
};
const flowItems = computed(() => {
  const flows = profile.value?.host?.flows ?? [];

  return flows.map((value) => ({ label: flowLabels[value], value }));
});
const stations = computed(() => snapshot.value?.stations ?? []);
const log = computed(() => snapshot.value?.log ?? []);
const selected = computed(() => stations.value.find((station) => station.callsign === selectedCall.value) ?? stations.value[0]);
const aprsPort = computed(() => savedRadio.value?.aprsSerialPort);
const aprsBaud = computed(() => savedRadio.value?.aprsBaudRate ?? profile.value?.baudRate ?? 9600);
const portLabel = computed(() =>
  aprsPort.value ? serialPortLabel(aprsPort.value, readSerialPortSettings().portAliases) : undefined,
);
const stationCount = computed(() => stations.value.length);
const logCount = computed(() => log.value.length);
const { virtualRows: stationRows, paddingTop: stationPadTop, paddingBottom: stationPadBottom } = useFixedVirtualRows(
  stationCount,
  stationScroller,
  44,
);
const { virtualRows: logRows, paddingTop: logPadTop, paddingBottom: logPadBottom } = useFixedVirtualRows(logCount, logScroller, 24);

const tabs: TabsItem[] = [
  { label: 'Stations', icon: 'i-lucide-list', slot: 'stations' as const, value: 'stations' },
  { label: 'Map', icon: 'i-lucide-map', slot: 'map' as const, value: 'map' },
  { label: 'Messages', icon: 'i-lucide-message-square', slot: 'messages' as const, value: 'messages' },
  { label: 'Station details', icon: 'i-lucide-file-text', slot: 'packet' as const, value: 'packet' },
  { label: 'Raw log', icon: 'i-lucide-scroll-text', slot: 'log' as const, value: 'log' },
];
const plottedCount = computed(() => aprsMapFeatures(stations.value).features.length);
const unlocatedCount = computed(() => aprsMapUnlocatedCount(stations.value));

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

  return `${connection.value.detail} ${where} at ${aprsBaud.value} baud.${flow}`;
});

const weather = computed(() => (selected.value?.weather ? aprsWeatherLines(selected.value.weather.value) : []));

watch(
  () => [props.cardId, profile.value?.host?.link] as const,
  () => {
    if (!props.cardId) {
      return;
    }

    host.setHostLink(props.cardId, profile.value?.host?.link);
    const flows = profile.value?.host?.flows;

    if (flows && !kissListening.value && !flows.includes(requestedFlow.value)) {
      requestedFlow.value = profile.value?.host?.defaultFlow ?? 'software';
    }
  },
  { immediate: true },
);

watch(stations, (rows) => {
  if (selectedCall.value && rows.some((station) => station.callsign === selectedCall.value)) {
    return;
  }

  selectedCall.value = rows[0]?.callsign;
});

const ackCall = computed(() => {
  const call = canonicalAx25Call(mine.value);

  return call ? formatAx25Call(call) : undefined;
});
const ackDetail = computed(() => {
  if (!ackCall.value) {
    return 'Off. Set My callsign first. Nothing is acknowledged, and this is not a read receipt.';
  }

  const live = connection.value.open === 'host' ? '' : ' Each connection starts off, and the choice is not saved.';

  return hostSnapshot.value?.ackOptIn
    ? `On for ${ackCall.value}. A later message addressed to that callsign is answered. Messages already heard are left alone. This is not a read receipt.${live}`
    : `Off for ${ackCall.value}. Turn it on to answer a later message addressed to that callsign. This is not a read receipt.${live}`;
});

function onMine(value: string | number): void {
  mine.value = String(value);

  if (!props.cardId) {
    return;
  }

  mineError.value = host.setIdentity(props.cardId, value);
}

function onAck(next: boolean): void {
  if (!props.cardId) {
    return;
  }

  host.setAckOptIn(props.cardId, Boolean(next));
}

watch(
  () => connection.value.open,
  (open) => {
    if (open === 'host' && props.cardId && mine.value) {
      mineError.value = host.setIdentity(props.cardId, mine.value);
    }
  },
);

function onMode(value: unknown): void {
  if (connection.value.open) {
    return;
  }

  if (value === 'passive' || value === 'host') {
    requestedMode.value = value;
  }
}

function onFlow(value: unknown): void {
  if (connection.value.open) {
    return;
  }

  if (value === 'software' || value === 'none' || value === 'hardware') {
    requestedFlow.value = value;
  }
}

async function onConnect(): Promise<void> {
  const cardId = props.cardId;
  const path = aprsPort.value;
  const action = aprsConnectAction({
    mode: activeMode.value,
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
        unavailable(cardId, aprsPortMissingMessage(path));
      }

      return;
    }
  } catch {
    // The port list is unavailable outside the desktop shell. Open reports that failure.
  }

  if (action.kind === 'open-host') {
    await host.connect(cardId, path, aprsBaud.value, activeFlow.value);
    return;
  }

  await connect(cardId, path, aprsBaud.value);
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  const action = aprsDisconnectAction({ passiveOpen: isConnected.value, hostOpen: kissListening.value });

  if (action.kind === 'close-passive' || action.kind === 'close-both') {
    await disconnect(props.cardId);
  }

  if (action.kind === 'close-host' || action.kind === 'close-both') {
    await host.disconnect(props.cardId);
  }
}

function selectStation(callsign: string | undefined): void {
  if (!callsign) {
    return;
  }

  selectedCall.value = callsign;
  aprsMap.value?.focus(callsign);
}

async function onCopyTrace(): Promise<void> {
  const body = traceText.value;

  if (!body || !import.meta.client) {
    return;
  }

  await navigator.clipboard.writeText(body);
}

function onClearTrace(): void {
  if (!props.cardId || traceFixture.value) {
    return;
  }

  host.clearTrace(props.cardId);
}

function onClear(): void {
  if (!props.cardId) {
    return;
  }

  clear(props.cardId);
  selectedCall.value = undefined;
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <div class="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2">
      <div class="flex min-w-0 flex-1 flex-wrap items-end gap-2">
        <UFormField label="APRS COM" class="w-44">
          <USelect
            :model-value="activeMode"
            :items="modeItems"
            value-key="value"
            class="w-full"
            :disabled="Boolean(connection.open)"
            @update:model-value="onMode"
          />
        </UFormField>
        <UFormField v-if="activeMode === 'host'" label="Flow control" class="w-52">
          <USelect
            :model-value="activeFlow"
            :items="flowItems"
            value-key="value"
            class="w-full"
            :disabled="Boolean(connection.open)"
            @update:model-value="onFlow"
          />
        </UFormField>
        <p class="min-w-0 flex-1 pb-1.5 text-xs text-muted">
          {{ statusLine }}
          <NuxtLink v-if="!connection.open" to="/preferences?section=radios" class="text-primary underline">Edit in Preferences</NuxtLink>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge
          :label="connection.badge"
          :color="connection.badge === 'Connected' ? 'success' : 'neutral'"
          variant="subtle"
          :icon="connection.badge === 'Connected' ? 'i-lucide-plug-zap' : 'i-lucide-plug'"
        />
        <UButton
          v-if="!connection.open"
          color="primary"
          size="sm"
          icon="i-lucide-cable"
          label="Connect"
          :loading="isConnecting || hostConnecting"
          :disabled="!cardId || !aprsPort"
          @click="onConnect"
        />
        <UButton
          v-else
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-unplug"
          label="Disconnect"
          @click="onDisconnect"
        />
      </div>
    </div>

    <div v-if="activeMode === 'host'" class="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
      <UFormField label="My callsign" :error="mineError" class="w-40">
        <UInput :model-value="mine" class="w-full" placeholder="N0CALL" autocapitalize="characters" @update:model-value="onMine" />
      </UFormField>
      <USwitch
        :model-value="hostSnapshot?.ackOptIn === true"
        label="Automatically acknowledge messages addressed to my callsign"
        :description="ackDetail"
        @update:model-value="onAck"
      />
    </div>

    <UAlert
      v-if="examplePackets"
      color="neutral"
      variant="subtle"
      icon="i-lucide-map"
      title="Example packets"
      :description="`These stations are sample monitor lines for the map layout, not a live radio. ${profile?.monitorNote ?? ''}`"
      class="mb-2 shrink-0"
    />

    <UAlert
      v-if="snapshot?.error || hostSnapshot?.error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="APRS COM"
      :description="hostSnapshot?.error ?? snapshot?.error"
      class="mb-2 shrink-0"
    />

    <UTabs
      v-model="activeTab"
      color="primary"
      variant="link"
      :items="tabs"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      :ui="{
        list: 'w-full shrink-0 items-center gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none',
      }"
    >
      <template #stations>
        <div ref="stationScroller" class="min-h-0 flex-1 overflow-auto">
          <p v-if="stations.length === 0" class="px-1 py-6 text-sm text-muted">
            No stations yet. Connect opens the APRS COM port above. This list is what arrived this session.
          </p>
          <div v-else :style="{ paddingTop: `${stationPadTop}px`, paddingBottom: `${stationPadBottom}px` }">
            <button
              v-for="row in stationRows"
              :key="stations[row.index]?.callsign ?? row.key"
              type="button"
              class="flex h-11 w-full items-center gap-3 border-b border-default px-2 text-left"
              :class="selected?.callsign === stations[row.index]?.callsign ? 'bg-elevated' : ''"
              @click="selectStation(stations[row.index]?.callsign)"
            >
              <template v-if="stations[row.index]">
                <span class="w-28 shrink-0 font-mono text-sm text-highlighted">{{ stations[row.index]!.callsign }}</span>
                <span class="min-w-0 flex-1 truncate text-sm">
                  {{ stations[row.index]!.position?.value.label ?? 'No position in the packets decoded so far' }}
                </span>
                <span class="shrink-0 text-xs text-muted">{{ formatAprsHeardAt(stations[row.index]!.lastHeardAt) }}</span>
              </template>
            </button>
          </div>
        </div>
      </template>

      <template #map>
        <div class="flex min-h-0 flex-1 flex-col gap-2 py-2">
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 text-xs text-muted">
              {{ plottedCount }} on the map
              <template v-if="unlocatedCount > 0"> · {{ unlocatedCount }} without a position</template>
              . Heard this session only. The radio does not export its stored station list.
            </p>
            <UButton
              icon="i-lucide-locate"
              color="neutral"
              variant="outline"
              size="sm"
              label="Fit stations"
              :disabled="plottedCount === 0"
              @click="aprsMap?.fit()"
            />
          </div>
          <AprsMap
            v-if="activeTab === 'map'"
            ref="aprsMap"
            class="min-h-64 flex-1"
            :stations="stations"
            :selected-call="selected?.callsign"
            @select="selectStation"
          />
          <p v-if="plottedCount === 0" class="shrink-0 text-sm text-muted">
            No decoded positions yet. Stations without a position stay in the list.
          </p>
        </div>
      </template>

      <template #messages>
        <AprsMessages :card-id="cardId" :mine="mine" :host-setup="profile?.host?.setup" :host-recovery="profile?.host?.recovery" />
      </template>

      <template #packet>
        <div class="min-h-0 flex-1 overflow-auto py-3">
          <p v-if="!selected" class="text-sm text-muted">Select a station after a packet is decoded.</p>
          <dl v-else class="grid max-w-3xl grid-cols-[10rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt class="text-muted">Callsign</dt>
            <dd class="font-mono text-highlighted">{{ selected.callsign }}</dd>
            <dt class="text-muted">Last heard</dt>
            <dd>{{ formatAprsHeardAt(selected.lastHeardAt) }}</dd>
            <dt class="text-muted">Packets</dt>
            <dd>{{ selected.packetCount }}</dd>
            <template v-if="selected.position">
              <dt class="text-muted">Position</dt>
              <dd>
                {{ selected.position.value.label }}
                <span class="text-muted">· {{ formatAprsHeardAt(selected.position.heardAt) }}</span>
              </dd>
            </template>
            <template v-if="selected.courseDegrees">
              <dt class="text-muted">Course</dt>
              <dd>{{ selected.courseDegrees.value }}° · {{ formatAprsHeardAt(selected.courseDegrees.heardAt) }}</dd>
            </template>
            <template v-if="selected.speedKnots">
              <dt class="text-muted">Speed</dt>
              <dd>{{ selected.speedKnots.value.toFixed(0) }} kn · {{ formatAprsHeardAt(selected.speedKnots.heardAt) }}</dd>
            </template>
            <template v-if="selected.altitude">
              <dt class="text-muted">Altitude</dt>
              <dd>{{ selected.altitude.value }} · {{ formatAprsHeardAt(selected.altitude.heardAt) }}</dd>
            </template>
            <template v-if="selected.positionComment">
              <dt class="text-muted">Position comment</dt>
              <dd>{{ selected.positionComment.value }}</dd>
            </template>
            <template v-if="selected.comment">
              <dt class="text-muted">Comment</dt>
              <dd class="whitespace-pre-wrap">{{ selected.comment.value }}</dd>
            </template>
            <template v-if="selected.message">
              <dt class="text-muted">Message</dt>
              <dd>
                <span class="font-mono">{{ selected.message.value.addressee }}</span>
                · {{ selected.message.value.kind }} · {{ selected.message.value.text }}
                <span class="text-muted">· {{ formatAprsHeardAt(selected.message.heardAt) }}</span>
              </dd>
            </template>
            <template v-if="selected.statusText">
              <dt class="text-muted">Status</dt>
              <dd>{{ selected.statusText.value }}</dd>
            </template>
            <template v-if="weather.length > 0 && selected.weather">
              <dt class="text-muted">Weather</dt>
              <dd>
                <p v-for="line in weather" :key="line">{{ line }}</p>
                <p class="text-muted">{{ formatAprsHeardAt(selected.weather.heardAt) }}</p>
              </dd>
            </template>
            <template v-if="selected.reportedName">
              <dt class="text-muted">Reported object</dt>
              <dd>
                {{ selected.reportedName.value }}
                <template v-if="selected.reportedPosition"> · {{ selected.reportedPosition.value.label }}</template>
              </dd>
            </template>
            <template v-if="selected.lastPacket.packetTime">
              <dt class="text-muted">Packet time</dt>
              <dd>{{ selected.lastPacket.packetTime }}</dd>
            </template>
            <template v-if="selected.lastPacket.unsupportedReason">
              <dt class="text-muted">Not decoded</dt>
              <dd>{{ selected.lastPacket.unsupportedReason }}</dd>
            </template>
            <dt class="text-muted">Latest raw</dt>
            <dd class="font-mono text-xs break-all">{{ selected.lastPacket.raw }}</dd>
          </dl>
        </div>
      </template>

      <template #log>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-2">
        <section class="flex max-h-[45%] min-h-36 shrink-0 flex-col gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-highlighted">Serial reply</h3>
            <div class="flex items-center gap-1.5">
              <UButton size="xs" color="neutral" variant="outline" label="Copy" :disabled="traceText.length === 0" @click="onCopyTrace" />
              <UButton size="xs" color="neutral" variant="outline" label="Clear serial reply" :disabled="!cardId || traceFixture || traceLines.length === 0" @click="onClearTrace" />
            </div>
          </div>
          <p class="text-xs text-muted">
            <template v-if="kissListening">
              Host session. RX {{ hostSnapshot?.rxBytes ?? 0 }} bytes in {{ hostSnapshot?.rxChunks ?? 0 }} chunks.
              Command text {{ hostSnapshot?.commandTextBytes ?? 0 }}. Incomplete {{ hostSnapshot?.incompleteBytes ?? 0 }}.
              Invalid {{ hostSnapshot?.invalidBytes ?? 0 }}. KISS frames {{ hostSnapshot?.frames ?? 0 }}.
              Bytes written {{ hostSnapshot?.bytesWritten ?? 0 }}.
            </template>
            <template v-else-if="isConnected">Passive monitor. The byte log fills on a host session. {{ profile?.monitorNote }}</template>
            <template v-else>No Listen is open. Decoded lines below are from this page. Neither log writes to the radio.</template>
            <template v-if="(hostSnapshot?.traceDropped ?? 0) > 0"> Oldest serial lines dropped: {{ hostSnapshot?.traceDropped }}. The counters still include them.</template>
          </p>
          <p class="text-xs text-muted">{{ hostSnapshot?.commandDetail ?? 'No command requested.' }} Clear serial reply removes these lines and keeps the counters. It does not disconnect or write.</p>
          <pre class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap font-mono text-xs text-highlighted">{{ traceText || 'No serial bytes yet.' }}</pre>
        </section>
        <div class="flex shrink-0 items-center justify-between gap-2">
          <h3 class="text-sm font-medium text-highlighted">Decoded lines</h3>
          <UButton
            icon="i-lucide-eraser"
            color="neutral"
            variant="outline"
            size="sm"
            label="Clear decoded lines"
            :disabled="log.length === 0 && stations.length === 0"
            @click="onClear"
          />
        </div>
        <p class="shrink-0 text-xs text-muted">Passive text and KISS UI frames land here. Clear decoded lines also clears the station list. It does not write.</p>
        <div ref="logScroller" class="min-h-0 flex-1 overflow-auto font-mono text-xs leading-6">
          <p v-if="log.length === 0" class="py-3 text-muted">Raw lines stay here even when the packet is malformed or not decoded.</p>
          <div v-else :style="{ paddingTop: `${logPadTop}px`, paddingBottom: `${logPadBottom}px` }">
            <div v-for="row in logRows" :key="log[row.index]?.id ?? row.key" class="flex h-6 gap-3 whitespace-nowrap">
              <template v-if="log[row.index]">
                <span class="text-muted">{{ formatAprsHeardAt(log[row.index]!.receivedAt) }}</span>
                <span class="w-24 shrink-0 uppercase text-muted">{{ log[row.index]!.disposition }}</span>
                <span class="text-highlighted">{{ log[row.index]!.text }}</span>
                <span v-if="log[row.index]!.note" class="text-muted">{{ log[row.index]!.note }}</span>
              </template>
            </div>
          </div>
        </div>
        </div>
      </template>
    </UTabs>
  </div>
</template>
