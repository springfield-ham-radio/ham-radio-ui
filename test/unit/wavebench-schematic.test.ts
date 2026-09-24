import { describe, expect, it } from 'vitest';
import { designFilter, type FilterDesign } from '../../app/utils/wavebench-filters.ts';
import {
  layoutSchematic,
  SCHEMATIC_GROUND_LEAD_Y,
  SCHEMATIC_OUTPUT_RAIL_PADDING,
  SCHEMATIC_RAIL_Y,
  SCHEMATIC_SOURCE_RADIUS,
  SCHEMATIC_SOURCE_X,
  type SchematicLayout,
} from '../../app/utils/wavebench-schematic.ts';

function lcLowPass(): FilterDesign {
  return designFilter({
    kind: 'low-pass',
    topology: 'lc',
    cutoffHz: 30_000_000,
    centerHz: 30_000_000,
    bandwidthHz: 2_000_000,
    resistanceOhms: 50,
  });
}

function lcHighPass(): FilterDesign {
  return designFilter({
    kind: 'high-pass',
    topology: 'lc',
    cutoffHz: 1_800_000,
    centerHz: 1_800_000,
    bandwidthHz: 200_000,
    resistanceOhms: 50,
  });
}

function rcLowPass(): FilterDesign {
  return designFilter({
    kind: 'low-pass',
    topology: 'rc',
    cutoffHz: 1_000,
    centerHz: 1_000,
    bandwidthHz: 200,
    resistanceOhms: 10_000,
  });
}

function bandPass(): FilterDesign {
  return designFilter({
    kind: 'band-pass',
    topology: 'lc',
    cutoffHz: 146_520_000,
    centerHz: 146_520_000,
    bandwidthHz: 4_000_000,
    resistanceOhms: 50,
  });
}

function seriesSlot(layout: SchematicLayout, id: string) {
  const slot = layout.seriesSlots.find((candidate) => candidate.component.id === id);

  expect(slot, `missing series part ${id}`).toEqual(expect.anything());

  return slot!;
}

function railWireFrom(layout: SchematicLayout, x1: number, x2: number) {
  return layout.seriesWires.find((wire) => {
    return wire.y1 === SCHEMATIC_RAIL_Y && wire.y2 === SCHEMATIC_RAIL_Y && wire.x1 === x1 && wire.x2 === x2;
  });
}

function assertContinuousRail(layout: SchematicLayout): void {
  const ranges = [
    ...layout.seriesSlots.map((slot) => [slot.left, slot.right] as [number, number]),
    ...layout.seriesWires.map((wire) => [Math.min(wire.x1, wire.x2), Math.max(wire.x1, wire.x2)] as [number, number]),
  ].sort((left, right) => left[0] - right[0]);

  expect(ranges.length).toBeGreaterThan(1);

  let coveredEnd = ranges[0]![1];

  for (const [rangeStart, rangeEnd] of ranges.slice(1)) {
    expect(rangeStart, 'series rail has a gap between parts').toBeLessThanOrEqual(coveredEnd);
    coveredEnd = Math.max(coveredEnd, rangeEnd);
  }

  expect(ranges[0]![0]).toBe(SCHEMATIC_SOURCE_X + SCHEMATIC_SOURCE_RADIUS);
  expect(coveredEnd).toBeGreaterThanOrEqual(layout.voutX);
}

describe('wavebench-schematic', () => {
  describe('layoutSchematic', () => {
    it('should wire the source resistor to the series inductor on an LC low-pass', () => {
      const layout = layoutSchematic(lcLowPass());
      const source = seriesSlot(layout, 'Rs');
      const inductor = seriesSlot(layout, 'L');

      expect(inductor.left).toBeGreaterThan(source.right);
      expect(railWireFrom(layout, source.right, inductor.left)).toEqual(expect.anything());
      assertContinuousRail(layout);
    });

    it('should wire the source resistor to the series capacitor on an LC high-pass', () => {
      const layout = layoutSchematic(lcHighPass());
      const source = seriesSlot(layout, 'Rs');
      const capacitor = seriesSlot(layout, 'C');

      expect(railWireFrom(layout, source.right, capacitor.left)).toEqual(expect.anything());
      assertContinuousRail(layout);
    });

    it('should wire the series capacitor to the series inductor on a band-pass', () => {
      const layout = layoutSchematic(bandPass());
      const capacitor = seriesSlot(layout, 'C');
      const inductor = seriesSlot(layout, 'L');

      expect(railWireFrom(layout, capacitor.right, inductor.left)).toEqual(expect.anything());
      assertContinuousRail(layout);
    });

    it('should keep a single series resistor connected from source to output on an RC low-pass', () => {
      const layout = layoutSchematic(rcLowPass());
      const resistor = seriesSlot(layout, 'R');

      expect(layout.seriesSlots).toHaveLength(1);
      expect(railWireFrom(layout, SCHEMATIC_SOURCE_X + SCHEMATIC_SOURCE_RADIUS, resistor.left)).toEqual(expect.anything());
      expect(railWireFrom(layout, resistor.right, layout.voutX + SCHEMATIC_OUTPUT_RAIL_PADDING)).toEqual(expect.anything());
      assertContinuousRail(layout);
    });

    it('should drop shunt leads from the rail onto each part body', () => {
      const layout = layoutSchematic(lcLowPass());

      expect(layout.shuntSlots.map((slot) => slot.component.id)).toEqual(['C', 'RL']);

      for (const slot of layout.shuntSlots) {
        const topLead = layout.shuntWires.find((wire) => {
          return wire.x1 === slot.x && wire.x2 === slot.x && wire.y1 === SCHEMATIC_RAIL_Y && wire.y2 === slot.top;
        });
        const bottomLead = layout.shuntWires.find((wire) => {
          return wire.x1 === slot.x && wire.x2 === slot.x && wire.y1 === slot.bottom && wire.y2 === SCHEMATIC_GROUND_LEAD_Y;
        });

        expect(topLead, `missing top lead for ${slot.component.id}`).toEqual(expect.anything());
        expect(bottomLead, `missing bottom lead for ${slot.component.id}`).toEqual(expect.anything());
        expect(slot.top).toBeGreaterThan(SCHEMATIC_RAIL_Y);
        expect(slot.bottom).toBeLessThan(SCHEMATIC_GROUND_LEAD_Y);
      }
    });
  });
});
