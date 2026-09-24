import { describe, expect, it } from 'vitest';
import { plotViewportSize, visibleWaveBenchCharts } from '../../app/utils/wavebench-charts.ts';

describe('wavebench-charts', () => {
  describe('visibleWaveBenchCharts', () => {
    it('should show only the selected chart in single layout', () => {
      expect(visibleWaveBenchCharts('single', 'phase')).toEqual(['phase']);
    });

    it('should tile every chart in the same viewport in all layout', () => {
      expect(visibleWaveBenchCharts('all', 'magnitude')).toEqual(['magnitude', 'phase', 'time']);
    });
  });

  describe('plotViewportSize', () => {
    it('should use the measured box so a wide tile is not letterboxed', () => {
      expect(plotViewportSize(900, 160)).toEqual({ width: 900, height: 160 });
    });

    it('should fall back when the box has not been measured yet', () => {
      expect(plotViewportSize(0, 0, 640, 400)).toEqual({ width: 640, height: 400 });
    });
  });
});
