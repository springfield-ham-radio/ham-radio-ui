export type WaveBenchChartId = 'magnitude' | 'phase' | 'time';
export type WaveBenchChartLayout = 'single' | 'all';

export const WAVEBENCH_CHART_IDS: WaveBenchChartId[] = ['magnitude', 'phase', 'time'];

/**
 * Charts that should occupy the shared plot viewport.
 *
 * One large plot is the default so Bode magnitude stays on screen. "All"
 * tiles the same viewport instead of stacking plots into a scroll.
 */
export function visibleWaveBenchCharts(
  layout: WaveBenchChartLayout,
  selected: WaveBenchChartId,
): WaveBenchChartId[] {
  if (layout === 'all') {
    return [...WAVEBENCH_CHART_IDS];
  }

  return [selected];
}

const MIN_PLOT_WIDTH = 160;
const MIN_PLOT_HEIGHT = 120;

/**
 * Map a plot's CSS box to an SVG viewBox so the chart fills the panel
 * instead of letterboxing a fixed 640×N aspect ratio.
 */
export function plotViewportSize(
  clientWidth: number,
  clientHeight: number,
  fallbackWidth = 640,
  fallbackHeight = 232,
): { width: number; height: number } {
  return {
    width: Math.max(MIN_PLOT_WIDTH, clientWidth > 0 ? clientWidth : fallbackWidth),
    height: Math.max(MIN_PLOT_HEIGHT, clientHeight > 0 ? clientHeight : fallbackHeight),
  };
}
