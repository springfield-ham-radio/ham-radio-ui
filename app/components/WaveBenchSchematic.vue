<script setup lang="ts">
import { formatComponentValue, type FilterComponent, type FilterDesign } from '~/utils/wavebench-filters';
import {
  layoutSchematic,
  SCHEMATIC_GROUND_LEAD_Y,
  SCHEMATIC_GROUND_Y,
  SCHEMATIC_HEIGHT,
  SCHEMATIC_RAIL_Y,
  SCHEMATIC_SHUNT_BODY_CENTER_Y,
  SCHEMATIC_SOURCE_RADIUS,
  SCHEMATIC_SOURCE_X,
  SCHEMATIC_WIDTH,
} from '~/utils/wavebench-schematic';

const props = defineProps<{
  design: FilterDesign;
}>();

const layout = computed(() => layoutSchematic(props.design));

function componentLabel(component: FilterComponent): string {
  return `${component.id} ${formatComponentValue(component.symbol, component.value)}`;
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
    :viewBox="`0 0 ${SCHEMATIC_WIDTH} ${SCHEMATIC_HEIGHT}`"
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
    <circle :cx="SCHEMATIC_SOURCE_X" :cy="SCHEMATIC_RAIL_Y" r="14" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M 28 88 Q 32 80 36 88 Q 40 96 44 88" fill="none" stroke="currentColor" stroke-width="1.25" />
    <text :x="SCHEMATIC_SOURCE_X" y="58" text-anchor="middle" class="fill-muted text-[11px]">Vin</text>
    <line
      :x1="SCHEMATIC_SOURCE_X"
      :y1="SCHEMATIC_RAIL_Y + SCHEMATIC_SOURCE_RADIUS"
      :x2="SCHEMATIC_SOURCE_X"
      :y2="SCHEMATIC_GROUND_LEAD_Y"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <line
      v-for="(wire, index) in layout.seriesWires"
      :key="`series-wire-${index}`"
      :x1="wire.x1"
      :y1="wire.y1"
      :x2="wire.x2"
      :y2="wire.y2"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <!-- Series elements -->
    <g v-for="slot in layout.seriesSlots" :key="slot.component.id">
      <path
        v-if="slot.component.symbol === 'R'"
        :d="resistorPath(slot.x, SCHEMATIC_RAIL_Y)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        v-else-if="slot.component.symbol === 'L'"
        :d="inductorPath(slot.x, SCHEMATIC_RAIL_Y)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <g v-else>
        <line
          :x1="slot.left"
          :y1="SCHEMATIC_RAIL_Y"
          :x2="slot.x - 4"
          :y2="SCHEMATIC_RAIL_Y"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <line
          :x1="slot.x + 4"
          :y1="SCHEMATIC_RAIL_Y"
          :x2="slot.right"
          :y2="SCHEMATIC_RAIL_Y"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <line
          v-for="plate in capacitorLeads(slot.x, SCHEMATIC_RAIL_Y)"
          :key="`${plate.x1}-${plate.y1}`"
          :x1="plate.x1"
          :y1="plate.y1"
          :x2="plate.x2"
          :y2="plate.y2"
          stroke="currentColor"
          stroke-width="1.75"
        />
      </g>
      <text :x="slot.x" :y="SCHEMATIC_RAIL_Y - 22" text-anchor="middle" class="fill-primary text-[11px] font-medium">
        {{ componentLabel(slot.component) }}
      </text>
    </g>

    <!-- Output node -->
    <circle :cx="layout.nodeX" :cy="SCHEMATIC_RAIL_Y" r="3.5" fill="currentColor" />
    <text :x="layout.voutX + 6" :y="SCHEMATIC_RAIL_Y - 12" class="fill-info text-[12px] font-medium">Vout</text>
    <circle :cx="layout.voutX" :cy="SCHEMATIC_RAIL_Y" r="3" fill="none" stroke="var(--ui-info)" stroke-width="1.5" />

    <line
      v-for="(wire, index) in layout.shuntWires"
      :key="`shunt-wire-${index}`"
      :x1="wire.x1"
      :y1="wire.y1"
      :x2="wire.x2"
      :y2="wire.y2"
      stroke="currentColor"
      stroke-width="1.5"
    />

    <!-- Shunt elements to ground -->
    <g v-for="slot in layout.shuntSlots" :key="slot.component.id" :transform="`translate(${slot.x}, 0)`">
      <path
        v-if="slot.component.symbol === 'R'"
        :d="resistorPath(0, SCHEMATIC_SHUNT_BODY_CENTER_Y, true)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        v-else-if="slot.component.symbol === 'L'"
        :d="inductorPath(0, SCHEMATIC_SHUNT_BODY_CENTER_Y, true)"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <g v-else>
        <line
          v-for="plate in capacitorLeads(0, SCHEMATIC_SHUNT_BODY_CENTER_Y, true)"
          :key="`${plate.x1}-${plate.y1}`"
          :x1="plate.x1"
          :y1="plate.y1"
          :x2="plate.x2"
          :y2="plate.y2"
          stroke="currentColor"
          stroke-width="1.75"
        />
      </g>
      <text :x="18" :y="SCHEMATIC_SHUNT_BODY_CENTER_Y + 4" class="fill-primary text-[11px] font-medium">
        {{ componentLabel(slot.component) }}
      </text>
      <line x1="-10" :y1="SCHEMATIC_GROUND_LEAD_Y" x2="10" :y2="SCHEMATIC_GROUND_LEAD_Y" stroke="currentColor" stroke-width="1.5" />
      <line x1="-6" :y1="SCHEMATIC_GROUND_Y - 5" x2="6" :y2="SCHEMATIC_GROUND_Y - 5" stroke="currentColor" stroke-width="1.5" />
      <line x1="-3" :y1="SCHEMATIC_GROUND_Y" x2="3" :y2="SCHEMATIC_GROUND_Y" stroke="currentColor" stroke-width="1.5" />
    </g>

    <line x1="26" :y1="SCHEMATIC_GROUND_LEAD_Y" x2="46" :y2="SCHEMATIC_GROUND_LEAD_Y" stroke="currentColor" stroke-width="1.5" />
    <line x1="30" :y1="SCHEMATIC_GROUND_Y - 5" x2="42" :y2="SCHEMATIC_GROUND_Y - 5" stroke="currentColor" stroke-width="1.5" />
    <line x1="33" :y1="SCHEMATIC_GROUND_Y" x2="39" :y2="SCHEMATIC_GROUND_Y" stroke="currentColor" stroke-width="1.5" />
  </svg>
</template>
