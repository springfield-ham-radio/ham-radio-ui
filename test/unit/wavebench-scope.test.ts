import { describe, it } from 'node:test';
import { expect } from 'chai';
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

      expect(plot.width).to.equal(640);
      expect(plot.height).to.equal(280);
      expect(plot.plotWidth).to.equal(640 - 36 - 12);
      expect(plot.plotHeight).to.equal(280 - 12 - 12);
    });
  });

  describe('graticule', () => {
    it('should draw a 10×8 oscilloscope division grid', () => {
      const lines = scopeGraticule(box());

      expect(lines.majorVertical).to.have.length(SCOPE_H_DIVS + 1);
      expect(lines.majorHorizontal).to.have.length(SCOPE_V_DIVS + 1);
      expect(lines.axisX).to.be.closeTo(box().left + box().plotWidth / 2, 1e-9);
      expect(lines.axisY).to.be.closeTo(box().top + box().plotHeight / 2, 1e-9);
    });
  });

  describe('mapping', () => {
    it('should put t = 0 on the left and t = duration on the right', () => {
      const plot = box();

      expect(mapScopeX(0, 1, plot)).to.equal(plot.left);
      expect(mapScopeX(1, 1, plot)).to.equal(plot.left + plot.plotWidth);
    });

    it('should put 0 V on the strip center and a positive peak above it', () => {
      const plot = box();
      const strip = scopeStrips(plot, [channel('ch', [1])], 'overlay')[0]!;

      expect(mapScopeY(0, 1, strip)).to.be.closeTo(strip.centerY, 1e-9);
      expect(mapScopeY(1, 1, strip)).to.be.lessThan(strip.centerY);
    });
  });

  describe('stacking', () => {
    it('should share one strip in overlay mode', () => {
      const strips = scopeStrips(box(), [channel('a', [1]), channel('b', [1])], 'overlay');
      expect(strips).to.have.length(1);
    });

    it('should stack unique groups and keep an AM envelope on the AM strip', () => {
      const channels = [
        channel('carrier', [1]),
        channel('am', [1], 'am'),
        channel('env', [1], 'am'),
      ];

      expect(scopeStackKeys(channels)).to.deep.equal(['carrier', 'am']);
      const strips = scopeStrips(box(), channels, 'stack');
      expect(strips).to.have.length(2);
      expect(strips[1]!.top).to.be.greaterThan(strips[0]!.top);
      expect(strips[0]!.top + strips[0]!.height).to.be.lessThan(strips[1]!.top + 1e-9);
    });

    it('should hide channels marked not visible', () => {
      const hidden: ScopeChannel = { ...channel('off', [1]), visible: false };
      expect(visibleScopeChannels([hidden, channel('on', [1])]).map((entry) => entry.id)).to.deep.equal(['on']);
    });
  });

  describe('scale', () => {
    it('should pick 1-2-5 volts/div that fit the peak', () => {
      expect(niceScopeStep(0.3)).to.equal(0.5);
      expect(autoVoltsPerDiv(1, 8)).to.equal(0.5);
      expect(scopePeakVoltage([{ timeSeconds: 0, voltage: -1.4 }, { timeSeconds: 1, voltage: 0.2 }])).to.equal(1.4);
    });

    it('should format CRT readouts', () => {
      expect(formatVoltsPerDiv(0.5)).to.equal('500 mV/div');
      expect(formatTimePerDiv(1e-4)).to.equal('100 µs/div');
      expect(scopeTimePerDiv(1e-3)).to.equal(1e-4);
    });
  });

  describe('trace path', () => {
    it('should emit an SVG path across the screen', () => {
      const plot = box();
      const strip = scopeStrips(plot, [channel('ch', [0, 1])], 'overlay')[0]!;
      const path = scopeTracePath(channel('ch', [0, 1]).samples, 1, 1, plot, strip);

      expect(path.startsWith('M')).to.equal(true);
      expect(path).to.include(' L');
      expect(scopeDurationSeconds([channel('ch', [0, 0, 0])])).to.equal(2);
    });
  });
});
