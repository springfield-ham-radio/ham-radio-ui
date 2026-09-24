import { describe, expect, it } from 'vitest';
import {
  SCOPE_H_DIVS,
  SCOPE_V_DIVS,
  autoVoltsPerDiv,
  formatTimePerDiv,
  formatVoltsPerDiv,
  mapScopeX,
  mapScopeY,
  niceScopeStep,
  scopeDurationSeconds,
  scopeGraticule,
  scopePeakVoltage,
  scopeStackKeys,
  scopeStrips,
  scopeTimePerDiv,
  scopeTracePath,
  scopeViewportSize,
  visibleScopeChannels,
  type ScopeChannel,
} from '../../app/utils/wavebench-scope.ts';

function box() {
  return scopeViewportSize(640, 280);
}

function channel(id: string, voltages: number[], group?: string): ScopeChannel {
  return {
    id,
    label: id,
    color: '#0f0',
    group,
    samples: voltages.map((voltage, index) => ({ timeSeconds: index, voltage })),
  };
}

describe('wavebench-scope', () => {
  describe('scopeViewportSize', () => {
    it('should leave a CRT margin inside the measured tile', () => {
      const plot = scopeViewportSize(640, 280);

      expect(plot.width).toBe(640);
      expect(plot.height).toBe(280);
      expect(plot.plotWidth).toBe(640 - 36 - 12);
      expect(plot.plotHeight).toBe(280 - 12 - 12);
    });
  });

  describe('graticule', () => {
    it('should draw a 10×8 oscilloscope division grid', () => {
      const lines = scopeGraticule(box());

      expect(lines.majorVertical).toHaveLength(SCOPE_H_DIVS + 1);
      expect(lines.majorHorizontal).toHaveLength(SCOPE_V_DIVS + 1);
      expect(Math.abs((lines.axisX) - (box().left + box().plotWidth / 2))).toBeLessThanOrEqual(1e-9);
      expect(Math.abs((lines.axisY) - (box().top + box().plotHeight / 2))).toBeLessThanOrEqual(1e-9);
    });
  });

  describe('mapping', () => {
    it('should put t = 0 on the left and t = duration on the right', () => {
      const plot = box();

      expect(mapScopeX(0, 1, plot)).toBe(plot.left);
      expect(mapScopeX(1, 1, plot)).toBe(plot.left + plot.plotWidth);
    });

    it('should put 0 V on the strip center and a positive peak above it', () => {
      const plot = box();
      const strip = scopeStrips(plot, [channel('ch', [1])], 'overlay')[0]!;

      expect(Math.abs((mapScopeY(0, 1, strip)) - (strip.centerY))).toBeLessThanOrEqual(1e-9);
      expect(mapScopeY(1, 1, strip)).toBeLessThan(strip.centerY);
    });
  });

  describe('stacking', () => {
    it('should share one strip in overlay mode', () => {
      const strips = scopeStrips(box(), [channel('a', [1]), channel('b', [1])], 'overlay');
      expect(strips).toHaveLength(1);
    });

    it('should stack unique groups and keep an AM envelope on the AM strip', () => {
      const channels = [
        channel('carrier', [1]),
        channel('am', [1], 'am'),
        channel('env', [1], 'am'),
      ];

      expect(scopeStackKeys(channels)).toEqual(['carrier', 'am']);
      const strips = scopeStrips(box(), channels, 'stack');
      expect(strips).toHaveLength(2);
      expect(strips[1]!.top).toBeGreaterThan(strips[0]!.top);
      expect(strips[0]!.top + strips[0]!.height).toBeLessThan(strips[1]!.top + 1e-9);
    });

    it('should hide channels marked not visible', () => {
      const hidden: ScopeChannel = { ...channel('off', [1]), visible: false };
      expect(visibleScopeChannels([hidden, channel('on', [1])]).map((entry) => entry.id)).toEqual(['on']);
    });
  });

  describe('scale', () => {
    it('should pick 1-2-5 volts/div that fit the peak', () => {
      expect(niceScopeStep(0.3)).toBe(0.5);
      expect(autoVoltsPerDiv(1, 8)).toBe(0.5);
      expect(scopePeakVoltage([{ timeSeconds: 0, voltage: -1.4 }, { timeSeconds: 1, voltage: 0.2 }])).toBe(1.4);
    });

    it('should format CRT readouts', () => {
      expect(formatVoltsPerDiv(0.5)).toBe('500 mV/div');
      expect(formatTimePerDiv(1e-4)).toBe('100 µs/div');
      expect(scopeTimePerDiv(1e-3)).toBe(1e-4);
    });
  });

  describe('trace path', () => {
    it('should emit an SVG path across the screen', () => {
      const plot = box();
      const strip = scopeStrips(plot, [channel('ch', [0, 1])], 'overlay')[0]!;
      const path = scopeTracePath(channel('ch', [0, 1]).samples, 1, 1, plot, strip);

      expect(path.startsWith('M')).toBe(true);
      expect(path).toContain(' L');
      expect(scopeDurationSeconds([channel('ch', [0, 0, 0])])).toBe(2);
    });
  });
});
