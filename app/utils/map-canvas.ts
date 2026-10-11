import type { StyleSpecification } from 'maplibre-gl';

/** Background-only style when tiles are offline or fail to load. Markers still draw. */
export const CHANNEL_MAP_EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'channel-map-background',
      type: 'background',
      paint: {
        'background-color': '#1e293b',
      },
    },
  ],
};

/** True when the active style is the offline empty background (not a remote tile URL). */
export function mapCanvasUsesEmptyStyle(style: string | StyleSpecification): boolean {
  return style === CHANNEL_MAP_EMPTY_STYLE;
}
