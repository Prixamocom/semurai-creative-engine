import { normalizeManualEditStyles } from '../components/ManualEditPanel';
import type { ManualEditStyles } from '../edit-mode/types';
import type { StudioEditPanelCopy } from './studio-editor-copy';

export type StudioStyleKey = keyof ManualEditStyles;
export type StudioStyleCommit = { ok: true; styles: Partial<ManualEditStyles> } | { ok: false; error: string };

/**
 * Font choices must be the exact values upstream `normalizeManualEditStyles`
 * accepts (its FONT_OPTS are not exported); a test keeps the two in sync.
 */
export const STUDIO_FONT_OPTIONS = [
  { label: 'Space Grotesk', value: '"Space Grotesk", Inter, system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Roboto', value: 'Roboto, Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Monospace', value: 'SFMono-Regular, Consolas, "Liberation Mono", monospace' },
] as const;
export const STUDIO_FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
export const STUDIO_BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double'] as const;

const PERCENT_KEYS = new Set<StudioStyleKey>(['width', 'height', 'minHeight']);
const AUTO_KEYS = new Set<StudioStyleKey>(['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']);
const COLOR_KEYS = new Set<StudioStyleKey>(['color', 'backgroundColor', 'borderColor']);
const OPTION_KEYS = new Set<StudioStyleKey>(['fontFamily', 'fontWeight', 'textAlign', 'flexDirection', 'justifyContent', 'alignItems', 'borderStyle']);
const UNITLESS_KEYS = new Set<StudioStyleKey>(['opacity', 'lineHeight']);

/** Computed colors arrive as rgb()/rgba(); the source patcher only accepts hex. Transparent reads as empty. */
export function studioHexColor(value: string): string {
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return '#' + [...color.slice(1)].map(digit => digit + digit).join('');
  if (color === 'transparent') return '';
  const match = color.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (!match) return color;
  const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1);
  if (alpha === 0) return '';
  return '#' + [match[1], match[2], match[3]].map(part => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0')).join('');
}

/**
 * Shown value for a style field: hex colors, and lengths as written when
 * `exact` (typed by the user or inline in the source). Measured values are
 * rounded for reading: whole pixels from 10px up, one decimal below 10px.
 */
export function studioStyleDisplay(key: StudioStyleKey, value: string | undefined, exact = false): string {
  const raw = (value ?? '').trim();
  if (COLOR_KEYS.has(key)) return studioHexColor(raw);
  if (exact) return raw;
  const match = raw.match(/^(-?\d*\.?\d+)(px|%)?$/i);
  if (!match) return raw;
  const number = Number(match[1]); const unit = match[2]?.toLowerCase() ?? '';
  const rounded = unit === 'px' ? (Math.abs(number) >= 10 ? Math.round(number) : Math.round(number * 10) / 10) : Math.round(number * 100) / 100;
  return String(rounded === 0 ? 0 : rounded) + unit;
}

function invalidMessage(key: StudioStyleKey, copy: StudioEditPanelCopy): string {
  if (COLOR_KEYS.has(key)) return copy.invalidColor;
  if (key === 'opacity') return copy.invalidOpacity;
  if (key === 'lineHeight') return copy.invalidLineHeight;
  if (OPTION_KEYS.has(key)) return copy.invalidOption;
  if (PERCENT_KEYS.has(key)) return copy.invalidLengthPercent;
  if (AUTO_KEYS.has(key)) return copy.invalidLengthAuto;
  return copy.invalidLength;
}

/**
 * Validate one or more edited properties through the upstream normalizer and
 * return only those properties, so a commit never writes untouched styles.
 */
export function studioStyleCommit(styles: Partial<ManualEditStyles>, layoutEnabled: boolean, copy: StudioEditPanelCopy): StudioStyleCommit {
  const result = normalizeManualEditStyles(styles, { layoutEnabled });
  if (!result.ok) return { ok: false, error: invalidMessage(Object.keys(styles)[0] as StudioStyleKey, copy) };
  return { ok: true, styles: result.styles };
}

/** ArrowUp/ArrowDown stepping; Shift multiplies the step by ten. Returns null for non-numeric text. */
export function stepStudioValue(key: StudioStyleKey, value: string, direction: 1 | -1, large: boolean): string | null {
  const text = value.trim() || (UNITLESS_KEYS.has(key) ? '' : '0px');
  const match = text.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!match) return null;
  const unit = match[2]!.toLowerCase() || (UNITLESS_KEYS.has(key) ? '' : 'px');
  const step = (UNITLESS_KEYS.has(key) && !unit ? 0.1 : 1) * (large ? 10 : 1);
  let next = Math.round((Number(match[1]) + direction * step) * 100) / 100;
  if (key === 'opacity') next = Math.max(0, Math.min(1, next));
  else if (!AUTO_KEYS.has(key) && key !== 'letterSpacing') next = Math.max(0, next);
  return String(next) + unit;
}

/** Four sides of a padding or margin box, in top/right/bottom/left order. */
export function studioSideKeys(box: 'padding' | 'margin'): [StudioStyleKey, StudioStyleKey, StudioStyleKey, StudioStyleKey] {
  return box === 'padding' ? ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] : ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'];
}
