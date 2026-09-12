<script setup lang="ts">
import { radioSupportsLiveCat } from '~/utils/cat-capability';
import { stationLogDraftFromCatVfo } from '~/utils/cat-log-draft';
import { kenwoodCatDialectForModel, kenwoodModesForDialect } from '~/utils/kenwood-cat-control';
import type { KenwoodCatPower } from '~/utils/kenwood-cat-control';
import type { CatVfo } from '~/utils/kenwood-cat-session';
import type { RadioConnectionSelection } from '~/composables/useRadioConnectionForm';
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
  connect,
  disconnect,
  setFrequency,
  setMode,
  setPower,
  setTransmit,
} = useCat();
const { createQso } = useStationLog();

const connectOpen = ref(false);
const editorOpen = ref(false);
const logDefaults = ref<Partial<StationLogQsoInput>>({});

const catConfigs = computed(() => configurations.value.filter((config) => radioSupportsLiveCat(config)));

const modes = computed(() => {
  const model = connectedRadio.value?.model ?? '';
  return [...kenwoodModesForDialect(kenwoodCatDialectForModel(model))];
});

async function onConfirm(selection: RadioConnectionSelection): Promise<void> {
  await connect(selection.serialPortPath, selection.config, selection.baudRate);
}

function onFrequency(vfo: CatVfo, frequencyHz: number): void {
  void setFrequency(vfo.band, frequencyHz);
}

function onMode(vfo: CatVfo, mode: string): void {
  void setMode(vfo.band, mode);
}

function onPower(vfo: CatVfo, power: KenwoodCatPower): void {
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

onBeforeUnmount(() => {
  if (status.value?.transmitting) {
    void setTransmit(false);
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
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

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
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
