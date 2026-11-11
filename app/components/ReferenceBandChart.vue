<script setup lang="ts">
import {
  AMATEUR_BANDS,
  BAND_FOOTNOTES,
  BAND_GROUPS,
  LICENSE_CLASSES,
  layoutBand,
  privilegeTextRows,
  usedFootnoteIds,
  type BandGroupId,
  type ClassFilter,
  type SegmentCategory,
} from '~/utils/amateur-bands';
import { REFERENCE_REGION, REFERENCE_VERIFIED_ON } from '~/utils/reference-sources';

const license = ref<ClassFilter>('all');
const group = ref<BandGroupId | 'all'>('all');

const licenseItems = [
  { label: 'All classes', value: 'all' },
  ...LICENSE_CLASSES.map((entry) => ({
    label: entry.grandfathered ? `${entry.label} (grandfathered)` : entry.label,
    value: entry.id,
  })),
];

const groupItems = [
  { label: 'All groups', value: 'all' },
  ...BAND_GROUPS.map((entry) => ({ label: entry.label, value: entry.id })),
];

const bands = computed(() => {
  return AMATEUR_BANDS.filter((band) => group.value === 'all' || band.group === group.value);
});

const layouts = computed(() => {
  return bands.value.map((band) => ({
    band,
    layout: layoutBand(band, license.value),
  }));
});

const footnoteIds = computed(() => usedFootnoteIds(license.value));
const textRows = computed(() => privilegeTextRows(license.value).filter((row) => {
  return bands.value.some((band) => band.id === row.bandId);
}));

const legend: Array<{ category: SegmentCategory; label: string; swatch: string }> = [
  { category: 'cw', label: 'CW only', swatch: 'bg-indigo-700 dark:bg-indigo-400' },
  { category: 'data', label: 'CW and RTTY/data', swatch: 'bg-teal-700 dark:bg-teal-400' },
  { category: 'phone', label: 'CW and phone', swatch: 'bg-amber-700 dark:bg-amber-400' },
  { category: 'mixed', label: 'CW, data, and phone', swatch: 'bg-violet-700 dark:bg-violet-400' },
  { category: 'channel', label: '60 m channel mask', swatch: 'bg-rose-700 dark:bg-rose-400' },
];

const fillClass: Record<SegmentCategory, string> = {
  cw: 'fill-indigo-700 dark:fill-indigo-400',
  data: 'fill-teal-700 dark:fill-teal-400',
  phone: 'fill-amber-700 dark:fill-amber-400',
  mixed: 'fill-violet-700 dark:fill-violet-400',
  channel: 'fill-rose-700 dark:fill-rose-400',
};

function noteNumbers(ids: readonly string[]): string {
  return ids
    .map((id) => footnoteIds.value.indexOf(id) + 1)
    .filter((number) => number > 0)
    .join(', ');
}

function shortBarLabel(label: string): string {
  return label
    .replace('CW, RTTY/data, phone, image', 'All modes')
    .replace('CW, RTTY/data', 'Data')
    .replace('CW, phone, image', 'Phone')
    .replace('CW, phone', 'Phone');
}

function tickShift(ratio: number): string {
  if (ratio < 0.03) {
    return 'translateX(0)';
  }

  if (ratio > 0.97) {
    return 'translateX(-100%)';
  }

  return 'translateX(-50%)';
}

function bandNotes(bandId: string): string {
  const band = AMATEUR_BANDS.find((entry) => entry.id === bandId);

  if (!band) {
    return '';
  }

  const ids = new Set<string>();

  for (const segment of band.segments) {
    const visible = segment.classes.some((classId) => license.value === 'all' || classId === license.value);

    if (!visible) {
      continue;
    }

    for (const id of segment.footnotes) {
      ids.add(id);
    }
  }

  return noteNumbers([...ids]);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 rounded-lg border border-default bg-default px-3 py-3">
      <p class="text-xs text-muted">
        {{ REFERENCE_REGION }}. Verified {{ REFERENCE_VERIFIED_ON }} against the eCFR text of Part 97.
        Bars are FCC privileges, not the ARRL voluntary band plan.
        CW is allowed on every frequency a class may use, except 219–220 MHz.
        Unless a label or note says otherwise, transmitter power is 1.5 kW PEP (§97.313), using the minimum that works.
        Novice and Advanced are no longer issued (§97.501). Existing grants keep the privileges drawn for those classes.
        The chart does not guess a license class.
      </p>
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-full sm:w-64">
          <label for="band-class" class="mb-1 block text-xs font-medium text-highlighted">License class</label>
          <USelect id="band-class" v-model="license" :items="licenseItems" value-key="value" class="w-full" />
        </div>
        <div class="w-full sm:w-52">
          <label for="band-group" class="mb-1 block text-xs font-medium text-highlighted">Bands</label>
          <USelect id="band-group" v-model="group" :items="groupItems" value-key="value" class="w-full" />
        </div>
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li v-for="item in legend" :key="item.category" class="flex items-center gap-1.5">
          <span class="size-3 rounded-sm" :class="item.swatch" aria-hidden="true" />
          {{ item.label }}
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-5">
      <section
        v-for="{ band, layout } in layouts"
        :key="band.id"
        class="rounded-lg border border-default bg-default px-3 py-3"
        :aria-labelledby="`band-${band.id}`"
      >
        <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 :id="`band-${band.id}`" class="text-sm font-semibold text-highlighted">
            {{ band.name }}
            <sup v-if="bandNotes(band.id)" class="ml-0.5 text-[10px] font-medium text-muted">{{ bandNotes(band.id) }}</sup>
          </h3>
          <p v-if="layout.omitted" class="text-xs text-muted">{{ layout.omitted }}</p>
        </div>
        <p v-if="band.blurb" class="mb-2 text-xs text-muted">{{ band.blurb }}</p>

        <div v-if="layout.tracks.length === 0" class="text-xs text-muted">Nothing to draw for this class.</div>

        <div v-else class="flex flex-col gap-1.5" aria-hidden="true">
          <div
            v-for="track in layout.tracks"
            :key="track.id"
            class="grid grid-cols-1 items-center gap-1 sm:grid-cols-[9.5rem_1fr]"
          >
            <p class="truncate text-xs text-muted" :title="track.label">{{ track.label }}</p>
            <svg viewBox="0 0 1000 32" class="h-8 w-full">
              <rect x="0" y="4" width="1000" height="24" rx="6" fill="currentColor" class="text-neutral-200 dark:text-neutral-800" />
              <g v-for="(segment, index) in track.segments" :key="index">
                <rect
                  :x="segment.startRatio * 1000"
                  y="4"
                  :width="Math.max(segment.category === 'channel' ? 8 : 2, (segment.endRatio - segment.startRatio) * 1000)"
                  height="24"
                  rx="4"
                  :class="fillClass[segment.category]"
                >
                  <title>{{ segment.title }}</title>
                </rect>
                <text
                  v-if="segment.endRatio - segment.startRatio > 0.28"
                  :x="((segment.startRatio + segment.endRatio) / 2) * 1000"
                  y="20"
                  text-anchor="middle"
                  font-size="18"
                  class="fill-white font-medium dark:fill-neutral-950"
                >
                  {{ shortBarLabel(segment.label) }}
                </text>
              </g>
            </svg>
          </div>
          <div class="relative h-4 sm:ml-[9.5rem]">
            <span
              v-for="(tick, index) in layout.ticks"
              :key="`${tick.label}-${index}`"
              class="absolute top-0 text-[10px] whitespace-nowrap text-muted"
              :style="{ left: `${tick.ratio * 100}%`, transform: tickShift(tick.ratio) }"
            >
              {{ tick.label }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <section aria-labelledby="band-text">
      <h3 id="band-text" class="mb-1 text-sm font-semibold text-highlighted">Text equivalent</h3>
      <p class="mb-2 text-xs text-muted">
        Same privileges as the chart, including rows that are intentionally not drawn.
        A 60 m “center” is one assigned frequency. The USB dial frequency is 1.5 kHz lower. It is not a tuning range.
      </p>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-[44rem] border-collapse text-left text-xs">
          <thead class="bg-elevated text-muted">
            <tr>
              <th scope="col" class="px-2 py-2 font-medium">Band</th>
              <th scope="col" class="px-2 py-2 font-medium">Range</th>
              <th scope="col" class="px-2 py-2 font-medium">Class</th>
              <th scope="col" class="px-2 py-2 font-medium">Emissions</th>
              <th scope="col" class="px-2 py-2 font-medium">Power</th>
              <th scope="col" class="px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in textRows" :key="`${row.bandId}-${row.range}-${row.classes}-${index}`" class="border-t border-default align-top">
              <th scope="row" class="px-2 py-1.5 font-medium text-highlighted">
                {{ row.band }}
                <span v-if="!row.drawn" class="mt-0.5 block font-normal text-muted">Not drawn</span>
              </th>
              <td class="px-2 py-1.5 font-mono">{{ row.range }}</td>
              <td class="px-2 py-1.5">{{ row.classes }}</td>
              <td class="px-2 py-1.5">{{ row.emissions }}</td>
              <td class="px-2 py-1.5">{{ row.limits }}</td>
              <td class="px-2 py-1.5">{{ row.notes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <ol class="list-decimal space-y-1 pl-4 text-xs text-muted">
      <li v-for="id in footnoteIds" :id="`band-note-${id}`" :key="id">
        {{ BAND_FOOTNOTES[id] }}
      </li>
    </ol>

    <p class="text-xs text-muted">
      Voluntary operating plans:
      <ReferenceExternalLink href="https://www.arrl.org/band-plan">ARRL band plans</ReferenceExternalLink>.
      They are not privileges. Cross-check only:
      <ReferenceExternalLink href="https://www.arrl.org/graphical-frequency-allocations">ARRL graphical allocations</ReferenceExternalLink>.
      This drawing is not their chart.
      Sharing that this page only summarizes is in
      <ReferenceExternalLink href="https://www.ecfr.gov/current/title-47/section-2.106">47 CFR § 2.106</ReferenceExternalLink>
      (NTIA and FCC).
    </p>
  </div>
</template>
