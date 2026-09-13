import type { FilterComponent, FilterComponentSymbol, FilterDesign } from './wavebench-filters';

export const SCHEMATIC_WIDTH = 720;
export const SCHEMATIC_HEIGHT = 220;
export const SCHEMATIC_RAIL_Y = 88;
export const SCHEMATIC_GROUND_Y = 188;
export const SCHEMATIC_SOURCE_X = 36;
export const SCHEMATIC_SOURCE_RADIUS = 14;
export const SCHEMATIC_FIRST_SERIES_X = 106;
export const SCHEMATIC_SERIES_PITCH = 110;
export const SCHEMATIC_NODE_GAP = 10;
export const SCHEMATIC_SHUNT_PITCH = 70;
export const SCHEMATIC_VOUT_OFFSET = 86;
export const SCHEMATIC_OUTPUT_RAIL_PADDING = 4;
export const SCHEMATIC_GROUND_LEAD_Y = SCHEMATIC_GROUND_Y - 10;
export const SCHEMATIC_SHUNT_BODY_CENTER_Y = SCHEMATIC_RAIL_Y + 56;

const SERIES_HALF_WIDTH: Record<FilterComponentSymbol, number> = {
  R: 36,
  C: 36,
  L: 40,
};

const SHUNT_HALF_HEIGHT: Record<FilterComponentSymbol, number> = {
  R: 28,
  C: 4,
  L: 32,
};

export interface SchematicWire {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SchematicSeriesSlot {
  component: FilterComponent;
  x: number;
  left: number;
  right: number;
}

export interface SchematicShuntSlot {
  component: FilterComponent;
  x: number;
  top: number;
  bottom: number;
}

export interface SchematicLayout {
  seriesSlots: SchematicSeriesSlot[];
  shuntSlots: SchematicShuntSlot[];
  nodeX: number;
  voutX: number;
  seriesWires: SchematicWire[];
  shuntWires: SchematicWire[];
}

/**
 * Places filter parts on a shared source-to-load rail.
 *
 * Each series symbol is shorter than the slot pitch, so the schematic has to
 * draw the leftover wire. Without those spans, the source resistor never
 * reaches the inductor or capacitor that follows it.
 */
export function layoutSchematic(design: FilterDesign): SchematicLayout {
  const seriesComponents = design.components.filter((component) => {
    return component.role === 'series' || component.role === 'source';
  });
  const shuntComponents = design.components.filter((component) => {
    return component.role === 'shunt' || component.role === 'load';
  });

  const seriesSlots: SchematicSeriesSlot[] = [];
  let seriesX = SCHEMATIC_FIRST_SERIES_X;

  for (const component of seriesComponents) {
    const halfWidth = SERIES_HALF_WIDTH[component.symbol];
    seriesSlots.push({
      component,
      x: seriesX,
      left: seriesX - halfWidth,
      right: seriesX + halfWidth,
    });
    seriesX += SCHEMATIC_SERIES_PITCH;
  }

  const nodeX = seriesX + SCHEMATIC_NODE_GAP;
  const voutX = nodeX + SCHEMATIC_VOUT_OFFSET;
  const sourceWireStartX = SCHEMATIC_SOURCE_X + SCHEMATIC_SOURCE_RADIUS;
  const seriesWires: SchematicWire[] = [];
  const firstSlot = seriesSlots[0];
  const lastSlot = seriesSlots.at(-1);

  if (firstSlot) {
    seriesWires.push(horizontalWire(sourceWireStartX, firstSlot.left));
  }

  for (let index = 0; index < seriesSlots.length - 1; index += 1) {
    const current = seriesSlots[index]!;
    const next = seriesSlots[index + 1]!;
    seriesWires.push(horizontalWire(current.right, next.left));
  }

  if (lastSlot) {
    seriesWires.push(horizontalWire(lastSlot.right, voutX + SCHEMATIC_OUTPUT_RAIL_PADDING));
  }

  const shuntSlots: SchematicShuntSlot[] = shuntComponents.map((component, index) => {
    const halfHeight = SHUNT_HALF_HEIGHT[component.symbol];

    return {
      component,
      x: nodeX + index * SCHEMATIC_SHUNT_PITCH,
      top: SCHEMATIC_SHUNT_BODY_CENTER_Y - halfHeight,
      bottom: SCHEMATIC_SHUNT_BODY_CENTER_Y + halfHeight,
    };
  });

  const shuntWires: SchematicWire[] = [];

  for (const slot of shuntSlots) {
    shuntWires.push({
      x1: slot.x,
      y1: SCHEMATIC_RAIL_Y,
      x2: slot.x,
      y2: slot.top,
    });
    shuntWires.push({
      x1: slot.x,
      y1: slot.bottom,
      x2: slot.x,
      y2: SCHEMATIC_GROUND_LEAD_Y,
    });
  }

  return {
    seriesSlots,
    shuntSlots,
    nodeX,
    voutX,
    seriesWires,
    shuntWires,
  };
}

function horizontalWire(x1: number, x2: number): SchematicWire {
  return {
    x1,
    y1: SCHEMATIC_RAIL_Y,
    x2,
    y2: SCHEMATIC_RAIL_Y,
  };
}
