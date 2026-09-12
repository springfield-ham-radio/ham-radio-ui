<script setup lang="ts">
export interface PlotPoint {
  x: number;
  y: number;
}

export interface PlotSeries {
  id: string;
  label: string;
  color: string;
  points: PlotPoint[];
}

export interface PlotMarker {
  x: number;
  label: string;
  color?: string;
}

export interface PlotGuide {
  y: number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    series: PlotSeries[];
    xScale?: 'linear' | 'log';
    xLabel?: string;
    yLabel?: string;
    yMin?: number;
    yMax?: number;
    markers?: PlotMarker[];
    guides?: PlotGuide[];
    formatX?: (value: number) => string;
    formatY?: (value: number) => string;
    ariaLabel?: string;
  }>(),
  {
    xScale: 'linear',
    xLabel: '',
    yLabel: '',
    markers: () => [],
    guides: () => [],
    formatX: (value: number) => String(value),
    formatY: (value: number) => value.toFixed(1),
    ariaLabel: 'Plot',
  },
);

const width = 640;
const height = 232;
const left = 52;
const right = 18;
const top = 18;
const bottom = 44;
const plotWidth = width - left - right;
const plotHeight = height - top - bottom;

const bounds = computed(() => {
  const xs = props.series.flatMap((series) => series.points.map((point) => point.x)).filter((value) => value > 0 || props.xScale === 'linear');
  const ys = props.series.flatMap((series) => series.points.map((point) => point.y));
  const xMin = props.xScale === 'log' ? Math.min(...xs) : Math.min(0, ...xs);
  const xMax = Math.max(...xs);
  const yDataMin = Math.min(...ys);
  const yDataMax = Math.max(...ys);
  const yPad = (yDataMax - yDataMin) * 0.12 || 1;
  const yMin = props.yMin ?? yDataMin - yPad;
  const yMax = props.yMax ?? yDataMax + yPad;

  return {
    xMin: Number.isFinite(xMin) ? xMin : 1,
    xMax: Number.isFinite(xMax) && xMax > xMin ? xMax : xMin + 1,
    yMin: Number.isFinite(yMin) ? yMin : -1,
    yMax: Number.isFinite(yMax) && yMax > yMin ? yMax : yMin + 1,
  };
});

function xPosition(value: number): number {
  if (props.xScale === 'log') {
    const start = Math.log10(Math.max(bounds.value.xMin, Number.MIN_VALUE));
    const stop = Math.log10(Math.max(bounds.value.xMax, Number.MIN_VALUE * 10));
    const fraction = (Math.log10(Math.max(value, Number.MIN_VALUE)) - start) / (stop - start || 1);
    return left + fraction * plotWidth;
  }

  const fraction = (value - bounds.value.xMin) / (bounds.value.xMax - bounds.value.xMin || 1);
  return left + fraction * plotWidth;
}

function yPosition(value: number): number {
  const fraction = (value - bounds.value.yMin) / (bounds.value.yMax - bounds.value.yMin || 1);
  return top + plotHeight - fraction * plotHeight;
}

function seriesPath(points: PlotPoint[]): string {
  return points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && (props.xScale === 'linear' || point.x > 0))
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xPosition(point.x).toFixed(2)} ${yPosition(point.y).toFixed(2)}`)
    .join(' ');
}

const xTicks = computed(() => {
  if (props.xScale === 'log') {
    const ticks: number[] = [];
    const startExp = Math.floor(Math.log10(bounds.value.xMin));
    const stopExp = Math.ceil(Math.log10(bounds.value.xMax));

    for (let exponent = startExp; exponent <= stopExp; exponent += 1) {
      const tick = 10 ** exponent;

      if (tick >= bounds.value.xMin * 0.999 && tick <= bounds.value.xMax * 1.001) {
        ticks.push(tick);
      }
    }

    return ticks;
  }

  const span = bounds.value.xMax - bounds.value.xMin;
  const step = niceStep(span / 4);
  const ticks: number[] = [];
  const first = Math.ceil(bounds.value.xMin / step) * step;

  for (let tick = first; tick <= bounds.value.xMax + step / 2; tick += step) {
    ticks.push(tick);
  }

  return ticks;
});

const yTicks = computed(() => {
  const span = bounds.value.yMax - bounds.value.yMin;
  const step = niceStep(span / 4);
  const ticks: number[] = [];
  const first = Math.ceil(bounds.value.yMin / step) * step;

  for (let tick = first; tick <= bounds.value.yMax + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(8)));
  }

  return ticks;
});

function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / 10 ** exponent;

  if (fraction < 1.5) {
    return 10 ** exponent;
  }

  if (fraction < 3) {
    return 2 * 10 ** exponent;
  }

  if (fraction < 7) {
    return 5 * 10 ** exponent;
  }

  return 10 ** (exponent + 1);
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="h-auto w-full text-muted"
    role="img"
    :aria-label="ariaLabel"
  >
    <rect
      :x="left"
      :y="top"
      :width="plotWidth"
      :height="plotHeight"
      fill="var(--ui-bg-elevated)"
      stroke="var(--ui-border)"
      rx="4"
    />

    <g stroke="var(--ui-border)">
      <line
        v-for="tick in yTicks"
        :key="`y-${tick}`"
        :x1="left"
        :x2="left + plotWidth"
        :y1="yPosition(tick)"
        :y2="yPosition(tick)"
        stroke-width="1"
        opacity="0.45"
      />
      <line
        v-for="tick in xTicks"
        :key="`x-${tick}`"
        :x1="xPosition(tick)"
        :x2="xPosition(tick)"
        :y1="top"
        :y2="top + plotHeight"
        stroke-width="1"
        opacity="0.35"
      />
    </g>

    <g>
      <line
        v-for="guide in guides"
        :key="`guide-${guide.y}`"
        :x1="left"
        :x2="left + plotWidth"
        :y1="yPosition(guide.y)"
        :y2="yPosition(guide.y)"
        stroke="var(--ui-warning)"
        stroke-dasharray="4 3"
        stroke-width="1.25"
      />
      <text
        v-for="guide in guides"
        :key="`guide-label-${guide.y}`"
        :x="left + plotWidth - 6"
        :y="yPosition(guide.y) - 4"
        text-anchor="end"
        fill="var(--ui-warning)"
        class="text-[10px]"
      >
        {{ guide.label }}
      </text>
    </g>

    <path
      v-for="entry in series"
      :key="entry.id"
      :d="seriesPath(entry.points)"
      fill="none"
      :stroke="entry.color"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />

    <g v-for="(marker, markerIndex) in markers" :key="`marker-${marker.x}`">
      <line
        :x1="xPosition(marker.x)"
        :x2="xPosition(marker.x)"
        :y1="top"
        :y2="top + plotHeight"
        :stroke="marker.color ?? 'var(--ui-info)'"
        stroke-dasharray="3 3"
        stroke-width="1.25"
      />
      <text
        :x="xPosition(marker.x) + 4"
        :y="top + 12 + markerIndex * 12"
        fill="var(--ui-info, #38bdf8)"
        class="text-[10px]"
      >
        {{ marker.label }}
      </text>
    </g>

    <g fill="var(--ui-text-muted, #a3a3a3)" class="text-[10px]">
      <text
        v-for="tick in yTicks"
        :key="`yl-${tick}`"
        :x="left - 6"
        :y="yPosition(tick) + 3"
        text-anchor="end"
      >
        {{ formatY(tick) }}
      </text>
      <text
        v-for="tick in xTicks"
        :key="`xl-${tick}`"
        :x="xPosition(tick)"
        :y="height - 16"
        text-anchor="middle"
      >
        {{ formatX(tick) }}
      </text>
      <text :x="left + plotWidth / 2" :y="height - 3" text-anchor="middle" class="text-[11px]">
        {{ xLabel }}
      </text>
      <text
        :x="12"
        :y="top + plotHeight / 2"
        text-anchor="middle"
        class="text-[11px]"
        :transform="`rotate(-90 12 ${top + plotHeight / 2})`"
      >
        {{ yLabel }}
      </text>
    </g>

    <g v-if="series.length > 1">
      <g v-for="(entry, index) in series" :key="`legend-${entry.id}`" :transform="`translate(${left + 8 + index * 88}, ${top + 8})`">
        <line x1="0" y1="4" x2="14" y2="4" :stroke="entry.color" stroke-width="2" />
        <text x="18" y="7" fill="var(--ui-text-highlighted)" class="text-[10px]">{{ entry.label }}</text>
      </g>
    </g>
  </svg>
</template>
