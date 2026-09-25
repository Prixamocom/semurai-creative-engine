/** Preset canvas zoom levels offered in the Studio zoom menu, in percent. */
export const STUDIO_ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;
export const STUDIO_ZOOM_MIN = 25;
export const STUDIO_ZOOM_MAX = 200;

/**
 * "Fit to width": the largest zoom (never above 100%) at which a device frame
 * of `deviceWidth` px fits the `available` canvas width. The desktop preview
 * (width 0) already fills the canvas, so it always fits at 100%.
 */
export function studioFitZoom(available: number, deviceWidth: number): number {
  if (!deviceWidth || !Number.isFinite(available) || available <= 0) return 100;
  return Math.max(STUDIO_ZOOM_MIN, Math.min(100, Math.floor(available / deviceWidth * 100)));
}

/** Next preset above (direction 1) or below (direction -1) the current zoom, clamped to the preset range. */
export function studioZoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) return STUDIO_ZOOM_STEPS.find(step => step > current) ?? STUDIO_ZOOM_STEPS[STUDIO_ZOOM_STEPS.length - 1]!;
  return [...STUDIO_ZOOM_STEPS].reverse().find(step => step < current) ?? STUDIO_ZOOM_STEPS[0]!;
}

/** Keyboard zoom shortcut for Ctrl/Cmd with +, - or 0, or null for any other key. */
export function studioZoomShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>): 'in' | 'out' | 'reset' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=') return 'in';
  if (event.key === '-' || event.key === '_') return 'out';
  if (event.key === '0') return 'reset';
  return null;
}
