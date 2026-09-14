<script setup lang="ts">
import type { DailySolarIndex, SolarConditions } from '~/utils/propagation-solar';

const props = defineProps<{
  conditions: SolarConditions | undefined;
  loading: boolean;
}>();

interface MetricCard {
  label: string;
  value: string;
  hint: string;
}

const history = computed(() => props.conditions?.history ?? []);

const metrics = computed<MetricCard[]>(() => {
  const conditions = props.conditions;

  return [
    {
      label: 'Solar flux',
      value: conditions?.solarFlux === undefined ? '—' : formatNumber(conditions.solarFlux),
      hint: '10.7 cm SFI',
    },
    {
      label: 'Sunspots',
      value: conditions?.sunspotNumber === undefined ? '—' : formatNumber(conditions.sunspotNumber),
      hint: 'Daily SSN',
    },
    {
      label: 'A-index',
      value: conditions ? formatNumber(conditions.aIndex) : '—',
      hint: 'Planetary A',
    },
    {
      label: 'K-index',
      value: conditions ? formatKIndex(conditions.kIndex) : '—',
      hint: 'Planetary K',
    },
    {
      label: 'X-ray',
      value: conditions?.xrayClass ?? '—',
      hint: 'GOES long',
    },
  ];
});

const trendLabel = computed(() => {
  const days = history.value;

  if (days.length === 0) {
    return 'Trend';
  }

  if (days.length === 1) {
    return `Trend · ${days[0]!.date}`;
  }

  return `Trend · ${days[0]!.date} → ${days.at(-1)!.date}`;
});

const sparklinePath = computed(() => {
  return buildSparklinePath(history.value, (day) => day.solarFlux);
});

const sunspotPath = computed(() => {
  return buildSparklinePath(history.value, (day) => day.sunspotNumber);
});

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatKIndex(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function buildSparklinePath(history: DailySolarIndex[], pick: (day: DailySolarIndex) => number): string {
  if (history.length < 2) {
    return '';
  }

  const values = history.map(pick);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const width = 120;
  const height = 32;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold text-highlighted">Solar activity</h3>
      <p v-if="conditions?.issuedAt" class="text-xs text-muted">
        WWV issued {{ conditions.issuedAt }}
      </p>
    </div>

    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <UCard
        v-for="metric in metrics"
        :key="metric.label"
        :ui="{ body: 'p-3 sm:p-3' }"
        class="bg-default"
      >
        <p class="text-xs text-muted">{{ metric.label }}</p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">
          <span v-if="loading && !conditions" class="text-muted">…</span>
          <span v-else>{{ metric.value }}</span>
        </p>
        <p class="mt-0.5 text-[11px] text-muted">{{ metric.hint }}</p>
      </UCard>
    </div>

    <div class="grid gap-2 lg:grid-cols-[1fr_1.2fr]">
      <UCard :ui="{ body: 'p-3 sm:p-3' }" class="bg-default">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="text-xs font-medium text-highlighted">{{ trendLabel }}</p>
          <div class="flex items-center gap-3 text-[11px] text-muted">
            <span class="inline-flex items-center gap-1">
              <span class="size-2 rounded-full bg-primary" /> SFI
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="size-2 rounded-full bg-info" /> SSN
            </span>
          </div>
        </div>
        <svg viewBox="0 0 120 32" class="h-10 w-full text-primary" aria-hidden="true">
          <path
            v-if="sunspotPath"
            :d="sunspotPath"
            fill="none"
            class="stroke-info"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            v-if="sparklinePath"
            :d="sparklinePath"
            fill="none"
            class="stroke-primary"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <text
            v-if="!sparklinePath && !loading"
            x="60"
            y="18"
            text-anchor="middle"
            class="fill-muted text-[8px]"
          >
            No history yet
          </text>
        </svg>
      </UCard>

      <UCard :ui="{ body: 'p-3 sm:p-3' }" class="bg-default">
        <p class="text-xs font-medium text-highlighted">Geomagnetic summary</p>
        <p class="mt-2 text-sm text-default">
          {{ conditions?.stormSummary || (loading ? 'Loading NOAA WWV…' : 'No WWV summary available.') }}
        </p>
      </UCard>
    </div>
  </section>
</template>
