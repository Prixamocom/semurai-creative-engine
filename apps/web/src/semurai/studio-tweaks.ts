/**
 * Design-wide "Tweaks": the CSS custom properties a design declares on its
 * root scope (`:root`, `html` or `body`) in its <style> blocks, grouped for the
 * Edit panel. Parsing works on the raw file text and remembers where each
 * value sits, so an edit replaces exactly that value and every other byte of
 * the file stays as authored (no DOM re-serialization).
 *
 * Only top-level rules count: overrides inside at-rules (for example a dark
 * `@media (prefers-color-scheme: dark) { :root { ... } }`) are left alone, and
 * when a variable is declared twice on the root scope the later one (the one
 * the cascade uses) is the one shown and edited.
 */

export type StudioTweakGroup = 'color' | 'type' | 'space' | 'other';
export type StudioTweakKind = 'color' | 'font' | 'length' | 'number' | 'text';
export interface StudioTweak {
  name: string;
  value: string;
  /** Offsets of the value in the file source (end exclusive, `!important` excluded). */
  start: number;
  end: number;
  group: StudioTweakGroup;
  kind: StudioTweakKind;
}

const ROOT_SELECTORS = new Set([':root', 'html', 'body']);
const NAMED_COLORS = new Set(['transparent', 'currentcolor', 'white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'yellow', 'purple', 'pink', 'navy', 'teal',
  'silver', 'maroon', 'olive', 'lime', 'aqua', 'fuchsia', 'brown', 'gold', 'indigo', 'violet', 'beige', 'ivory', 'coral', 'crimson', 'salmon', 'tomato', 'khaki', 'plum', 'tan']);
const COLOR_VALUE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(.*\))$/i;
const LENGTH_VALUE = /^-?(?:\d+\.?\d*|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|svh|dvh|pt|ch|ex)$/i;
const NUMBER_VALUE = /^-?(?:\d+\.?\d*|\.\d+)$/;
const GENERIC_FAMILY = /(^|,)\s*(serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-sans-serif|ui-serif|ui-monospace)\s*(,|$)/i;
const TYPE_NAME = /font|family|typeface|text|heading|display|body-size|leading|line|lh|tracking|letter|weight|size-(xs|sm|md|lg|xl)|h[1-6]\b/i;
const SPACE_NAME = /space|spacing|gap|pad|margin|gutter|inset|radius|rounded|round|corner|stack|indent|offset/i;
const COLOR_NAME = /colou?r|bg|background|fg|foreground|accent|brand|primary|secondary|tertiary|surface|ink|paper|muted|border|shadow-color|highlight|success|warning|danger|error|info/i;

export function isStudioColorValue(value: string): boolean {
  const text = value.trim();
  return COLOR_VALUE.test(text) || NAMED_COLORS.has(text.toLowerCase());
}

/** Field kind and panel group for one variable, from its value first and its name second. */
export function classifyStudioTweak(name: string, value: string): { group: StudioTweakGroup; kind: StudioTweakKind } {
  const text = value.trim();
  const byName = (): StudioTweakGroup => /colou?r|background|foreground|(^|-)(bg|fg)(-|$)/i.test(name) ? 'color'
    : TYPE_NAME.test(name) ? 'type' : SPACE_NAME.test(name) ? 'space' : COLOR_NAME.test(name) ? 'color' : 'other';
  // Values built from other variables are edited as text, grouped by their name.
  if (/var\(/i.test(text)) return { group: byName(), kind: 'text' };
  if (isStudioColorValue(text)) return { group: 'color', kind: 'color' };
  if (/font|family|typeface/i.test(name) && !/size|weight|height|leading|line|spacing|tracking/i.test(name)) return { group: 'type', kind: 'font' };
  if (GENERIC_FAMILY.test(text) || (/^["']/.test(text) && text.includes(','))) return { group: 'type', kind: 'font' };
  if (LENGTH_VALUE.test(text)) return { group: TYPE_NAME.test(name) ? 'type' : SPACE_NAME.test(name) ? 'space' : 'other', kind: 'length' };
  if (NUMBER_VALUE.test(text)) return { group: TYPE_NAME.test(name) ? 'type' : 'other', kind: 'number' };
  return { group: byName(), kind: 'text' };
}

/** Index just past a comment or string starting at `i`, or `i` when there is none. */
function skip(css: string, i: number): number {
  if (css[i] === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); return end < 0 ? css.length : end + 2; }
  if (css[i] === '"' || css[i] === "'") {
    const quote = css[i];
    for (let j = i + 1; j < css.length; j++) { if (css[j] === '\\') { j++; continue; } if (css[j] === quote || css[j] === '\n') return j + 1; }
    return css.length;
  }
  return i;
}

/** Index of the `}` closing the block whose `{` is at `open`. */
function closing(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const next = skip(css, i); if (next !== i) { i = next - 1; continue; }
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  return css.length;
}

function declarations(css: string, from: number, to: number, base: number, found: Map<string, StudioTweak>) {
  let start = from, parens = 0;
  const flush = (end: number) => {
    const segment = css.slice(start, end);
    const colon = segment.indexOf(':');
    if (colon > 0) {
      const name = segment.slice(0, colon).trim();
      if (/^--[A-Za-z0-9_-]+$/.test(name)) {
        let valueStart = start + colon + 1, valueEnd = end;
        while (valueStart < valueEnd && /\s/.test(css[valueStart]!)) valueStart++;
        while (valueEnd > valueStart && /\s/.test(css[valueEnd - 1]!)) valueEnd--;
        const important = /\s*!\s*important$/i.exec(css.slice(valueStart, valueEnd));
        if (important) valueEnd -= important[0].length;
        const value = css.slice(valueStart, valueEnd);
        // Later declarations win, as in the cascade; a Map keeps the first position, so the list order stays stable.
        found.set(name, { name, value, start: base + valueStart, end: base + valueEnd, ...classifyStudioTweak(name, value) });
      }
    }
    start = end + 1;
  };
  for (let i = from; i < to; i++) {
    const next = skip(css, i); if (next !== i) { i = next - 1; continue; }
    const char = css[i];
    if (char === '(') parens++;
    else if (char === ')') parens = Math.max(0, parens - 1);
    else if (char === ';' && parens === 0) flush(i);
    else if (char === '{') { i = closing(css, i); start = i + 1; }
  }
  if (start < to) flush(to);
}

function scanSheet(css: string, base: number, found: Map<string, StudioTweak>) {
  let selectorStart = 0;
  for (let i = 0; i < css.length; i++) {
    const next = skip(css, i); if (next !== i) { if (css[i] === '/') selectorStart = next; i = next - 1; continue; }
    if (css[i] === ';') { selectorStart = i + 1; continue; }
    if (css[i] === '}') { selectorStart = i + 1; continue; }
    if (css[i] !== '{') continue;
    const selector = css.slice(selectorStart, i).trim();
    const end = closing(css, i);
    if (!selector.startsWith('@') && selector.split(',').some(part => ROOT_SELECTORS.has(part.trim().toLowerCase()))) declarations(css, i + 1, end, base, found);
    i = end; selectorStart = end + 1;
  }
}

/** Root-scope custom properties of a file, in source order. */
export function studioTweaks(source: string): StudioTweak[] {
  const found = new Map<string, StudioTweak>();
  // Comments and scripts are skipped so a "<style" inside them is not read as a sheet.
  const pattern = /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[1] === undefined) continue;
    scanSheet(match[1], match.index + match[0].indexOf('>') + 1, found);
  }
  return [...found.values()];
}

export const STUDIO_TWEAK_GROUPS: StudioTweakGroup[] = ['color', 'type', 'space', 'other'];
export function studioTweakGroups(tweaks: StudioTweak[]): { group: StudioTweakGroup; items: StudioTweak[] }[] {
  return STUDIO_TWEAK_GROUPS.map(group => ({ group, items: tweaks.filter(item => item.group === group) })).filter(entry => entry.items.length > 0);
}

export type StudioTweakError = 'empty' | 'unsafe' | 'color';
/** Checks a typed value before it is written into the style sheet. */
export function studioTweakError(tweak: Pick<StudioTweak, 'kind'>, value: string): StudioTweakError | null {
  const text = value.trim();
  if (!text) return 'empty';
  // A value must stay inside its declaration: no statement or block breaks, no markup.
  if (/[;{}<>]|\/\*|\*\//.test(text)) return 'unsafe';
  let parens = 0, quote = '';
  for (const char of text) {
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(') parens++;
    else if (char === ')' && --parens < 0) return 'unsafe';
  }
  if (parens !== 0 || quote) return 'unsafe';
  if (tweak.kind === 'color' && !/var\(/i.test(text)) {
    const supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS.supports('color', text) : null;
    if (supported === false || (supported === null && !isStudioColorValue(text))) return 'color';
  }
  return null;
}

/**
 * Rewrites one variable's value and returns the new file source, or null when
 * the variable is gone or the value is unchanged. Every other byte is kept.
 */
export function setStudioTweak(source: string, name: string, value: string): string | null {
  const tweak = studioTweaks(source).find(item => item.name === name);
  const text = value.trim();
  if (!tweak || tweak.value === text) return null;
  return source.slice(0, tweak.start) + text + source.slice(tweak.end);
}

/**
 * ArrowUp/ArrowDown stepping for a variable: whole pixels (and %, pt, viewport
 * units), tenths for rem/em and small unitless numbers such as a line height,
 * hundreds for font weights. Shift multiplies the step by ten, except for weights.
 */
export function stepStudioTweak(value: string, direction: 1 | -1, large: boolean): string | null {
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i);
  if (!match) return null;
  const number = Number(match[1]); const unit = match[2]!.toLowerCase();
  const weight = !unit && Number.isInteger(number) && number >= 100 && number <= 1000 && number % 100 === 0;
  const fine = ['rem', 'em', 'ex'].includes(unit) || (!unit && !weight && (Math.abs(number) < 10 || !Number.isInteger(number)));
  const step = weight ? 100 : (fine ? 0.1 : 1) * (large ? 10 : 1);
  let next = Math.round((number + direction * step) * 1000) / 1000;
  if (weight) next = Math.max(100, Math.min(900, next));
  else if (number >= 0) next = Math.max(0, next);
  return String(next) + unit;
}
