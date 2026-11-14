<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';
import { APRS_PANEL_TABS } from '~/utils/aprs-panels';
import { canonicalAx25Call, encodeAx25Ui, formatAx25Call } from '~/utils/aprs-ax25';
import { APRS_MAP_EXAMPLE_TEXT } from '~/utils/aprs-map-example';
import { aprsMapFeatures, aprsMapUnlocatedCount } from '~/utils/aprs-map';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { aprsWeatherLines, formatAprsHeardAt } from '~/utils/aprs-display';
import type { AprsConnectionMode } from '~/utils/aprs-connection';
import { APRS_HOST_TRACE_FIXTURE, formatTrace, serialEventHeadline, serialTranscript } from '~/utils/aprs-serial-trace';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';
import { browserAprsHostFlowStorage, readAprsHostFlow, writeAprsHostFlow } from '~/utils/aprs-host-flow';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const { snapshots, watchCard, receiveText, ingestAx25Ui, clear } = useAprs();
const host = useAprsHost();
const { requestedModes } = useAprsTncMode();
const { radioById } = useSavedRadios();
const { configurations } = useRadio();
const route = useRoute();
const examplePackets = computed(() => import.meta.dev && route.query.fixture === 'aprs-map');
const kissFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-kiss-feed');
const traceFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-host-trace');
const tncPreview = computed(() => {
  if (!import.meta.dev || route.query.fixture !== 'aprs-tnc-badge') {
    return undefined;
  }

  return typeof route.query.tnc === 'string' ? route.query.tnc : 'confirmed';
});
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
const transcript = computed(() => serialTranscript(traceLines.value));
const showTraceHex = ref(false);
const isConnected = computed(() => snapshot.value?.connected === true || tncPreview.value === 'monitor');
const kissListening = computed(() => hostSnapshot.value?.connected === true || (tncPreview.value !== undefined && tncPreview.value !== 'monitor'));
const mine = ref('');
const mineError = ref<string | undefined>();
const savedHostFlow = props.cardId ? readAprsHostFlow(browserAprsHostFlowStorage() ?? { getItem: () => null, setItem() { return undefined; } }, props.cardId) : undefined;
const requestedFlow = ref<AprsHostFlowControl>(savedHostFlow ?? 'software');
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
const portOpen = computed(() => kissListening.value || isConnected.value);
const activeFlow = computed(() => (kissListening.value ? (hostSnapshot.value?.hostFlow ?? requestedFlow.value) : requestedFlow.value));
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
const stationCount = computed(() => stations.value.length);
const logCount = computed(() => log.value.length);
const { virtualRows: stationRows, paddingTop: stationPadTop, paddingBottom: stationPadBottom } = useFixedVirtualRows(
  stationCount,
  stationScroller,
  56,
);
const { virtualRows: logRows, paddingTop: logPadTop, paddingBottom: logPadBottom } = useFixedVirtualRows(logCount, logScroller, 24);

const tabs: TabsItem[] = APRS_PANEL_TABS.map((tab) => ({ ...tab }));
const plottedCount = computed(() => aprsMapFeatures(stations.value).features.length);
const unlocatedCount = computed(() => aprsMapUnlocatedCount(stations.value));

const detectFailure = computed(() => {
  const detail = hostSnapshot.value?.detectDetail ?? '';
  const setup = profile.value?.host?.setup ?? [];
  const recovery = profile.value?.host?.recovery ?? [];
  return [detail, ...setup, ...recovery].filter((line) => line.length > 0).join(' ');
});
const failureHeadline = computed(() => serialEventHeadline(hostSnapshot.value?.detectDetail ?? 'The TNC is not answering'));
const traceCounters = computed(() => {
  const snap = hostSnapshot.value;

  if (!snap) {
    return '';
  }

  const dropped = snap.traceDropped > 0 ? ` · dropped ${snap.traceDropped}` : '';

  return `RX ${snap.rxBytes} B in ${snap.rxChunks} · text ${snap.commandTextBytes} · KISS ${snap.frames} · written ${snap.bytesWritten} · held ${snap.incompleteBytes} · invalid ${snap.invalidBytes}${dropped}`;
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

  const live = kissListening.value ? '' : ' Each connection starts off, and the choice is not saved.';

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

watch(kissListening, (open) => {
  if (open && props.cardId && mine.value) {
    mineError.value = host.setIdentity(props.cardId, mine.value);
  }
});

function onFlow(value: unknown): void {
  if (portOpen.value) {
    return;
  }

  if (value === 'software' || value === 'none' || value === 'hardware') {
    requestedFlow.value = value;

    const storage = browserAprsHostFlowStorage();

    if (props.cardId && storage) {
      writeAprsHostFlow(storage, props.cardId, value);
    }
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
    <AprsConnectionBar :card-id="cardId" :model="model" :radio-name="radioName" />
    <div v-if="activeMode === 'host' && profile?.host" class="mb-2 flex shrink-0 flex-wrap items-end gap-2">
      <UFormField label="Flow control" class="w-52">
        <USelect
          :model-value="activeFlow"
          :items="flowItems"
          value-key="value"
          class="w-full"
          :disabled="portOpen"
          @update:model-value="onFlow"
        />
      </UFormField>
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
      v-if="tncPreview"
      color="neutral"
      variant="subtle"
      icon="i-lucide-tags"
      title="Fixture TNC mode"
      description="The mode pill is sample detection state. No port was opened and nothing was written."
      class="mb-2 shrink-0"
    />

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
      v-if="hostSnapshot?.detectPhase === 'failed'"
      color="warning"
      variant="subtle"
      icon="i-lucide-radio"
      :title="failureHeadline"
      class="mb-2 shrink-0"
    >
      <template #description>
        <UCollapsible :unmount-on-hide="false">
          <UButton color="neutral" variant="ghost" size="xs" label="Details" trailing-icon="i-lucide-chevron-down" />
          <template #content>
            <p class="mt-2 text-sm whitespace-pre-wrap">{{ detectFailure }}</p>
          </template>
        </UCollapsible>
      </template>
    </UAlert>

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
        <div class="@container flex min-h-0 flex-1 flex-col overflow-hidden py-2">
          <div class="flex min-h-0 flex-1 flex-col @min-[42rem]:flex-row">
            <div ref="stationScroller" class="max-h-72 min-h-0 shrink-0 overflow-auto border-b border-default @min-[42rem]:max-h-none @min-[42rem]:w-80 @min-[42rem]:self-stretch @min-[42rem]:border-r @min-[42rem]:border-b-0">
              <p v-if="stations.length === 0" class="px-1 py-6 text-sm text-muted">
                No stations yet. Connect opens the APRS COM port above. This list is what arrived this session.
              </p>
              <div v-else :style="{ paddingTop: `${stationPadTop}px`, paddingBottom: `${stationPadBottom}px` }">
                <button
                  v-for="row in stationRows"
                  :key="stations[row.index]?.callsign ?? row.key"
                  type="button"
                  class="flex h-14 w-full flex-col justify-center gap-0.5 border-b border-default px-2 text-left"
                  :class="selected?.callsign === stations[row.index]?.callsign ? 'bg-elevated' : ''"
                  :aria-current="selected?.callsign === stations[row.index]?.callsign ? 'true' : undefined"
                  @click="selectStation(stations[row.index]?.callsign)"
                >
                  <template v-if="stations[row.index]">
                    <span class="flex items-baseline justify-between gap-2">
                      <span class="truncate font-mono text-sm text-highlighted">{{ stations[row.index]!.callsign }}</span>
                      <span class="shrink-0 text-xs text-muted">{{ formatAprsHeardAt(stations[row.index]!.lastHeardAt) }}</span>
                    </span>
                    <span class="truncate text-xs text-muted">
                      {{ stations[row.index]!.position?.value.label ?? 'No position in the packets decoded so far' }}
                    </span>
                  </template>
                </button>
              </div>
            </div>
            <div class="min-h-0 flex-1 overflow-auto px-1 py-3 @min-[42rem]:px-4">
              <h3 class="mb-3 text-sm font-medium text-highlighted">Station details</h3>
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
        <AprsMessages :card-id="cardId" :mine="mine" />
      </template>

      <template #log>
        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-2">
        <section class="flex min-h-48 min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-medium text-highlighted">Serial reply</h3>
            <div class="flex items-center gap-1.5">
              <UButton size="xs" color="neutral" variant="outline" :label="showTraceHex ? 'Hide hex' : 'Show hex'" @click="showTraceHex = !showTraceHex" />
              <UButton size="xs" color="neutral" variant="outline" label="Copy" :disabled="traceText.length === 0" @click="onCopyTrace" />
              <UButton size="xs" color="neutral" variant="outline" label="Clear serial reply" :disabled="!cardId || traceFixture || traceLines.length === 0" @click="onClearTrace" />
            </div>
          </div>
          <p class="text-xs text-muted">
            <template v-if="kissListening">Host session. {{ traceCounters }}</template>
            <template v-else-if="isConnected">Passive monitor. The byte log fills on a host session.</template>
            <template v-else>No Listen is open. ← radio, → HamBench. Copy includes hex. Clear keeps the counters and does not write.</template>
          </p>
          <div class="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5">
            <p v-if="transcript.length === 0" class="text-muted">No serial bytes yet.</p>
            <div v-for="row in transcript" :key="row.key" class="py-0.5" :class="row.echo ? 'opacity-60' : ''">
              <div class="flex gap-2">
                <span class="w-16 shrink-0 text-muted">{{ row.time }}</span>
                <span class="w-4 shrink-0 text-muted" :title="row.who === 'radio' ? 'radio' : row.who === 'HamBench' ? 'HamBench' : 'note'">{{ row.arrow }}</span>
                <span class="min-w-0 whitespace-pre-wrap break-all" :class="row.echo ? 'text-muted' : 'text-highlighted'">{{ row.text }}</span>
                <span v-if="row.echo" class="shrink-0 text-muted">echo</span>
              </div>
              <p v-if="showTraceHex && row.hex" class="ps-20 break-all text-muted">{{ row.hex }}</p>
              <UCollapsible v-if="row.detail" :unmount-on-hide="false" class="ps-20">
                <UButton color="neutral" variant="link" size="xs" label="Details" trailing-icon="i-lucide-chevron-down" class="px-0" />
                <template #content>
                  <p class="pb-1 whitespace-pre-wrap text-muted">{{ row.detail }}</p>
                </template>
              </UCollapsible>
            </div>
          </div>
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
        <div ref="logScroller" class="max-h-36 shrink-0 overflow-auto font-mono text-xs leading-6">
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
