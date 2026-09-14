<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';
import {
  buildDayNightTable,
  buildHourlyBandGrid,
  currentClockHour,
  displayHourForLocalHour,
  type BandRating,
  type DayNightBandRow,
  type PropagationClock,
} from '~/utils/propagation-bands';

const props = defineProps<{
  solarFlux: number | undefined;
  kIndex: number | undefined;
}>();

const UBadge = resolveComponent('UBadge');

const clock = ref<PropagationClock>('local');
const clockItems: TabsItem[] = [
  { label: 'Local', value: 'local' },
  { label: 'UTC', value: 'utc' },
];

const dayNightRows = computed(() => {
  if (props.solarFlux === undefined || props.kIndex === undefined) {
    return [];
  }

  return buildDayNightTable({ solarFlux: props.solarFlux, kIndex: props.kIndex });
});

const hourlyGrid = computed(() => {
  if (props.solarFlux === undefined || props.kIndex === undefined) {
    return undefined;
  }

  return buildHourlyBandGrid({ solarFlux: props.solarFlux, kIndex: props.kIndex });
});

/** Columns are always local hours; “now” stays on the current local column. */
const nowHour = computed(() => currentClockHour('local'));

const chartTitle = computed(() => {
  const zone = clock.value === 'utc' ? 'UTC labels' : 'local time';
  return `24-hour chart (${zone})`;
});

const chartSubtitle =
  'Heuristic day/night and 24-hour estimates from SFI and K — not a point-to-point forecast.';

const columns: TableColumn<DayNightBandRow>[] = [
  {
    accessorKey: 'label',
    header: 'Band',
  },
  {
    accessorKey: 'day',
    header: 'Day',
    cell: ({ row }) =>
      h(UBadge, {
        label: formatRating(row.original.day),
        color: ratingColor(row.original.day),
        variant: ratingBadgeVariant(row.original.day),
        size: 'sm',
        class: row.original.day === 'closed' ? 'capitalize text-toned' : 'capitalize',
      }),
  },
  {
    accessorKey: 'night',
    header: 'Night',
    cell: ({ row }) =>
      h(UBadge, {
        label: formatRating(row.original.night),
        color: ratingColor(row.original.night),
        variant: ratingBadgeVariant(row.original.night),
        size: 'sm',
        class: row.original.night === 'closed' ? 'capitalize text-toned' : 'capitalize',
      }),
  },
];

function formatRating(rating: BandRating): string {
  return rating;
}

function ratingColor(rating: BandRating): 'neutral' | 'error' | 'warning' | 'info' | 'success' {
  switch (rating) {
    case 'closed':
      return 'neutral';
    case 'poor':
      return 'error';
    case 'fair':
      return 'warning';
    case 'good':
      return 'info';
    case 'excellent':
      return 'success';
  }
}

function ratingBadgeVariant(rating: BandRating): 'subtle' | 'outline' {
  return rating === 'closed' ? 'outline' : 'subtle';
}

function cellClass(rating: BandRating): string {
  const fill = {
    // Accented fill so Closed reads as a cell on the dark card, not empty space.
    closed: 'bg-accented text-muted',
    poor: 'bg-error/25 text-error',
    fair: 'bg-warning/30 text-warning',
    good: 'bg-info/30 text-info',
    excellent: 'bg-success/35 text-success',
  }[rating];

  // Every cell gets a light border so the grid (and Closed) stay readable.
  return `${fill} border border-accented`;
}

function hourLabel(localHour: number): string {
  return displayHourForLocalHour(localHour, clock.value).toString().padStart(2, '0');
}

function cellTitle(bandLabel: string, localHour: number, rating: BandRating): string {
  const local = localHour.toString().padStart(2, '0');

  if (clock.value === 'utc') {
    const utc = hourLabel(localHour);
    return `${bandLabel} @ ${utc}:00 UTC (${local}:00 local) — ${rating}`;
  }

  return `${bandLabel} @ ${local}:00 local — ${rating}`;
}
</script>

<template>
  <section class="flex min-h-0 flex-col gap-3">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">Band openings</h3>
      <p class="text-xs text-muted">
        {{ chartSubtitle }}
      </p>
    </div>

    <div class="grid min-h-0 gap-3 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
      <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden bg-default">
        <UTable
          :data="dayNightRows"
          :columns="columns"
          class="max-h-full"
          :ui="{
            th: 'h-8 px-3 py-0 text-xs font-medium',
            td: 'h-8 px-3 py-0 text-xs',
            empty: 'py-6 text-center text-sm text-muted',
          }"
          empty="Load solar indices to estimate bands."
        />
      </UCard>

      <UCard :ui="{ body: 'p-3 sm:p-3' }" class="min-w-0 overflow-auto bg-default">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-xs font-medium text-highlighted">{{ chartTitle }}</p>
            <UTabs
              v-model="clock"
              :items="clockItems"
              :content="false"
              color="neutral"
              variant="pill"
              size="xs"
              class="w-auto"
              :ui="{ list: 'w-auto', trigger: 'grow-0' }"
            />
          </div>
          <div class="flex flex-wrap gap-2 text-[11px] text-muted">
            <span class="inline-flex items-center gap-1">
              <span class="size-2 rounded-sm border border-accented bg-accented" /> Closed
            </span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm border border-accented bg-error/40" /> Poor</span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm border border-accented bg-warning/50" /> Fair</span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm border border-accented bg-info/50" /> Good</span>
            <span class="inline-flex items-center gap-1"><span class="size-2 rounded-sm border border-accented bg-success/50" /> Excellent</span>
          </div>
        </div>

        <div v-if="hourlyGrid" class="min-w-[36rem]">
          <div class="flex gap-px">
            <div class="flex w-14 shrink-0 flex-col gap-px">
              <div class="h-5" aria-hidden="true" />
              <div
                v-for="row in hourlyGrid.rows"
                :key="`label-${row.bandId}`"
                class="flex h-6 items-center pr-2 text-xs text-default"
              >
                {{ row.label }}
              </div>
            </div>

            <div
              v-for="hour in hourlyGrid.hours"
              :key="`col-${hour}`"
              class="flex min-w-0 flex-1 flex-col gap-px rounded-md p-px"
              :class="hour === nowHour ? 'bg-primary/15 ring-1 ring-inset ring-primary/50' : ''"
            >
              <div
                class="flex h-5 items-end justify-center pb-1 text-center text-[10px] tabular-nums"
                :class="hour === nowHour ? 'font-semibold text-highlighted' : 'text-muted'"
              >
                {{ hourLabel(hour) }}
              </div>
              <div
                v-for="row in hourlyGrid.rows"
                :key="`${row.bandId}-${hour}`"
                class="flex h-6 items-center justify-center rounded-sm text-[9px] capitalize"
                :class="cellClass(row.ratings[hour]!)"
                :title="cellTitle(row.label, hour, row.ratings[hour]!)"
              >
                <span class="sr-only">{{ row.ratings[hour] }}</span>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-sm text-muted">
          Load solar indices to build the hourly chart.
        </p>
      </UCard>
    </div>
  </section>
</template>
