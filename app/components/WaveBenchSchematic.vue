<script setup lang="ts">
import { formatComponentValue, type FilterComponent, type FilterDesign } from '~/utils/wavebench-filters';

const props = defineProps<{
  design: FilterDesign;
}>();

const width = 720;
const height = 220;
const railY = 88;
const groundY = 188;
const startX = 36;

const seriesComponents = computed(() => props.design.components.filter((component) => component.role === 'series' || component.role === 'source'));
const shuntComponents = computed(() => props.design.components.filter((component) => component.role === 'shunt' || component.role === 'load'));

const seriesSlots = computed(() => {
  const slots: { component: FilterComponent; x: number }[] = [];
  let x = startX + 70;

  for (const component of seriesComponents.value) {
    slots.push({ component, x });
    x += 110;
  }

  return { slots, nodeX: x + 10 };
});

function componentLabel(component: FilterComponent): string {
  const name = component.id;
  return `${name} ${formatComponentValue(component.symbol, component.value)}`;
}

function resistorPath(x: number, y: number, vertical = false): string {
  if (vertical) {
    return `M ${x} ${y - 28} L ${x} ${y - 18} l 8 4 l -16 6 l 16 6 l -16 6 l 16 6 l -8 4 L ${x} ${y + 28}`;
  }

  return `M ${x - 36} ${y} L ${x - 22} ${y} l 4 -8 l 6 16 l 6 -16 l 6 16 l 6 -16 l 4 8 L ${x + 36} ${y}`;
}

function capacitorLeads(x: number, y: number, vertical = false): { x1: number; y1: number; x2: number; y2: number }[] {
  if (vertical) {
    return [
      { x1: x - 12, y1: y - 4, x2: x + 12, y2: y - 4 },
      { x1: x - 12, y1: y + 4, x2: x + 12, y2: y + 4 },
    ];
  }

  return [
    { x1: x - 4, y1: y - 12, x2: x - 4, y2: y + 12 },
    { x1: x + 4, y1: y - 12, x2: x + 4, y2: y + 12 },
  ];
}

function inductorPath(x: number, y: number, vertical = false): string {
  if (vertical) {
    return `M ${x} ${y - 32} L ${x} ${y - 18}
      c 12 0 12 12 0 12
      c 12 0 12 12 0 12
      c 12 0 12 12 0 12
      L ${x} ${y + 32}`;
  }

  return `M ${x - 40} ${y} L ${x - 24} ${y}
    c 0 -14 14 -14 14 0
    c 0 -14 14 -14 14 0
    c 0 -14 14 -14 14 0
    L ${x + 40} ${y}`;
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="h-auto w-full text-highlighted"
    role="img"
    :aria-label="`${design.kind.replace('-', ' ')} ${design.topology.toUpperCase()} filter schematic`"
  >
    <text x="36" y="28" fill="var(--ui-text-muted, #a3a3a3)" class="text-[11px] tracking-wide uppercase">
      {{ design.order === 1 ? 'First-order' : 'Second-order' }}
      {{ design.topology.toUpperCase() }}
      {{ design.kind.replace('-', ' ') }}
    </text>

    <!-- Source -->
    <circle cx="36" cy="railY" r="14" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M 28 88 Q 32 80 36 88 Q 40 96 44 88" fill="none" stroke="currentColor" stroke-width="1.25" />
    <text x="36" y="58" text-anchor="middle" class="fill-muted text-[11px]">Vin</text>
    <line x1="50" :y1="railY" :x2="startX + 70 - 36" :y2="railY" stroke="currentColor" stroke-width="1.5" />
    <line x1="36" :y1="railY + 14" x2="36" :y2="groundY - 10" stroke="currentColor" stroke-width="1.5" />

    <!-- Series elements -->
    <g v-for="slot in seriesSlots.slots" :key="slot.component.id">
      <path
        v-if="slot.component.symbol === 'R'"
        :d="resistorPath(slot.x, railY)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        v-else-if="slot.component.symbol === 'L'"
        :d="inductorPath(slot.x, railY)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <g v-else>
        <line :x1="slot.x - 36" :y1="railY" :x2="slot.x - 4" :y2="railY" stroke="currentColor" stroke-width="1.5" />
        <line :x1="slot.x + 4" :y1="railY" :x2="slot.x + 36" :y2="railY" stroke="currentColor" stroke-width="1.5" />
        <line
          v-for="plate in capacitorLeads(slot.x, railY)"
          :key="`${plate.x1}-${plate.y1}`"
          :x1="plate.x1"
          :y1="plate.y1"
          :x2="plate.x2"
          :y2="plate.y2"
          stroke="currentColor"
          stroke-width="1.75"
        />
      </g>
      <text :x="slot.x" :y="railY - 22" text-anchor="middle" class="fill-primary text-[11px] font-medium">
        {{ componentLabel(slot.component) }}
      </text>
    </g>

    <line
      :x1="(seriesSlots.slots.at(-1)?.x ?? startX + 70) + 40"
      :y1="railY"
      :x2="seriesSlots.nodeX + 90"
      :y2="railY"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <!-- Output node -->
    <circle :cx="seriesSlots.nodeX" :cy="railY" r="3.5" fill="currentColor" />
    <text :x="seriesSlots.nodeX + 92" :y="railY - 12" class="fill-info text-[12px] font-medium">Vout</text>
    <circle :cx="seriesSlots.nodeX + 86" :cy="railY" r="3" fill="none" stroke="var(--ui-info)" stroke-width="1.5" />

    <!-- Shunt elements to ground -->
    <g v-for="(component, index) in shuntComponents" :key="component.id">
      <g :transform="`translate(${seriesSlots.nodeX + index * 70}, 0)`">
        <line :x1="0" :y1="railY" x2="0" :y2="railY + 24" stroke="currentColor" stroke-width="1.5" />
        <path
          v-if="component.symbol === 'R'"
          :d="resistorPath(0, railY + 56, true)"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <path
          v-else-if="component.symbol === 'L'"
          :d="inductorPath(0, railY + 56, true)"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <g v-else>
          <line x1="0" :y1="railY + 24" x2="0" :y2="railY + 52" stroke="currentColor" stroke-width="1.5" />
          <line
            v-for="plate in capacitorLeads(0, railY + 56, true)"
            :key="`${plate.x1}-${plate.y1}`"
            :x1="plate.x1"
            :y1="plate.y1"
            :x2="plate.x2"
            :y2="plate.y2"
            stroke="currentColor"
            stroke-width="1.75"
          />
          <line x1="0" :y1="railY + 60" x2="0" :y2="groundY - 10" stroke="currentColor" stroke-width="1.5" />
        </g>
        <line
          v-if="component.symbol !== 'C'"
          x1="0"
          :y1="railY + 84"
          x2="0"
          :y2="groundY - 10"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <text :x="18" :y="railY + 60" class="fill-primary text-[11px] font-medium">
          {{ componentLabel(component) }}
        </text>
        <line x1="-10" :y1="groundY - 10" x2="10" :y2="groundY - 10" stroke="currentColor" stroke-width="1.5" />
        <line x1="-6" :y1="groundY - 5" x2="6" :y2="groundY - 5" stroke="currentColor" stroke-width="1.5" />
        <line x1="-3" :y1="groundY" x2="3" :y2="groundY" stroke="currentColor" stroke-width="1.5" />
      </g>
    </g>

    <line x1="26" :y1="groundY - 10" x2="46" :y2="groundY - 10" stroke="currentColor" stroke-width="1.5" />
    <line x1="30" :y1="groundY - 5" x2="42" :y2="groundY - 5" stroke="currentColor" stroke-width="1.5" />
    <line x1="33" :y1="groundY" x2="39" :y2="groundY" stroke="currentColor" stroke-width="1.5" />
  </svg>
</template>
