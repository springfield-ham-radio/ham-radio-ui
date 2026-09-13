<script setup lang="ts">
import {
  MODULATION_PRESETS,
  modulationEquations,
  modulationReadings,
  modulationScopeChannels,
  modulationWaveforms,
  modulationWindow,
  type ModulationParameters,
  type ModulationPreset,
} from '~/utils/wavebench-modulation';
import { formatFrequencyHz } from '~/utils/wavebench-filters';

type FrequencyUnit = 'Hz' | 'kHz' | 'MHz';

const defaultPreset = MODULATION_PRESETS[0]!;

const carrierHz = ref(defaultPreset.parameters.carrierHz);
const messageHz = ref(defaultPreset.parameters.messageHz);
const carrierAmplitude = ref(defaultPreset.parameters.carrierAmplitude);
const amIndex = ref(defaultPreset.parameters.amIndex);
const fmDeviationHz = ref(defaultPreset.parameters.fmDeviationHz);
const enableAm = ref(defaultPreset.enableAm);
const enableFm = ref(defaultPreset.enableFm);
const showCarrier = ref(true);
const showMessage = ref(false);
const showEnvelope = ref(false);
const carrierUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.carrierHz));
const messageUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.messageHz));
const deviationUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.fmDeviationHz));

const frequencyUnitItems = [
  { label: 'Hz', value: 'Hz' },
  { label: 'kHz', value: 'kHz' },
  { label: 'MHz', value: 'MHz' },
];

const parameters = computed<ModulationParameters>(() => ({
  carrierAmplitude: positive(carrierAmplitude.value, 1),
  carrierHz: positive(carrierHz.value, 1),
  messageHz: positive(messageHz.value, 1),
  amIndex: Math.max(0, amIndex.value),
  fmDeviationHz: Math.max(0, fmDeviationHz.value),
}));

const window = computed(() => modulationWindow(parameters.value, { enableAm: enableAm.value, enableFm: enableFm.value }));
const samples = computed(() => modulationWaveforms(parameters.value, window.value));
const readings = computed(() => modulationReadings(parameters.value));
const equations = computed(() => modulationEquations({ enableAm: enableAm.value, enableFm: enableFm.value }));

const channels = computed(() =>
  modulationScopeChannels(samples.value, {
    enableAm: enableAm.value,
    enableFm: enableFm.value,
    showCarrier: showCarrier.value,
    showMessage: showMessage.value,
    showEnvelope: showEnvelope.value,
  }),
);

const carrierDisplay = computed({
  get: () => carrierHz.value / unitScale(carrierUnit.value),
  set: (value: number | null | undefined) => assignFrequency(carrierHz, value, carrierUnit.value),
});

const messageDisplay = computed({
  get: () => messageHz.value / unitScale(messageUnit.value),
  set: (value: number | null | undefined) => assignFrequency(messageHz, value, messageUnit.value),
});

const deviationDisplay = computed({
  get: () => fmDeviationHz.value / unitScale(deviationUnit.value),
  set: (value: number | null | undefined) => {
    if (typeof value !== 'number' || !(value >= 0) || !Number.isFinite(value)) {
      return;
    }

    fmDeviationHz.value = value * unitScale(deviationUnit.value);
  },
});

const carrierSlider = computed({
  get: () => hzToSlider(carrierHz.value, 200, 50_000),
  set: (value: number | number[] | undefined) => {
    const slider = Array.isArray(value) ? value[0] : value;
    if (typeof slider !== 'number' || !Number.isFinite(slider)) {
      return;
    }
    carrierHz.value = sliderToHz(slider, 200, 50_000);
  },
});

const activePresetId = computed(() => {
  const match = MODULATION_PRESETS.find((preset) => {
    return (
      preset.enableAm === enableAm.value &&
      preset.enableFm === enableFm.value &&
      nearlyEqual(preset.parameters.carrierHz, carrierHz.value) &&
      nearlyEqual(preset.parameters.messageHz, messageHz.value) &&
      nearlyEqual(preset.parameters.amIndex, amIndex.value) &&
      nearlyEqual(preset.parameters.fmDeviationHz, fmDeviationHz.value) &&
      nearlyEqual(preset.parameters.carrierAmplitude, carrierAmplitude.value)
    );
  });

  return match?.id ?? '';
});

const scopeTitle = computed(() => {
  if (enableAm.value && enableFm.value) {
    return 'Oscilloscope · AM and FM on the same carrier';
  }
  if (enableAm.value) {
    return 'Oscilloscope · amplitude modulation';
  }
  if (enableFm.value) {
    return 'Oscilloscope · frequency modulation';
  }
  return `Oscilloscope · carrier at ${formatFrequencyHz(carrierHz.value)}`;
});

watch(enableAm, (enabled) => {
  if (enabled) {
    showEnvelope.value = true;
    showMessage.value = true;
  }
});

watch(enableFm, (enabled) => {
  if (enabled) {
    showMessage.value = true;
  }
});

function applyPreset(preset: ModulationPreset): void {
  carrierHz.value = preset.parameters.carrierHz;
  messageHz.value = preset.parameters.messageHz;
  carrierAmplitude.value = preset.parameters.carrierAmplitude;
  amIndex.value = preset.parameters.amIndex;
  fmDeviationHz.value = preset.parameters.fmDeviationHz;
  enableAm.value = preset.enableAm;
  enableFm.value = preset.enableFm;
  showCarrier.value = true;
  showMessage.value = preset.enableAm || preset.enableFm;
  showEnvelope.value = preset.enableAm;
  carrierUnit.value = unitForFrequency(preset.parameters.carrierHz);
  messageUnit.value = unitForFrequency(preset.parameters.messageHz);
  deviationUnit.value = unitForFrequency(preset.parameters.fmDeviationHz);
}

function assignFrequency(target: Ref<number>, value: number | null | undefined, unit: FrequencyUnit): void {
  if (typeof value !== 'number' || !(value > 0)) {
    return;
  }

  target.value = value * unitScale(unit);
}

function unitScale(unit: FrequencyUnit): number {
  if (unit === 'MHz') {
    return 1_000_000;
  }

  if (unit === 'kHz') {
    return 1_000;
  }

  return 1;
}

function unitForFrequency(frequencyHz: number): FrequencyUnit {
  if (frequencyHz >= 1_000_000) {
    return 'MHz';
  }

  if (frequencyHz >= 1_000) {
    return 'kHz';
  }

  return 'Hz';
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-9, Math.abs(left) * 1e-6);
}

function positive(value: number, fallback: number): number {
  return value > 0 && Number.isFinite(value) ? value : fallback;
}

function hzToSlider(frequencyHz: number, minHz: number, maxHz: number): number {
  const start = Math.log10(minHz);
  const span = Math.log10(maxHz) - start || 1;
  return (1000 * (Math.log10(Math.min(Math.max(frequencyHz, minHz), maxHz)) - start)) / span;
}

function sliderToHz(slider: number, minHz: number, maxHz: number): number {
  const start = Math.log10(minHz);
  const span = Math.log10(maxHz) - start || 1;
  return 10 ** (start + (slider / 1000) * span);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 px-4 py-4">
    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="preset in MODULATION_PRESETS"
        :key="preset.id"
        size="xs"
        :color="activePresetId === preset.id ? 'primary' : 'neutral'"
        :variant="activePresetId === preset.id ? 'soft' : 'outline'"
        :label="preset.label"
        @click="applyPreset(preset)"
      />
    </div>

    <div class="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[20rem_minmax(0,1fr)] xl:overflow-hidden">
      <div class="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-2 text-sm font-semibold text-highlighted">The wave equation</h3>
          <p class="text-sm leading-6 text-muted">
            Every radio signal starts as a sine. Amplitude <span class="font-mono text-highlighted">A</span> is height,
            frequency <span class="font-mono text-highlighted">f</span> is cycles per second, and phase
            <span class="font-mono text-highlighted">φ</span> slides the wave in time. Pick a carrier, then write a
            tone into its height (AM) or its instantaneous frequency (FM).
          </p>
          <p class="mt-2 text-xs text-muted">
            {{ activePresetId ? MODULATION_PRESETS.find((preset) => preset.id === activePresetId)?.description : 'On the air f_c is megahertz. This bench slows the carrier so the CRT can show individual cycles — the shape is the same.' }}
          </p>
        </section>

        <section class="min-w-0 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Equations</h3>
          <dl class="flex min-w-0 flex-col gap-3">
            <div v-for="equation in equations" :key="equation.id" class="min-w-0">
              <dt class="text-[11px] font-medium uppercase tracking-wide text-muted">{{ equation.title }}</dt>
              <dd class="min-w-0">
                <WaveBenchEquation :expression="equation.expression" />
              </dd>
            </div>
          </dl>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Carrier</h3>
          <div class="flex flex-col gap-3">
            <UFormField label="Frequency f_c" :help="formatFrequencyHz(parameters.carrierHz)">
              <div class="flex gap-2">
                <UInputNumber
                  v-model="carrierDisplay"
                  :min="0.001"
                  :step="carrierUnit === 'Hz' ? 1 : 0.001"
                  :format-options="{ maximumFractionDigits: 6 }"
                  class="min-w-0 flex-1"
                />
                <USelect v-model="carrierUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
              </div>
            </UFormField>
            <USlider v-model="carrierSlider" :min="0" :max="1000" :step="1" />
            <UFormField label="Amplitude A_c" help="Volts on the CRT">
              <UInputNumber
                v-model="carrierAmplitude"
                :min="0.1"
                :max="5"
                :step="0.1"
                :format-options="{ maximumFractionDigits: 2 }"
                class="w-full"
              />
            </UFormField>
          </div>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Modulating tone</h3>
          <UFormField label="Frequency f_m" :help="formatFrequencyHz(parameters.messageHz)">
            <div class="flex gap-2">
              <UInputNumber
                v-model="messageDisplay"
                :min="0.001"
                :step="messageUnit === 'Hz' ? 1 : 0.001"
                :format-options="{ maximumFractionDigits: 6 }"
                class="min-w-0 flex-1"
              />
              <USelect v-model="messageUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
            </div>
          </UFormField>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">Amplitude modulation</h3>
            <USwitch v-model="enableAm" size="sm" label="On" />
          </div>
          <p class="mb-3 text-xs text-muted">
            AM writes the tone into the carrier’s height. The dashed envelope on the CRT is A_c [1 + μ m(t)].
          </p>
          <UFormField
            label="Index μ"
            :help="`${readings.amPercent.toFixed(0)}% · sidebands at f_c ± f_m · BW ${formatFrequencyHz(readings.amBandwidthHz)}`"
          >
            <USlider v-model="amIndex" :min="0" :max="1.5" :step="0.01" :disabled="!enableAm" />
          </UFormField>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">Frequency modulation</h3>
            <USwitch v-model="enableFm" size="sm" label="On" />
          </div>
          <p class="mb-3 text-xs text-muted">
            FM writes the tone into instantaneous frequency. Amplitude stays A_c — watch the cycles bunch and spread.
          </p>
          <UFormField
            label="Deviation Δf"
            :help="`β = ${readings.fmBeta.toFixed(2)} · Carson BW ≈ ${formatFrequencyHz(readings.carsonBandwidthHz)}`"
          >
            <div class="flex gap-2">
              <UInputNumber
                v-model="deviationDisplay"
                :min="0"
                :step="deviationUnit === 'Hz' ? 1 : 0.001"
                :disabled="!enableFm"
                :format-options="{ maximumFractionDigits: 6 }"
                class="min-w-0 flex-1"
              />
              <USelect v-model="deviationUnit" :items="frequencyUnitItems" value-key="value" class="w-24" :disabled="!enableFm" />
            </div>
          </UFormField>
        </section>
      </div>

      <div class="flex min-h-0 min-w-0 flex-col gap-4 xl:overflow-hidden">
        <UAlert
          v-if="readings.carrierTooLow"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Raise the carrier, or lower the tone"
          description="A useful lab ratio is f_c ≥ 10 f_m so the envelope can form around many carrier cycles."
        />
        <UAlert
          v-if="enableAm && readings.overmodulated"
          color="warning"
          variant="subtle"
          icon="i-lucide-audio-lines"
          title="Overmodulation"
          description="μ > 1. The envelope crosses zero and a diode detector would fold the audio. Voice AM stays under 100%."
        />

        <section class="grid shrink-0 gap-2 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg bg-elevated px-3 py-2">
            <p class="text-[11px] text-muted">Carrier</p>
            <p class="font-mono text-sm text-highlighted">{{ formatFrequencyHz(parameters.carrierHz) }}</p>
          </div>
          <div class="rounded-lg bg-elevated px-3 py-2">
            <p class="text-[11px] text-muted">Tone</p>
            <p class="font-mono text-sm text-highlighted">{{ formatFrequencyHz(parameters.messageHz) }}</p>
          </div>
          <div class="rounded-lg bg-elevated px-3 py-2">
            <p class="text-[11px] text-muted">AM μ</p>
            <p class="font-mono text-sm text-highlighted">{{ enableAm ? readings.amIndex.toFixed(2) : 'off' }}</p>
          </div>
          <div class="rounded-lg bg-elevated px-3 py-2">
            <p class="text-[11px] text-muted">FM β</p>
            <p class="font-mono text-sm text-highlighted">{{ enableFm ? readings.fmBeta.toFixed(2) : 'off' }}</p>
          </div>
        </section>

        <section class="flex min-h-[22rem] min-w-0 flex-1 flex-col rounded-xl bg-default p-4 shadow-sm ring-1 ring-default xl:min-h-0">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">{{ scopeTitle }}</h3>
            <div class="flex flex-wrap items-center justify-end gap-1.5">
              <UButton
                size="xs"
                :color="showCarrier ? 'success' : 'neutral'"
                :variant="showCarrier ? 'soft' : 'outline'"
                label="CH1 Carrier"
                @click="showCarrier = !showCarrier"
              />
              <UButton
                size="xs"
                :color="showMessage ? 'info' : 'neutral'"
                :variant="showMessage ? 'soft' : 'outline'"
                :disabled="!enableAm && !enableFm"
                label="CH2 Tone"
                @click="showMessage = !showMessage"
              />
              <UButton
                size="xs"
                :color="enableAm ? 'warning' : 'neutral'"
                :variant="enableAm && showEnvelope ? 'soft' : 'outline'"
                :disabled="!enableAm"
                label="Envelope"
                @click="showEnvelope = !showEnvelope"
              />
            </div>
          </div>
          <div class="min-h-0 flex-1">
            <WaveBenchScope
              :channels="channels"
              layout="stack"
              :aria-label="scopeTitle"
            />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
