<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { stationLogDraftFromCatVfo } from '~/utils/cat-log-draft';
import type { CatVfo } from '~/utils/kenwood-cat-session';
import type { RadioConnectionSelection } from '~/composables/useRadioConnectionForm';
import { snifferPacketToHex } from '~/utils/sniffer-api';
import { snifferPacketsFromSerialLog } from '~/utils/sniffer-capture';
import { serialLogEntryCount } from '~/utils/serial-log-file';
import {
  createBlankStationLogQso,
  type StationLogQsoInput,
} from '~/utils/station-log-db';

useHead({ title: 'CAT' });

const { configurations, openModulesInstall } = useRadio();
const { license } = useOperatorLicense();
const {
  status,
  connecting,
  busy,
  error,
  connected,
  connectedRadio,
  serialLog,
  connect,
  disconnect,
  setFrequency,
  setMode,
  setPower,
  setTransmit,
  saveSerialLog,
} = useCat();
const { createQso } = useStationLog();

const connectOpen = ref(false);
const editorOpen = ref(false);
const logDefaults = ref<Partial<StationLogQsoInput>>({});
const activeTab = ref('control');
const savingSerialLog = ref(false);

const catConfigs = computed(() => configurations.value.filter((config) => radioSupportsLiveCat(config)));

const items = computed<TabsItem[]>(() => [
  { label: 'Control', icon: 'i-lucide-sliders-horizontal', slot: 'control' as const, value: 'control' },
  { label: 'Debug', icon: 'i-lucide-bug', slot: 'debug' as const, value: 'debug' },
]);

const modes = computed(() => status.value?.modes ?? []);
const powers = computed(() => status.value?.powers ?? []);

const debugPackets = computed(() => snifferPacketsFromSerialLog(serialLog.value));

const debugSummary = computed(() => {
  const frames = serialLogEntryCount(serialLog.value);

  if (frames === 0) {
    return 'Serial traffic from the CAT session appears here.';
  }

  return `${connected.value ? 'Live session' : 'Last session'} · ${frames} frame${frames === 1 ? '' : 's'}`;
});

async function onConfirm(selection: RadioConnectionSelection): Promise<void> {
  await connect(selection.serialPortPath, selection.config, selection.baudRate);

  if (error.value) {
    activeTab.value = 'debug';
  }
}

function onFrequency(vfo: CatVfo, frequencyHz: number): void {
  void setFrequency(vfo.band, frequencyHz);
}

function onMode(vfo: CatVfo, mode: string): void {
  void setMode(vfo.band, mode);
}

function onPower(vfo: CatVfo, power: string): void {
  void setPower(vfo.band, power);
}

function onTransmit(transmit: boolean): void {
  void setTransmit(transmit);
}

function openLog(vfo: CatVfo): void {
  logDefaults.value = {
    ...createBlankStationLogQso({
      operatorCallsign: license.value?.callSign,
      stationCallsign: license.value?.callSign,
      myGridsquare: license.value?.gridsquare,
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
    await saveSerialLog();
  } finally {
    savingSerialLog.value = false;
  }
}

onBeforeUnmount(() => {
  if (status.value?.transmitting) {
    void setTransmit(false);
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div class="flex shrink-0 items-start justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">CAT</h2>
        <p class="text-xs text-muted">
          Live control for Kenwood radios that already speak CAT. Disconnect before importing or writing memory.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <UBadge
          :label="connected ? 'Connected' : 'Disconnected'"
          :color="connected ? 'success' : 'neutral'"
          variant="subtle"
          :icon="connected ? 'i-lucide-cable' : 'i-lucide-plug'"
        />
        <UButton
          v-if="connected"
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-plug"
          label="Disconnect"
          :disabled="busy"
          @click="disconnect"
        />
        <UButton
          v-else-if="catConfigs.length > 0"
          color="primary"
          size="sm"
          icon="i-lucide-cable"
          label="Connect"
          :loading="connecting"
          @click="connectOpen = true"
        />
      </div>
    </div>

    <UTabs
      v-model="activeTab"
      color="primary"
      variant="link"
      :items="items"
      class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-1"
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
              v-if="!connected && catConfigs.length === 0"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                Live CAT needs a Kenwood module such as TH-F6 or TM-D710A. Clone-only radios such as a Baofeng UV-5R stay on the Radio page.
              </p>
              <UButton
                icon="i-lucide-download"
                color="primary"
                label="Install radios"
                @click="openModulesInstall()"
              />
            </div>

            <div
              v-else-if="!connected"
              class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"
            >
              <p class="text-sm text-muted">
                Connect a CAT-capable radio to control VFO, mode, power, and PTT.
              </p>
              <UButton
                icon="i-lucide-cable"
                color="primary"
                label="Connect"
                :loading="connecting"
                @click="connectOpen = true"
              />
            </div>

            <template v-else>
              <UAlert
                v-if="error"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                title="CAT error"
                :description="error"
              />

              <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                title="Transmit keys microphone audio"
                description="CAT TX/RX keys whichever side currently has PTT and sends mic audio, not audio from the DATA port. Hold the transmit button only while you are ready to send."
              />

              <p v-if="status" class="text-xs text-muted">
                {{ status.radioIdentity }}
                <span v-if="connectedRadio"> · {{ connectedRadio.name }}</span>
                <span v-if="status.dualBand"> · dual band</span>
              </p>

              <div
                v-if="status"
                class="grid gap-4"
                :class="status.vfos.length > 1 ? 'lg:grid-cols-2' : 'max-w-2xl'"
              >
                <CatVfoCard
                  v-for="vfo in status.vfos"
                  :key="vfo.band"
                  :vfo="vfo"
                  :modes="modes"
                  :powers="powers"
                  :is-control="vfo.band === status.controlBand"
                  :transmitting="status.transmitting"
                  :disabled="busy || connecting"
                  @frequency="onFrequency(vfo, $event)"
                  @mode="onMode(vfo, $event)"
                  @power="onPower(vfo, $event)"
                  @transmit="onTransmit"
                  @log="openLog(vfo)"
                />
              </div>
            </template>
          </div>
        </div>
      </template>

      <template #debug>
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 text-xs text-muted">{{ debugSummary }}</p>
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
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
            <div class="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6">
              <p v-if="debugPackets.length === 0" class="text-muted">
                Connect CAT to capture serial traffic. Failed connects stay here so you can see the wake CR and ID exchange.
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

    <RadioConnectionDialog
      v-model:open="connectOpen"
      title="Connect CAT"
      description="Plug the programming cable into the computer, choose the serial port, then plug the cable into the radio PC port."
      confirm-label="Connect"
      :confirm-loading="connecting"
      :filter="radioSupportsLiveCat"
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
