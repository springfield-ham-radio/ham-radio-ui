<script setup lang="ts">
import {
  SCOPE_H_DIVS,
  autoVoltsPerDiv,
  formatTimePerDiv,
  formatVoltsPerDiv,
  scopeDurationSeconds,
  scopeGraticule,
  scopePeakVoltage,
  scopeStrips,
  scopeTimePerDiv,
  scopeTracePath,
  scopeViewportSize,
  visibleScopeChannels,
  type ScopeChannel,
  type ScopeLayoutMode,
  type ScopeStrip,
} from '~/utils/wavebench-scope';

const props = withDefaults(
  defineProps<{
    channels: ScopeChannel[];
    layout?: ScopeLayoutMode;
    voltsPerDiv?: number;
    ariaLabel?: string;
    showReadout?: boolean;
  }>(),
  {
    layout: 'overlay',
    ariaLabel: 'Oscilloscope',
    showReadout: true,
  },
);

const uid = useId();
const frame = ref<HTMLElement | null>(null);
const width = ref(640);
const height = ref(280);

const box = computed(() => scopeViewportSize(width.value, height.value));
const visible = computed(() => visibleScopeChannels(props.channels));
const strips = computed(() => scopeStrips(box.value, visible.value, props.layout));
const duration = computed(() => scopeDurationSeconds(visible.value));
const timePerDiv = computed(() => scopeTimePerDiv(duration.value));
const graticule = computed(() => scopeGraticule(box.value));
const glowId = computed(() => `${uid}-phosphor`);

const clipId = (key: string): string => `${uid}-clip-${key}`;

const traces = computed(() => {
  return visible.value.map((channel) => {
    const strip = stripFor(channel);
    const volts = voltsFor(strip);
    return {
      channel,
      strip,
      voltsPerDiv: volts,
      path: scopeTracePath(channel.samples, duration.value, volts, box.value, strip),
    };
  });
});

const readout = computed(() => {
  if (props.layout === 'overlay' || strips.value.length <= 1) {
    const strip = strips.value[0];
    const volts = formatVoltsPerDiv(strip ? voltsFor(strip) : 1);

    return visible.value
      .filter((channel) => !channel.dashed)
      .map((channel) => ({
        key: channel.id,
        label: channel.label,
        color: channel.color,
        volts,
      }));
  }

  return strips.value.map((strip) => {
    const channel = visible.value.find((entry) => (entry.group ?? entry.id) === strip.key && !entry.dashed);

    return {
      key: strip.key,
      label: channel?.label ?? strip.key,
      color: channel?.color ?? 'var(--ui-text-muted)',
      volts: formatVoltsPerDiv(voltsFor(strip)),
    };
  });
});

function stripFor(channel: ScopeChannel): ScopeStrip {
  const key = channel.group ?? channel.id;
  return strips.value.find((strip) => strip.key === key) ?? strips.value[0]!;
}

function voltsFor(strip: ScopeStrip): number {
  if (typeof props.voltsPerDiv === 'number' && props.voltsPerDiv > 0) {
    return props.voltsPerDiv;
  }

  const samples = visible.value
    .filter((channel) => (props.layout === 'overlay' ? true : (channel.group ?? channel.id) === strip.key))
    .flatMap((channel) => channel.samples);

  return autoVoltsPerDiv(scopePeakVoltage(samples), strip.divisions);
}

function horizontalLines(strip: ScopeStrip): number[] {
  const lines: number[] = [];

  for (let index = 0; index <= strip.divisions; index += 1) {
    lines.push(strip.top + (index / strip.divisions) * strip.height);
  }

  return lines;
}

function verticalLines(): number[] {
  const plot = box.value;
  const lines: number[] = [];

  for (let index = 0; index <= SCOPE_H_DIVS; index += 1) {
    lines.push(plot.left + (index / SCOPE_H_DIVS) * plot.plotWidth);
  }

  return lines;
}

function syncViewport(): void {
  const size = scopeViewportSize(frame.value?.clientWidth ?? 0, frame.value?.clientHeight ?? 0);
  width.value = size.width;
  height.value = size.height;
}

onMounted(() => {
  syncViewport();

  if (typeof ResizeObserver === 'undefined' || !frame.value) {
    return;
  }

  const observer = new ResizeObserver(() => syncViewport());
  observer.observe(frame.value);
  onBeforeUnmount(() => observer.disconnect());
});
</script>

<template>
  <div class="wavebench-scope flex h-full min-h-0 min-w-0 w-full flex-col">
    <div ref="frame" class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <svg
        :viewBox="`0 0 ${box.width} ${box.height}`"
        class="block h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="ariaLabel"
      >
        <defs>
          <filter :id="glowId" x="-8%" y="-18%" width="116%" height="136%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath v-for="strip in strips" :id="clipId(strip.key)" :key="`clip-${strip.key}`">
            <rect :x="box.left" :y="strip.top" :width="box.plotWidth" :height="strip.height" />
          </clipPath>
        </defs>

        <rect
          :x="box.left"
          :y="box.top"
          :width="box.plotWidth"
          :height="box.plotHeight"
          class="scope-crt"
          rx="3"
        />

        <g class="scope-graticule">
          <template v-if="layout === 'overlay' || strips.length <= 1">
            <line
              v-for="(x, index) in graticule.majorVertical"
              :key="`vx-${index}`"
              :x1="x"
              :x2="x"
              :y1="box.top"
              :y2="box.top + box.plotHeight"
              class="scope-major"
            />
            <line
              v-for="(y, index) in graticule.majorHorizontal"
              :key="`hy-${index}`"
              :x1="box.left"
              :x2="box.left + box.plotWidth"
              :y1="y"
              :y2="y"
              class="scope-major"
            />
            <line
              :x1="box.left"
              :x2="box.left + box.plotWidth"
              :y1="graticule.axisY"
              :y2="graticule.axisY"
              class="scope-axis"
            />
            <line
              :x1="graticule.axisX"
              :x2="graticule.axisX"
              :y1="box.top"
              :y2="box.top + box.plotHeight"
              class="scope-axis"
            />
          </template>
          <template v-else>
            <g v-for="strip in strips" :key="`g-${strip.key}`">
              <line
                v-for="(x, index) in verticalLines()"
                :key="`svx-${strip.key}-${index}`"
                :x1="x"
                :x2="x"
                :y1="strip.top"
                :y2="strip.top + strip.height"
                class="scope-major"
              />
              <line
                v-for="(y, index) in horizontalLines(strip)"
                :key="`shy-${strip.key}-${index}`"
                :x1="box.left"
                :x2="box.left + box.plotWidth"
                :y1="y"
                :y2="y"
                class="scope-major"
              />
              <line
                :x1="box.left"
                :x2="box.left + box.plotWidth"
                :y1="strip.centerY"
                :y2="strip.centerY"
                class="scope-axis"
              />
            </g>
          </template>
        </g>

        <g v-for="trace in traces" :key="trace.channel.id" :clip-path="`url(#${clipId(trace.strip.key)})`">
          <path
            :d="trace.path"
            fill="none"
            :stroke="trace.channel.color"
            :stroke-width="trace.channel.dashed ? 1.15 : 2"
            :stroke-dasharray="trace.channel.dashed ? '5 4' : undefined"
            stroke-linejoin="round"
            stroke-linecap="round"
            :filter="trace.channel.dashed ? undefined : `url(#${glowId})`"
            :opacity="trace.channel.dashed ? 0.8 : 1"
          />
        </g>

        <g v-if="layout === 'stack' && strips.length > 1">
          <text
            v-for="row in readout"
            :key="`lbl-${row.key}`"
            :x="box.left + 6"
            :y="(strips.find((strip) => strip.key === row.key)?.top ?? box.top) + 11"
            :fill="row.color"
            class="text-[10px] font-mono"
          >
            {{ row.label }}
          </text>
        </g>
      </svg>
    </div>

    <div v-if="showReadout" class="mt-1.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
      <span v-for="row in readout" :key="`ro-${row.key}`" class="text-highlighted">
        <span class="mr-1 inline-block size-1.5 rounded-full" :style="{ background: row.color }" />
        {{ row.label }} {{ row.volts }}
      </span>
      <span class="text-muted">TIME {{ formatTimePerDiv(timePerDiv) }}</span>
    </div>
  </div>
</template>

<style scoped>
.wavebench-scope :deep(.scope-crt) {
  fill: #07140f;
}

.wavebench-scope :deep(.scope-major) {
  stroke: color-mix(in srgb, var(--ui-success) 26%, transparent);
  stroke-width: 1;
}

.wavebench-scope :deep(.scope-axis) {
  stroke: color-mix(in srgb, var(--ui-success) 55%, transparent);
  stroke-width: 1.15;
}

.wavebench-scope :deep(.scope-graticule) {
  pointer-events: none;
}
</style>
