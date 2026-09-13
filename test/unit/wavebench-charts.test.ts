import { describe, it } from 'node:test';
import { expect } from 'chai';
import { plotViewportSize, visibleWaveBenchCharts } from '../../app/utils/wavebench-charts.ts';

describe('wavebench-charts', () => {
  describe('visibleWaveBenchCharts', () => {
    it('should show only the selected chart in single layout', () => {
      expect(visibleWaveBenchCharts('single', 'phase')).to.deep.equal(['phase']);
    });

    it('should tile every chart in the same viewport in all layout', () => {
      expect(visibleWaveBenchCharts('all', 'magnitude')).to.deep.equal(['magnitude', 'phase', 'time']);
    });
  });

  describe('plotViewportSize', () => {
    it('should use the measured box so a wide tile is not letterboxed', () => {
      expect(plotViewportSize(900, 160)).to.deep.equal({ width: 900, height: 160 });
    });

    it('should fall back when the box has not been measured yet', () => {
      expect(plotViewportSize(0, 0, 640, 400)).to.deep.equal({ width: 640, height: 400 });
    });
  });
});
