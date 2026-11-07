<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';
import { APRS_MAP_EXAMPLE_TEXT } from '~/utils/aprs-map-example';
import { aprsMapFeatures, aprsMapUnlocatedCount } from '~/utils/aprs-map';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import { aprsWeatherLines, formatAprsHeardAt } from '~/utils/aprs-display';
import { serialPortLabel } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { isSerialPortPathAvailable } from '~/utils/serial-port-reconnect';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const { snapshots, connecting, watchCard, connect, unavailable, receiveText, disconnect, clear } = useAprs();
const { radioById } = useSavedRadios();
const { configurations } = useRadio();
const route = useRoute();
const examplePackets = computed(() => import.meta.dev && route.query.fixture === 'aprs-map');
const activeTab = ref('stations');
const aprsMap = useTemplateRef('aprsMap');
const selectedCall = ref<string | undefined>();
const stationScroller = useTemplateRef<HTMLElement>('stationScroller');
const logScroller = useTemplateRef<HTMLElement>('logScroller');

if (props.cardId) {
  watchCard(props.cardId);
}

onMounted(() => {
  if (!examplePackets.value || !props.cardId) {
    return;
  }

  receiveText(props.cardId, `${APRS_MAP_EXAMPLE_TEXT}\n`);
});

const savedRadio = computed(() => radioById(props.cardId));
const profile = computed(() => {
  const config = configurations.value.find((item) => String(item.id.model) === props.model);

  return aprsReceiveProfile({ config, model: props.model, name: props.radioName ?? savedRadio.value?.name });
});

const snapshot = computed(() => (props.cardId ? snapshots.value[props.cardId] : undefined));
const isConnected = computed(() => snapshot.value?.connected === true);
const isConnecting = computed(() => (props.cardId ? connecting.value[props.cardId] === true : false));
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
  { label: 'Packet', icon: 'i-lucide-file-text', slot: 'packet' as const, value: 'packet' },
  { label: 'Raw log', icon: 'i-lucide-scroll-text', slot: 'log' as const, value: 'log' },
];
const plottedCount = computed(() => aprsMapFeatures(stations.value).features.length);
const unlocatedCount = computed(() => aprsMapUnlocatedCount(stations.value));

const connectionBadge = computed(() => {
  if (isConnected.value) {
    return { label: 'Listening', color: 'success' as const, icon: 'i-lucide-radio' };
  }

  return { label: 'Disconnected', color: 'neutral' as const, icon: 'i-lucide-plug' };
});

const statusLine = computed(() => {
  if (isConnected.value && snapshot.value?.path) {
    return `Listening on ${serialPortLabel(snapshot.value.path, readSerialPortSettings().portAliases)} at ${aprsBaud.value} baud.`;
  }

  if (!savedRadio.value) {
    return 'Save this radio under Preferences to choose an APRS port. The memory port is not used.';
  }

  if (!aprsPort.value || !portLabel.value) {
    return 'Choose an APRS serial port under Preferences → Radios. The memory port is not used.';
  }

  return `Saved APRS port ${portLabel.value} at ${aprsBaud.value} baud.`;
});

const weather = computed(() => (selected.value?.weather ? aprsWeatherLines(selected.value.weather.value) : []));

watch(stations, (rows) => {
  if (selectedCall.value && rows.some((station) => station.callsign === selectedCall.value)) {
    return;
  }

  selectedCall.value = rows[0]?.callsign;
});

async function onConnect(): Promise<void> {
  const cardId = props.cardId;
  const path = aprsPort.value;

  if (!cardId || !path) {
    return;
  }

  try {
    const present = await isSerialPortPathAvailable(path);

    if (!present) {
      unavailable(cardId, aprsPortMissingMessage(path));
      return;
    }
  } catch {
    // The port list is unavailable outside the desktop shell. Open reports that failure.
  }

  await connect(cardId, path, aprsBaud.value);
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  await disconnect(props.cardId);
}

function selectStation(callsign: string | undefined): void {
  if (!callsign) {
    return;
  }

  selectedCall.value = callsign;
  aprsMap.value?.focus(callsign);
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
    <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
      <p class="min-w-0 text-xs text-muted">
        {{ statusLine }}
        <NuxtLink v-if="!isConnected" to="/preferences?section=radios" class="text-primary underline">Edit in Preferences</NuxtLink>
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <UBadge :label="connectionBadge.label" :color="connectionBadge.color" variant="subtle" :icon="connectionBadge.icon" />
        <UButton
          v-if="!isConnected"
          color="primary"
          size="sm"
          icon="i-lucide-cable"
          label="Connect"
          :loading="isConnecting"
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

    <UAlert
      v-if="examplePackets"
      color="neutral"
      variant="subtle"
      icon="i-lucide-map"
      title="Example packets"
      description="These stations are sample monitor lines for the map layout, not a live radio. A connected TM-D710 only sends packets heard after menu 604 OUTPUT is ON."
      class="mb-2 shrink-0"
    />

    <UAlert
      v-if="snapshot?.error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="COM port"
      :description="snapshot.error"
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
            No stations yet. Connect uses the APRS port saved for this radio.
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
        <div class="mb-2 flex shrink-0 justify-end">
          <UButton
            icon="i-lucide-eraser"
            color="neutral"
            variant="outline"
            size="sm"
            label="Clear"
            :disabled="log.length === 0 && stations.length === 0"
            @click="onClear"
          />
        </div>
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
      </template>
    </UTabs>
  </div>
</template>
