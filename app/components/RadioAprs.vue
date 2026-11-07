<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { useFixedVirtualRows } from '~/composables/useFixedVirtualRows';
import {
  APRS_COM_BAUD_RATES,
  d710AprsFamily,
  d710AprsMenus,
  isAprsComBaudRate,
  readAprsComBaud,
  readAprsComPort,
  writeAprsComBaud,
  writeAprsComPort,
  type AprsComBaudRate,
} from '~/utils/aprs-d710';
import { aprsWeatherLines, formatAprsHeardAt } from '~/utils/aprs-display';
import type { RadioDialogMessageAlert } from '~/utils/radio-dialog-message';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const { snapshots, connecting, lockedPorts, watchCard, connect, disconnect, clear } = useAprs();
const family = computed(() => d710AprsFamily(props.model, props.radioName) ?? 'unconfirmed');
const menus = computed(() => d710AprsMenus(family.value));
const baudRate = ref<AprsComBaudRate>(9600);
const portOpen = ref(false);
const activeTab = ref('stations');
const selectedCall = ref<string | undefined>();
const stationScroller = useTemplateRef<HTMLElement>('stationScroller');
const logScroller = useTemplateRef<HTMLElement>('logScroller');

if (props.cardId) {
  watchCard(props.cardId);
}

onMounted(() => {
  if (!props.cardId || typeof localStorage === 'undefined') {
    return;
  }

  baudRate.value = readAprsComBaud(localStorage, props.cardId);
  rememberedPort.value = readAprsComPort(localStorage, props.cardId);
});

const snapshot = computed(() => (props.cardId ? snapshots.value[props.cardId] : undefined));
const isConnected = computed(() => snapshot.value?.connected === true);
const isConnecting = computed(() => (props.cardId ? connecting.value[props.cardId] === true : false));
const stations = computed(() => snapshot.value?.stations ?? []);
const log = computed(() => snapshot.value?.log ?? []);
const selected = computed(() => stations.value.find((station) => station.callsign === selectedCall.value) ?? stations.value[0]);
const rememberedPort = ref<string | undefined>();

const baudItems = APRS_COM_BAUD_RATES.map((rate) => ({ label: `${rate} baud`, value: rate }));
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
  { label: 'Packet', icon: 'i-lucide-file-text', slot: 'packet' as const, value: 'packet' },
  { label: 'Raw log', icon: 'i-lucide-scroll-text', slot: 'log' as const, value: 'log' },
];

const connectionBadge = computed(() => {
  if (isConnected.value) {
    return { label: 'Listening', color: 'success' as const, icon: 'i-lucide-radio' };
  }

  return { label: 'Disconnected', color: 'neutral' as const, icon: 'i-lucide-plug' };
});

const setupAlert = computed<RadioDialogMessageAlert>(() => ({
  title: 'Receive only, on the COM jack',
  body: setupBody.value,
  color: 'warning',
  icon: 'i-lucide-info',
}));

const setupBody = computed(() => {
  const menu = menus.value;
  const lines = [
    'Plug the optional PG-5G into the control-head COM jack (2.5 mm, 3 conductors: radio TXD, radio RXD, ground). Do not use the TX/RX-unit PC jack, and do not use the DATA mini-DIN. DATA pin PKS is active-low transmit.',
    `Set COM baud in menu ${menu.comBaudMenu} to 9600, 19200, 38400, or 57600, then power-cycle the radio. Match that rate here. The port is 8 data bits, 1 stop bit, no parity. Default 9600.`,
    `Menu ${menu.pcBaudMenu} is the PC-port programming and CAT baud. It is a different jack and is not selected for this tab.`,
    `Press [TNC] until APRS is shown. Set menu ${menu.comOutputMenu} OUTPUT to ON. The default is OFF, and nothing is copied to the COM jack until it is ON.`,
    `Menu ${menu.aprsInternalTncMenu} is the APRS data band and RF packet speed (1200 bps on the usual APRS channel). Menu ${menu.packetDataBandMenu} is the separate packet-mode data band.`,
    'HamBench does not transmit, does not send TNC commands, and does not change radio menus. RTS and DTR are left deasserted.',
  ];

  if (family.value === 'unconfirmed') {
    lines.unshift('Confirm whether this radio is a TM-D710A/E/S or a TM-D710G/GA/GE/GS. The COM and PC menu numbers are different.');
  }

  return lines.join('\n\n');
});

const weather = computed(() => (selected.value?.weather ? aprsWeatherLines(selected.value.weather.value) : []));

watch(stations, (rows) => {
  if (selectedCall.value && rows.some((station) => station.callsign === selectedCall.value)) {
    return;
  }

  selectedCall.value = rows[0]?.callsign;
});

function onBaud(value: unknown): void {
  if (typeof value !== 'number' || !isAprsComBaudRate(value) || !props.cardId) {
    return;
  }

  const rate = value;
  baudRate.value = rate;

  if (typeof localStorage !== 'undefined') {
    writeAprsComBaud(localStorage, props.cardId, rate);
  }
}

async function onConnect(path: string): Promise<void> {
  if (!props.cardId) {
    return;
  }

  if (typeof localStorage !== 'undefined') {
    writeAprsComPort(localStorage, props.cardId, path);
  }

  await connect(props.cardId, path, baudRate.value);
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  await disconnect(props.cardId);
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
        Receive-only APRS from the control-head COM port. The saved programming port is not used.
      </p>
      <div class="flex flex-wrap items-center gap-1.5">
        <USelect
          :model-value="baudRate"
          :items="baudItems"
          value-key="value"
          :disabled="isConnected || isConnecting"
          class="w-36"
          aria-label="COM port baud"
          @update:model-value="onBaud"
        />
        <UBadge :label="connectionBadge.label" :color="connectionBadge.color" variant="subtle" :icon="connectionBadge.icon" />
        <UButton
          v-if="!isConnected"
          color="primary"
          size="sm"
          icon="i-lucide-cable"
          label="Connect"
          :loading="isConnecting"
          :disabled="!cardId"
          @click="portOpen = true"
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
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="Radio setup is manual"
      class="mb-2 shrink-0"
    >
      <template #description>
        <p class="whitespace-pre-line">{{ setupBody }}</p>
        <ul class="mt-2 list-disc space-y-1 ps-4">
          <li>
            <a class="text-primary underline" href="https://manuals.jvckenwood.com/download/files/B62-2562-10.pdf" target="_blank" rel="noreferrer">
              TM-D710GA/GE instruction manual, B62-2562-10
            </a>
            — menus 604, 601, 920, 929, 930
          </li>
          <li>
            <a class="text-primary underline" href="https://kasc.kenwood.com/files/prod/2681/5/TM-D710GE_GA_Instruction_Manual_CD-ROM_V1.01.pdf" target="_blank" rel="noreferrer">
              TM-D710G CD-ROM English V1.01
            </a>
            — COM port on the operation panel; do not use the PC terminal for the built-in TNC
          </li>
          <li>
            <a class="text-primary underline" href="https://www.kenwood.com/i/products/info/amateur/pdf/TM-D710A_E_GA_GE_IDM.pdf" target="_blank" rel="noreferrer">
              Getting More Acquainted with APRS and EchoLink
            </a>
            — PG-5G on the operation-panel COM port. KISS is a host command and is not used here.
          </li>
          <li>
            <a class="text-primary underline" href="https://origin.kenwood.com/jp/products/amateur/mobile/tm_d710_d710s/tm-d710_s_g_gs_in-depth_manual_j.pdf" target="_blank" rel="noreferrer">
              TM-D710/S/G/GS in-depth manual
            </a>
            — menu 528 on D710/S, menu 929 on D710G/GS
          </li>
        </ul>
      </template>
    </UAlert>

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
            No stations yet. Connect the COM port with menu {{ menus.comOutputMenu }} OUTPUT set to ON.
          </p>
          <div v-else :style="{ paddingTop: `${stationPadTop}px`, paddingBottom: `${stationPadBottom}px` }">
            <button
              v-for="row in stationRows"
              :key="stations[row.index]?.callsign ?? row.key"
              type="button"
              class="flex h-11 w-full items-center gap-3 border-b border-default px-2 text-left"
              :class="selected?.callsign === stations[row.index]?.callsign ? 'bg-elevated' : ''"
              @click="selectedCall = stations[row.index]?.callsign"
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

    <RadioPortDialog
      v-model:open="portOpen"
      title="Connect APRS receive"
      description="Choose the USB serial adapter on the PG-5G COM cable. The radio's saved programming port is not filled in."
      confirm-label="Connect"
      :confirm-loading="isConnecting"
      :default-port="rememberedPort"
      :unavailable-ports="lockedPorts"
      omit-unavailable-ports
      :setup-alert="setupAlert"
      panel-class="max-w-xl"
      @confirm="onConnect"
    />
  </div>
</template>
