<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { stationLogDraftFromCatVfo } from '~/utils/cat-log-draft';
import type { CatVfo } from '~/utils/kenwood-cat-session';
import type { RadioConnectionSelection } from '~/composables/useRadioConnectionForm';
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { snifferPacketsFromSerialLog } from '~/utils/sniffer-capture';
import { serialLogEntryCount } from '~/utils/serial-log-file';
import { serialPortLabel } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import {
  createBlankStationLogQso,
  type StationLogQsoInput,
} from '~/utils/station-log-db';

const props = defineProps<{
  savedRadioId?: string;
}>();

const { configurations, openModulesInstall } = useRadio();
const { radioById } = useSavedRadios();
const { cardById, setCatPort } = useRadioBoard();
const { choiceForRadio, identityFor } = useOperatorLicense();
const {
  liveRadios,
  connecting,
  error,
  connected,
  lockedPorts,
  failedConnectLog,
  debugLogging,
  connect,
  disconnect,
  setFrequency,
  setMode,
  setPower,
  setTransmit,
  setDebugLogging,
  clearSerialLog,
  saveSerialLog,
} = useCat();
const { createQso } = useStationLog();

const connectOpen = ref(false);
const portOpen = ref(false);
const editorOpen = ref(false);
const transmitMicWarningOpen = ref(true);
const logDefaults = ref<Partial<StationLogQsoInput>>({});
const activeTab = ref('control');
const savingSerialLog = ref(false);
const debugPort = ref<string | undefined>();

const savedRadio = computed(() => radioById(props.savedRadioId));
const boundConfig = computed(() => {
  if (!savedRadio.value) {
    return undefined;
  }

  return configurations.value.find((config) => String(config.id.model) === savedRadio.value?.model);
});
const boundSupportsCat = computed(() => (boundConfig.value ? radioSupportsLiveCat(boundConfig.value) : false));
const boundPort = computed(() => cardById(props.savedRadioId)?.catPort);
const catConfigs = computed(() => configurations.value.filter((config) => radioSupportsLiveCat(config)));
const visibleLiveRadios = computed(() => {
  if (!props.savedRadioId) {
    return liveRadios.value;
  }

  const port = boundPort.value;

  if (!port) {
    return [];
  }

  return liveRadios.value.filter((radio) => radio.port === port);
});

const items = computed<TabsItem[]>(() => [
  { label: 'Control', icon: 'i-lucide-sliders-horizontal', slot: 'control' as const, value: 'control' },
  { label: 'Debug', icon: 'i-lucide-bug', slot: 'debug' as const, value: 'debug' },
]);

const debugPortItems = computed(() => {
  const liveItems = visibleLiveRadios.value.map((radio) => ({
    label: `${radio.radio.name} · ${serialPortLabel(radio.port, readSerialPortSettings().portAliases)}`,
    value: radio.port,
  }));

  if (failedConnectLog.value && liveItems.every((item) => item.value !== 'failed')) {
    liveItems.push({ label: 'Last failed connect', value: 'failed' });
  }

  return liveItems;
});

const activeDebugRadio = computed(() => {
  if (debugPort.value === 'failed') {
    return undefined;
  }

  return visibleLiveRadios.value.find((radio) => radio.port === debugPort.value) ?? visibleLiveRadios.value[0];
});

const debugLog = computed(() => {
  if (debugPort.value === 'failed') {
    return failedConnectLog.value;
  }

  return activeDebugRadio.value?.serialLog ?? failedConnectLog.value;
});

const debugPackets = computed(() => snifferPacketsFromSerialLog(debugLog.value));

const debugSummary = computed(() => {
  const frames = serialLogEntryCount(debugLog.value);
  const frameLabel = `${frames} frame${frames === 1 ? '' : 's'}`;

  if (frames === 0) {
    return debugLogging.value
      ? 'Capturing serial traffic from CAT sessions.'
      : 'Capture is off. Connect still logs the handshake; turn Capture on for live traffic.';
  }

  if (debugPort.value === 'failed' || (!activeDebugRadio.value && failedConnectLog.value)) {
    return `Last failed connect · ${frameLabel}`;
  }

  const name = activeDebugRadio.value?.radio.name ?? 'CAT';

  if (!connected.value) {
    return `Last session · ${name} · ${frameLabel}`;
  }

  return `${debugLogging.value ? 'Capturing' : 'Paused'} · ${name} · ${frameLabel}`;
});

const cardConnected = computed(() => visibleLiveRadios.value.length > 0);

const connectionBadge = computed(() => {
  const count = visibleLiveRadios.value.length;

  if (count === 0) {
    return { label: 'Disconnected', color: 'neutral' as const, icon: 'i-lucide-plug' };
  }

  if (count === 1) {
    return { label: 'Connected', color: 'success' as const, icon: 'i-lucide-cable' };
  }

  return { label: `${count} connected`, color: 'success' as const, icon: 'i-lucide-cable' };
});

watch(
  () => visibleLiveRadios.value.map((radio) => radio.port).join('\0'),
  () => {
    if (debugPort.value && visibleLiveRadios.value.some((radio) => radio.port === debugPort.value)) {
      return;
    }

    if (debugPort.value === 'failed' && failedConnectLog.value) {
      return;
    }

    debugPort.value = visibleLiveRadios.value[0]?.port ?? (failedConnectLog.value ? 'failed' : undefined);
  },
  { immediate: true },
);

async function connectSavedRadio(serialPortPath: string): Promise<void> {
  const radio = savedRadio.value;
  const config = boundConfig.value;

  if (!radio || !config || !props.savedRadioId) {
    return;
  }

  await connect(serialPortPath, config, resolveProgrammingBaudRate(config.serialConfig, radio.baudRate));

  if (error.value) {
    debugPort.value = 'failed';
    activeTab.value = 'debug';
    return;
  }

  setCatPort(props.savedRadioId, serialPortPath);
}

async function disconnectSavedRadio(port: string): Promise<void> {
  await disconnect(port);

  if (props.savedRadioId && boundPort.value === port) {
    setCatPort(props.savedRadioId, undefined);
  }
}

async function onConfirm(selection: RadioConnectionSelection): Promise<void> {
  await connect(selection.serialPortPath, selection.config, selection.baudRate);

  if (error.value) {
    debugPort.value = 'failed';
    activeTab.value = 'debug';
  }
}

function requestConnect(): void {
  if (props.savedRadioId) {
    portOpen.value = true;
    return;
  }

  connectOpen.value = true;
}

function onFrequency(port: string, vfo: CatVfo, frequencyHz: number): void {
  void setFrequency(port, vfo.band, frequencyHz);
}

function onMode(port: string, vfo: CatVfo, mode: string): void {
  void setMode(port, vfo.band, mode);
}

function onPower(port: string, vfo: CatVfo, power: string): void {
  void setPower(port, vfo.band, power);
}

function onTransmit(port: string, transmit: boolean): void {
  void setTransmit(port, transmit);
}

function openLog(vfo: CatVfo): void {
  const identity = identityFor(choiceForRadio(savedRadio.value));
  logDefaults.value = {
    ...createBlankStationLogQso({
      operatorCallsign: identity.callSign,
      stationCallsign: identity.callSign,
      myGridsquare: identity.gridsquare,
    }),
    ...stationLogDraftFromCatVfo(vfo),
  };
  editorOpen.value = true;
}

async function onSaveContact(payload: StationLogQsoInput & { id?: string }): Promise<void> {
  try {
    await createQso(payload);
    editorOpen.value = false;
  } catch {
    // Toast is shown by the composable.
  }
}

async function onSaveSerialLog(): Promise<void> {
  savingSerialLog.value = true;

  try {
    await saveSerialLog(debugPort.value);
  } finally {
    savingSerialLog.value = false;
  }
}

function onClearSerialLog(): void {
  clearSerialLog(debugPort.value);
}

onBeforeUnmount(() => {
  for (const radio of liveRadios.value) {
    if (radio.status.transmitting) {
      void setTransmit(radio.port, false);
    }
  }
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <div class="mb-2 flex shrink-0 items-center justify-between gap-3">
      <p class="min-w-0 text-xs text-muted">
        Live control for this radio. Connect uses its saved serial port unless you choose another.
      </p>
      <div class="flex shrink-0 items-center gap-1.5">
        <UBadge
          :label="connectionBadge.label"
          :color="connectionBadge.color"
          variant="subtle"
          :icon="connectionBadge.icon"
        />
        <UButton
          v-if="savedRadioId ? boundSupportsCat && !cardConnected : catConfigs.length > 0"
          :color="connected && !savedRadioId ? 'neutral' : 'primary'"
          :variant="connected && !savedRadioId ? 'outline' : 'solid'"
          size="sm"
          icon="i-lucide-cable"
          :label="savedRadioId || !connected ? 'Connect' : 'Connect another'"
          :loading="connecting"
          @click="requestConnect"
        />
      </div>
    </div>

    <UTabs
      v-model="activeTab"
      color="primary"
      variant="link"
      :items="items"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      :unmount-on-hide="false"
      :ui="{
        list: 'w-full shrink-0 items-center gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none',
      }"
    >
      <template #control>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 py-4">
            <div
              v-if="savedRadioId && !boundConfig"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                Install the driver for {{ savedRadio?.name ?? 'this radio' }} under Preferences → Drivers before connecting.
              </p>
              <UButton
                icon="i-lucide-download"
                color="primary"
                label="Install drivers"
                to="/preferences?section=drivers"
              />
            </div>

            <div
              v-else-if="savedRadioId && !boundSupportsCat"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                {{ savedRadio?.name ?? 'This radio' }} does not support live CAT. Use the Channels tab to import and write memory.
              </p>
            </div>

            <div
              v-else-if="!savedRadioId && !connected && catConfigs.length === 0"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                Live CAT needs a Kenwood module such as TH-F6 or TM-D710A. Clone-only radios such as a Baofeng UV-5R use the Channels tab.
              </p>
              <UButton
                icon="i-lucide-download"
                color="primary"
                label="Install radios"
                @click="openModulesInstall()"
              />
            </div>

            <div
              v-else-if="!cardConnected"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                <template v-if="savedRadioId">
                  Connect {{ savedRadio?.name ?? 'this radio' }} to control VFO, mode, power, and PTT. The saved serial port is selected, and you can choose another.
                </template>
                <template v-else>
                  Connect a CAT-capable radio to control VFO, mode, power, and PTT. Open another radio card to use a second cable.
                </template>
              </p>
              <UButton
                icon="i-lucide-cable"
                color="primary"
                label="Connect"
                :loading="connecting"
                @click="requestConnect"
              />
            </div>

            <template v-else>
              <UAlert
                v-if="transmitMicWarningOpen"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Transmit keys microphone audio"
                description="CAT TX/RX keys whichever side currently has PTT and sends mic audio, not audio from the DATA port. Hold the transmit button only while you are ready to send."
                close
                @update:open="transmitMicWarningOpen = $event"
              />

              <CatSessionPanel
                v-for="radio in visibleLiveRadios"
                :key="radio.port"
                :radio="radio"
                :privilege="choiceForRadio(savedRadio)"
                @disconnect="disconnectSavedRadio(radio.port)"
                @frequency="(vfo, frequencyHz) => onFrequency(radio.port, vfo, frequencyHz)"
                @mode="(vfo, mode) => onMode(radio.port, vfo, mode)"
                @power="(vfo, power) => onPower(radio.port, vfo, power)"
                @transmit="(transmit) => onTransmit(radio.port, transmit)"
                @log="openLog"
              />
            </template>
          </div>
        </div>
      </template>

      <template #debug>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 text-xs text-muted">{{ debugSummary }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <USelectMenu
                v-if="debugPortItems.length > 1"
                v-model="debugPort"
                :items="debugPortItems"
                value-key="value"
                class="w-56"
              />
              <USwitch
                :model-value="debugLogging"
                size="sm"
                label="Capture"
                @update:model-value="setDebugLogging"
              />
              <UButton
                icon="i-lucide-eraser"
                color="neutral"
                variant="outline"
                size="sm"
                label="Clear"
                :disabled="debugPackets.length === 0"
                @click="onClearSerialLog"
              />
              <UButton
                icon="i-lucide-file-text"
                color="neutral"
                variant="outline"
                size="sm"
                label="Save serial log"
                :disabled="debugPackets.length === 0 || savingSerialLog"
                :loading="savingSerialLog"
                @click="onSaveSerialLog"
              />
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
              <p v-if="debugPackets.length === 0" class="text-muted">
                {{
                  debugLogging
                    ? 'Connect CAT to capture serial traffic. Failed connects stay here so you can see the wake CR and ID exchange.'
                    : 'Capture is off, so live CAT traffic is not recorded. Connect still logs the handshake, including failed connects.'
                }}
              </p>
              <div v-for="packet in debugPackets" :key="packet.id" class="flex gap-3 whitespace-nowrap">
                <span class="text-muted">{{ packet.timestamp }}</span>
                <span :class="packet.direction === 'COMPUTER->RADIO' ? 'text-warning' : 'text-success'">
                  {{ packet.direction }}
                </span>
                <span class="text-highlighted">{{ snifferPacketToHex(packet.data) }}</span>
                <span v-if="packet.description" class="text-muted">{{ packet.description }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

    <RadioPortDialog
      v-if="savedRadioId"
      v-model:open="portOpen"
      title="Connect CAT"
      :description="`Connect ${savedRadio?.name ?? 'this radio'}. The saved port is selected; pick another if this cable is on a different adapter.`"
      confirm-label="Connect"
      :confirm-loading="connecting"
      :default-port="savedRadio?.serialPort"
      :unavailable-ports="lockedPorts"
      omit-unavailable-ports
      @confirm="connectSavedRadio"
    />

    <RadioConnectionDialog
      v-else
      v-model:open="connectOpen"
      title="Connect CAT"
      description="Plug the programming cable into the computer, choose the serial port, then plug the cable into the radio PC port. A second radio needs its own cable and port; ports already in a CAT session are not listed."
      confirm-label="Connect"
      :confirm-loading="connecting"
      :filter="radioSupportsLiveCat"
      :unavailable-ports="lockedPorts"
      omit-unavailable-ports
      @confirm="onConfirm"
    />

    <StationLogEditor
      :open="editorOpen"
      :defaults="logDefaults"
      @update:open="editorOpen = $event"
      @save="onSaveContact"
    />
  </div>
</template>
