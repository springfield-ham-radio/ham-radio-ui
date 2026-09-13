<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import {
  visibleWaveBenchCharts,
  type WaveBenchChartId,
  type WaveBenchChartLayout,
} from '~/utils/wavebench-charts';
import {
  bodePlot,
  designFilter,
  evaluateResponse,
  FILTER_PRESETS,
  formatComponentValue,
  formatDecibels,
  formatFrequencyHz,
  groupDelaySeconds,
  harmonicTable,
  timeDomainWaveforms,
  type FilterKind,
  type FilterNetwork,
  type FilterPreset,
  type FilterStimulus,
} from '~/utils/wavebench-filters';

type FrequencyUnit = 'Hz' | 'kHz' | 'MHz';

const kindItems: TabsItem[] = [
  { label: 'Low-pass', value: 'low-pass', icon: 'i-lucide-waves-arrow-down' },
  { label: 'High-pass', value: 'high-pass', icon: 'i-lucide-waves-arrow-up' },
  { label: 'Band-pass', value: 'band-pass', icon: 'i-lucide-audio-waveform' },
];

const topologyItems: TabsItem[] = [
  { label: 'RC · 1st order', value: 'rc' },
  { label: 'LC · Butterworth', value: 'lc' },
];

const stimulusItems: TabsItem[] = [
  { label: 'Sine', value: 'sine' },
  { label: 'Square', value: 'square' },
];

const chartItems: TabsItem[] = [
  { label: 'Magnitude', value: 'magnitude' },
  { label: 'Phase', value: 'phase' },
  { label: 'Time', value: 'time' },
];

const chartLayoutItems: TabsItem[] = [
  { label: 'One chart', value: 'single', icon: 'i-lucide-square' },
  { label: 'All charts', value: 'all', icon: 'i-lucide-layout-grid' },
];

const frequencyUnitItems = [
  { label: 'Hz', value: 'Hz' },
  { label: 'kHz', value: 'kHz' },
  { label: 'MHz', value: 'MHz' },
];

const defaultPreset = FILTER_PRESETS[0]!;

const kind = ref<FilterKind>(defaultPreset.parameters.kind);
const topology = ref<FilterNetwork>(defaultPreset.parameters.topology);
const cutoffHz = ref(defaultPreset.parameters.cutoffHz);
const centerHz = ref(defaultPreset.parameters.centerHz);
const bandwidthHz = ref(defaultPreset.parameters.bandwidthHz);
const resistanceOhms = ref(defaultPreset.parameters.resistanceOhms);
const testFrequencyHz = ref(defaultPreset.testFrequencyHz);
const stimulus = ref<FilterStimulus>('sine');
const selectedChart = ref<WaveBenchChartId>('magnitude');
const chartLayout = ref<WaveBenchChartLayout>('single');
const cutoffUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.cutoffHz));
const centerUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.centerHz));
const bandwidthUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.parameters.bandwidthHz));
const probeUnit = ref<FrequencyUnit>(unitForFrequency(defaultPreset.testFrequencyHz));

const design = computed(() => {
  return designFilter({
    kind: kind.value,
    topology: topology.value,
    cutoffHz: positive(kind.value === 'band-pass' ? centerHz.value : cutoffHz.value, 1),
    centerHz: positive(centerHz.value, 1),
    bandwidthHz: positive(bandwidthHz.value, 1),
    resistanceOhms: positive(resistanceOhms.value, 1),
  });
});

const probeResponse = computed(() => evaluateResponse(design.value, positive(testFrequencyHz.value, 1)));
const probeDelay = computed(() => groupDelaySeconds(design.value, positive(testFrequencyHz.value, 1)));
const harmonics = computed(() => harmonicTable(design.value, positive(testFrequencyHz.value, 1), 5));
const bode = computed(() => bodePlot(design.value, { pointsPerDecade: 20, decadesBelow: 2, decadesAbove: 2 }));

const waveforms = computed(() => {
  return timeDomainWaveforms(design.value, {
    frequencyHz: positive(testFrequencyHz.value, 1),
    amplitude: 1,
    cycles: stimulus.value === 'square' ? 3 : 3,
    sampleCount: 360,
    stimulus: stimulus.value,
  });
});

const bodeMinHz = computed(() => bode.value[0]?.frequencyHz ?? 1);
const bodeMaxHz = computed(() => bode.value.at(-1)?.frequencyHz ?? 10);

const probeSlider = computed({
  get: () => hzToSlider(testFrequencyHz.value, bodeMinHz.value, bodeMaxHz.value),
  set: (value: number | number[] | undefined) => {
    const slider = Array.isArray(value) ? value[0] : value;

    if (typeof slider !== 'number' || !Number.isFinite(slider)) {
      return;
    }

    testFrequencyHz.value = sliderToHz(slider, bodeMinHz.value, bodeMaxHz.value);
  },
});

const cutoffDisplay = computed({
  get: () => cutoffHz.value / unitScale(cutoffUnit.value),
  set: (value: number | null | undefined) => {
    assignFrequency(cutoffHz, value, cutoffUnit.value);
  },
});

const centerDisplay = computed({
  get: () => centerHz.value / unitScale(centerUnit.value),
  set: (value: number | null | undefined) => {
    assignFrequency(centerHz, value, centerUnit.value);
  },
});

const bandwidthDisplay = computed({
  get: () => bandwidthHz.value / unitScale(bandwidthUnit.value),
  set: (value: number | null | undefined) => {
    assignFrequency(bandwidthHz, value, bandwidthUnit.value);
  },
});

const probeDisplay = computed({
  get: () => testFrequencyHz.value / unitScale(probeUnit.value),
  set: (value: number | null | undefined) => {
    assignFrequency(testFrequencyHz, value, probeUnit.value);
  },
});

const magnitudeSeries = computed(() => [
  {
    id: 'mag',
    label: design.value.responseKind === 's21' ? 'S21' : '|H|',
    color: 'var(--ui-primary)',
    points: bode.value.map((point) => ({ x: point.frequencyHz, y: point.magnitudeDb })),
  },
]);

const phaseSeries = computed(() => [
  {
    id: 'phase',
    label: 'Phase',
    color: 'var(--ui-info)',
    points: bode.value.map((point) => ({ x: point.frequencyHz, y: point.phaseDegrees })),
  },
]);

const timeScale = computed(() => {
  const duration = waveforms.value.at(-1)?.timeSeconds ?? 0;

  if (duration > 0 && duration < 1e-6) {
    return { factor: 1e9, label: 'Time (ns)' };
  }

  if (duration < 1e-3) {
    return { factor: 1e6, label: 'Time (µs)' };
  }

  return { factor: 1e3, label: 'Time (ms)' };
});

const timeSeries = computed(() => [
  {
    id: 'input',
    label: 'Input',
    color: 'var(--ui-text-muted, #737373)',
    points: waveforms.value.map((sample) => ({ x: sample.timeSeconds * timeScale.value.factor, y: sample.input })),
  },
  {
    id: 'output',
    label: 'Output',
    color: 'var(--ui-primary)',
    points: waveforms.value.map((sample) => ({ x: sample.timeSeconds * timeScale.value.factor, y: sample.output })),
  },
]);

const probeMarker = computed(() => [
  { x: testFrequencyHz.value, label: formatFrequencyHz(testFrequencyHz.value) },
]);

const cutoffMarker = computed(() => {
  const frequencyHz = design.value.centerHz ?? design.value.cutoffHz;
  return [{ x: frequencyHz, label: design.value.kind === 'band-pass' ? 'f₀' : 'f_c' }];
});

const bodeMarkers = computed(() => {
  const markers = [...cutoffMarker.value];

  if (Math.abs(testFrequencyHz.value - (design.value.centerHz ?? design.value.cutoffHz)) / testFrequencyHz.value > 0.02) {
    markers.push(...probeMarker.value);
  }

  return markers;
});

const slopeLabel = computed(() => {
  if (design.value.kind === 'band-pass') {
    return '±20 dB/decade';
  }

  return design.value.order === 1 ? '20 dB/decade' : '40 dB/decade';
});

const visibleChartIds = computed(() => visibleWaveBenchCharts(chartLayout.value, selectedChart.value));

const magnitudeTitle = computed(() => {
  return design.value.responseKind === 's21' ? 'Bode magnitude · insertion gain S21' : 'Bode magnitude · voltage gain H(jω)';
});

const timeTitle = computed(() => {
  return `Time domain · ${stimulus.value} at ${formatFrequencyHz(testFrequencyHz.value)}`;
});

const chartPanelTitle = computed(() => {
  if (chartLayout.value === 'all') {
    return 'Charts';
  }

  if (selectedChart.value === 'magnitude') {
    return magnitudeTitle.value;
  }

  if (selectedChart.value === 'phase') {
    return 'Bode phase';
  }

  return timeTitle.value;
});

const resistanceLabel = computed(() => {
  return design.value.topology === 'lc' ? 'Z₀' : 'R';
});

const activePresetId = computed(() => {
  const match = FILTER_PRESETS.find((preset) => {
    const sameKind = preset.parameters.kind === kind.value;
    const sameNetwork = kind.value === 'band-pass' || preset.parameters.topology === topology.value;
    const sameResistance = nearlyEqual(preset.parameters.resistanceOhms, resistanceOhms.value);
    const sameProbe = nearlyEqual(preset.testFrequencyHz, testFrequencyHz.value);
    const samePassband =
      kind.value === 'band-pass'
        ? nearlyEqual(preset.parameters.centerHz, centerHz.value) &&
          nearlyEqual(preset.parameters.bandwidthHz, bandwidthHz.value)
        : nearlyEqual(preset.parameters.cutoffHz, cutoffHz.value);

    return sameKind && sameNetwork && sameResistance && sameProbe && samePassband;
  });

  return match?.id ?? '';
});

const magnitudeYBounds = computed(() => {
  const values = bode.value.map((point) => point.magnitudeDb);
  const min = Math.min(-40, ...values);
  const max = Math.max(5, ...values);
  return { min, max };
});

function applyPreset(preset: FilterPreset): void {
  kind.value = preset.parameters.kind;
  topology.value = preset.parameters.topology;
  cutoffHz.value = preset.parameters.cutoffHz;
  centerHz.value = preset.parameters.centerHz;
  bandwidthHz.value = preset.parameters.bandwidthHz;
  resistanceOhms.value = preset.parameters.resistanceOhms;
  testFrequencyHz.value = preset.testFrequencyHz;
  cutoffUnit.value = unitForFrequency(preset.parameters.cutoffHz);
  centerUnit.value = unitForFrequency(preset.parameters.centerHz);
  bandwidthUnit.value = unitForFrequency(preset.parameters.bandwidthHz);
  probeUnit.value = unitForFrequency(preset.testFrequencyHz);
}

function assignFrequency(target: Ref<number>, value: number | null | undefined, unit: FrequencyUnit): void {
  if (typeof value !== 'number' || !(value > 0)) {
    return;
  }

  target.value = value * unitScale(unit);
}

function formatDelay(seconds: number): string {
  const abs = Math.abs(seconds);

  if (abs >= 1e-3) {
    return `${(seconds * 1e3).toFixed(2)} ms`;
  }

  if (abs >= 1e-6) {
    return `${(seconds * 1e6).toFixed(2)} µs`;
  }

  return `${(seconds * 1e9).toFixed(1)} ns`;
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
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <UTabs
        v-model="kind"
        :items="kindItems"
        :content="false"
        color="primary"
        variant="pill"
        size="sm"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
      <UTabs
        v-if="kind !== 'band-pass'"
        v-model="topology"
        :items="topologyItems"
        :content="false"
        color="neutral"
        variant="pill"
        size="sm"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
      <UBadge
        v-else
        label="Series RLC"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circuit-board"
      />
    </div>

    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="preset in FILTER_PRESETS"
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
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Design</h3>
          <div class="flex flex-col gap-3">
            <UFormField
              v-if="kind !== 'band-pass'"
              label="Cutoff f_c"
              :help="`−3 dB at ${formatFrequencyHz(design.cutoffHz)}`"
            >
              <div class="flex gap-2">
                <UInputNumber
                  v-model="cutoffDisplay"
                  :min="0.001"
                  :step="cutoffUnit === 'Hz' ? 1 : 0.001"
                  :format-options="{ maximumFractionDigits: 6 }"
                  class="min-w-0 flex-1"
                />
                <USelect v-model="cutoffUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
              </div>
            </UFormField>

            <template v-else>
              <UFormField label="Center f₀" :help="formatFrequencyHz(design.centerHz ?? design.cutoffHz)">
                <div class="flex gap-2">
                  <UInputNumber
                    v-model="centerDisplay"
                    :min="0.001"
                    :step="centerUnit === 'Hz' ? 1 : 0.001"
                    :format-options="{ maximumFractionDigits: 6 }"
                    class="min-w-0 flex-1"
                  />
                  <USelect v-model="centerUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
                </div>
              </UFormField>
              <UFormField label="Bandwidth" :help="`Q = ${(design.qualityFactor ?? 0).toFixed(2)}`">
                <div class="flex gap-2">
                  <UInputNumber
                    v-model="bandwidthDisplay"
                    :min="0.001"
                    :step="bandwidthUnit === 'Hz' ? 1 : 0.001"
                    :format-options="{ maximumFractionDigits: 6 }"
                    class="min-w-0 flex-1"
                  />
                  <USelect v-model="bandwidthUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
                </div>
              </UFormField>
            </template>

            <UFormField :label="resistanceLabel" :help="design.topology === 'lc' ? 'Matched source and load' : 'Series or shunt resistor'">
              <UInputNumber
                v-model="resistanceOhms"
                :min="0.1"
                :step="1"
                :format-options="{ maximumFractionDigits: 3 }"
                class="w-full"
              />
            </UFormField>
          </div>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-2 text-sm font-semibold text-highlighted">Why this filter</h3>
          <p class="text-sm leading-6 text-muted">{{ design.summary }}</p>
          <p class="mt-2 text-xs text-muted">
            {{ activePresetId ? FILTER_PRESETS.find((preset) => preset.id === activePresetId)?.description : 'Edit the values or pick a ham-band preset. The probe tone below is what you inject into the circuit.' }}
          </p>
        </section>

        <section class="min-w-0 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Equations</h3>
          <dl class="flex min-w-0 flex-col gap-3">
            <div v-for="equation in design.equations" :key="equation.id" class="min-w-0">
              <dt class="text-[11px] font-medium uppercase tracking-wide text-muted">{{ equation.title }}</dt>
              <dd class="min-w-0">
                <WaveBenchEquation :expression="equation.expression" />
              </dd>
            </div>
          </dl>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-3 text-sm font-semibold text-highlighted">Components</h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="component in design.components"
              :key="component.id"
              class="flex items-center justify-between text-sm"
            >
              <span class="text-muted">{{ component.id }} · {{ component.role }}</span>
              <span class="font-mono text-highlighted">{{ formatComponentValue(component.symbol, component.value) }}</span>
            </li>
          </ul>
          <p class="mt-3 text-xs text-muted">{{ slopeLabel }} beyond the passband. Ideal lumped elements, no parasitics.</p>
        </section>

        <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
          <h3 class="mb-1 text-sm font-semibold text-highlighted">Harmonics of the probe</h3>
          <p class="mb-3 text-xs text-muted">
            For a transmitter low-pass, read this as the attenuation of 2f, 3f, and so on. A two-pole section is only a start — stacked sections get the extra decades.
          </p>
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-muted">
              <tr>
                <th class="pb-2 font-medium">Harmonic</th>
                <th class="pb-2 font-medium">Frequency</th>
                <th class="pb-2 font-medium">Gain</th>
                <th class="pb-2 font-medium">Phase</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in harmonics" :key="row.harmonic" class="border-t border-default font-mono text-xs">
                <td class="py-1.5 text-muted">{{ row.harmonic === 1 ? 'f' : `${row.harmonic}f` }}</td>
                <td class="py-1.5 text-highlighted">{{ formatFrequencyHz(row.frequencyHz) }}</td>
                <td class="py-1.5 text-highlighted">{{ formatDecibels(row.magnitudeDb) }}</td>
                <td class="py-1.5 text-muted">{{ row.phaseDegrees.toFixed(0) }}°</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div class="flex min-h-0 min-w-0 flex-col gap-4 xl:overflow-hidden">
        <div class="grid shrink-0 gap-4 lg:grid-cols-2">
          <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
            <h3 class="mb-3 text-sm font-semibold text-highlighted">Circuit</h3>
            <WaveBenchSchematic :design="design" />
          </section>

          <section class="rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-highlighted">Probe tone</h3>
              <UTabs
                v-model="stimulus"
                :items="stimulusItems"
                :content="false"
                color="neutral"
                variant="pill"
                size="xs"
                class="w-auto"
                :ui="{ list: 'w-auto', trigger: 'grow-0' }"
              />
            </div>
            <div class="flex flex-col gap-3">
              <div class="flex gap-2">
                <UInputNumber
                  v-model="probeDisplay"
                  :min="0.001"
                  :step="probeUnit === 'Hz' ? 1 : 0.001"
                  :format-options="{ maximumFractionDigits: 6 }"
                  class="min-w-0 flex-1"
                />
                <USelect v-model="probeUnit" :items="frequencyUnitItems" value-key="value" class="w-24" />
              </div>
              <USlider v-model="probeSlider" :min="0" :max="1000" :step="1" />
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-elevated px-3 py-2">
                  <p class="text-[11px] text-muted">{{ design.responseKind === 's21' ? 'S21' : 'Gain' }}</p>
                  <p class="font-mono text-sm text-highlighted">{{ formatDecibels(probeResponse.magnitudeDb) }}</p>
                </div>
                <div class="rounded-lg bg-elevated px-3 py-2">
                  <p class="text-[11px] text-muted">Phase</p>
                  <p class="font-mono text-sm text-highlighted">{{ probeResponse.phaseDegrees.toFixed(1) }}°</p>
                </div>
                <div class="rounded-lg bg-elevated px-3 py-2">
                  <p class="text-[11px] text-muted">Group delay</p>
                  <p class="font-mono text-sm text-highlighted">{{ formatDelay(probeDelay) }}</p>
                </div>
                <div class="rounded-lg bg-elevated px-3 py-2">
                  <p class="text-[11px] text-muted">|H| linear</p>
                  <p class="font-mono text-sm text-highlighted">{{ probeResponse.magnitude.toFixed(3) }}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="flex min-h-[20rem] min-w-0 flex-1 flex-col rounded-xl bg-default p-4 shadow-sm ring-1 ring-default xl:min-h-0">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">{{ chartPanelTitle }}</h3>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <UTabs
                v-if="chartLayout === 'single'"
                v-model="selectedChart"
                :items="chartItems"
                :content="false"
                color="neutral"
                variant="pill"
                size="xs"
                class="w-auto"
                :ui="{ list: 'w-auto', trigger: 'grow-0' }"
              />
              <UTabs
                v-model="chartLayout"
                :items="chartLayoutItems"
                :content="false"
                color="primary"
                variant="pill"
                size="xs"
                class="w-auto"
                :ui="{ list: 'w-auto', trigger: 'grow-0' }"
              />
            </div>
          </div>

          <div
            class="grid min-h-0 flex-1 gap-3"
            :class="chartLayout === 'all' ? 'grid-rows-3 xl:grid-cols-2 xl:grid-rows-2' : 'grid-rows-1'"
          >
            <div
              v-if="visibleChartIds.includes('magnitude')"
              class="flex min-h-0 min-w-0 flex-col"
            >
              <h4 v-if="chartLayout === 'all'" class="mb-1 shrink-0 text-xs font-medium text-muted">
                {{ magnitudeTitle }}
              </h4>
              <div class="h-full min-h-0 flex-1">
                <WaveBenchPlot
                  :series="magnitudeSeries"
                  x-scale="log"
                  x-label="Frequency"
                  y-label="dB"
                  :y-min="magnitudeYBounds.min"
                  :y-max="magnitudeYBounds.max"
                  :markers="bodeMarkers"
                  :guides="[{ y: -3.01, label: '−3 dB' }]"
                  :format-x="formatFrequencyHz"
                  :format-y="(value) => value.toFixed(0)"
                  aria-label="Bode magnitude plot"
                />
              </div>
            </div>

            <div
              v-if="visibleChartIds.includes('phase')"
              class="flex min-h-0 min-w-0 flex-col"
            >
              <h4 v-if="chartLayout === 'all'" class="mb-1 shrink-0 text-xs font-medium text-muted">Bode phase</h4>
              <div class="h-full min-h-0 flex-1">
                <WaveBenchPlot
                  :series="phaseSeries"
                  x-scale="log"
                  x-label="Frequency"
                  y-label="deg"
                  :markers="bodeMarkers"
                  :format-x="formatFrequencyHz"
                  :format-y="(value) => value.toFixed(0)"
                  aria-label="Bode phase plot"
                />
              </div>
            </div>

            <div
              v-if="visibleChartIds.includes('time')"
              class="flex min-h-0 min-w-0 flex-col"
              :class="chartLayout === 'all' ? 'xl:col-span-2' : ''"
            >
              <h4 v-if="chartLayout === 'all'" class="mb-1 shrink-0 text-xs font-medium text-muted">{{ timeTitle }}</h4>
              <div class="h-full min-h-0 flex-1">
                <WaveBenchPlot
                  :series="timeSeries"
                  x-scale="linear"
                  :x-label="timeScale.label"
                  y-label="V"
                  :format-x="(value) => value.toFixed(2)"
                  :format-y="(value) => value.toFixed(1)"
                  aria-label="Input and output waveforms"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
