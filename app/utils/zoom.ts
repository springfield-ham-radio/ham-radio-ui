export const ZOOM_IN_COMMAND = 'zoom_in_command';
export const ZOOM_OUT_COMMAND = 'zoom_out_command';
export const ZOOM_RESET_COMMAND = 'zoom_reset_command';
export const ZOOM_BY_COMMAND = 'zoom_by_command';

/** Scales a trackpad or mouse-wheel delta into a zoom multiplier. */
const WHEEL_ZOOM_SENSITIVITY = 0.002;

type ZoomKeyEvent = {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

/**
 * Extra zoom shortcuts the View menu does not bind.
 * Command/Ctrl with =, -, and 0 are menu accelerators.
 */
export function zoomCommandForKey(event: ZoomKeyEvent): string | undefined {
  if (event.altKey || event.metaKey === event.ctrlKey) {
    return undefined;
  }

  if (event.key === '+' || event.code === 'NumpadAdd') {
    return ZOOM_IN_COMMAND;
  }

  if (event.code === 'NumpadSubtract') {
    return ZOOM_OUT_COMMAND;
  }

  if (event.code === 'Numpad0') {
    return ZOOM_RESET_COMMAND;
  }

  return undefined;
}

export function wheelZoomMultiplier(deltaY: number): number {
  return Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
}
