/**
 * Host side of the Studio PNG export. The preview iframe measures a target and
 * renders a clip of its own document (STUDIO_CAPTURE_BRIDGE); this module
 * turns the measurement into a clip rectangle in document coordinates, caps
 * the output at a size every browser canvas can hold and exchanges the
 * messages with the frame.
 */

export type StudioCaptureTarget =
  | { kind: 'page' }
  /** What the preview shows right now: its visible viewport at the current scroll. */
  | { kind: 'viewport' }
  | { kind: 'slide'; index: number }
  | { kind: 'element'; elementId?: string; selector?: string };

export interface StudioCaptureRect { x: number; y: number; width: number; height: number }
export interface StudioCaptureMeasure {
  rect: StudioCaptureRect;
  scroll: { x: number; y: number };
  document: { width: number; height: number };
  background: string;
  label: string;
  /** The element or an ancestor is position: fixed, so it sits at its viewport position. */
  fixed?: boolean;
  /** How far a sticky ancestor moved the element away from its flow position. */
  correction?: { x: number; y: number };
  /** Deck slides: the stage's on-screen box and its natural (unscaled) size. */
  stage?: StudioCaptureRect & { naturalWidth: number; naturalHeight: number };
}
export interface StudioCapturePlan {
  clip: StudioCaptureRect;
  document: { width: number; height: number };
  stage: boolean;
  scale: number;
  width: number;
  height: number;
  /** The requested scale was reduced to fit the size limits. */
  capped: boolean;
}

/** Retina output by default. */
export const STUDIO_CAPTURE_SCALE = 2;
/** Largest canvas side Chromium, Firefox and Safari all accept. */
export const STUDIO_CAPTURE_MAX_SIDE = 16_384;
/** Total pixel budget, well under every browser's canvas area limit and memory friendly. */
export const STUDIO_CAPTURE_MAX_PIXELS = 48_000_000;
export const STUDIO_CAPTURE_MEASURE_TIMEOUT_MS = 5_000;
export const STUDIO_CAPTURE_RENDER_TIMEOUT_MS = 90_000;

export type StudioCaptureErrorCode = 'unavailable' | 'not-found' | 'empty' | 'empty-render' | 'tainted' | 'timeout' | 'failed' | 'clipboard-unsupported' | 'clipboard-denied';
export class StudioCaptureError extends Error {
  constructor(readonly code: StudioCaptureErrorCode) { super('Studio capture failed: ' + code); this.name = 'StudioCaptureError'; }
}

const finite = (value: unknown, limit = 1_000_000): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const rectOk = (rect: unknown): rect is StudioCaptureRect => {
  const value = rect as StudioCaptureRect | undefined;
  return !!value && finite(value.x) && finite(value.y) && finite(value.width) && finite(value.height) && value.width >= 0 && value.height >= 0;
};

/**
 * Clip rectangle and output size for a measurement. Element boxes arrive in
 * viewport coordinates; the render covers the whole document from its origin,
 * so the scroll offset is added back (except for fixed elements, which the
 * render also places at their viewport position, and minus any sticky shift).
 * Deck elements are mapped from the scaled stage to its natural 1920x1080 space.
 * Returns null when nothing visible is left after clamping to the document.
 */
export function studioCapturePlan(measure: StudioCaptureMeasure, options: { scale?: number; maxSide?: number; maxPixels?: number } = {}): StudioCapturePlan | null {
  const { scale = STUDIO_CAPTURE_SCALE, maxSide = STUDIO_CAPTURE_MAX_SIDE, maxPixels = STUDIO_CAPTURE_MAX_PIXELS } = options;
  const { rect } = measure;
  let x: number, y: number, width: number, height: number, documentWidth: number, documentHeight: number;
  const stage = measure.stage;
  if (stage && stage.width > 0 && stage.height > 0) {
    const kx = stage.naturalWidth / stage.width, ky = stage.naturalHeight / stage.height;
    x = (rect.x - stage.x) * kx; y = (rect.y - stage.y) * ky; width = rect.width * kx; height = rect.height * ky;
    documentWidth = stage.naturalWidth; documentHeight = stage.naturalHeight;
  } else {
    const scrollX = measure.fixed ? 0 : measure.scroll.x, scrollY = measure.fixed ? 0 : measure.scroll.y;
    x = rect.x + scrollX - (measure.correction?.x ?? 0); y = rect.y + scrollY - (measure.correction?.y ?? 0);
    width = rect.width; height = rect.height;
    documentWidth = measure.document.width; documentHeight = measure.document.height;
  }
  const left = Math.max(0, Math.floor(x)), top = Math.max(0, Math.floor(y));
  const right = Math.min(documentWidth, Math.ceil(x + width)), bottom = Math.min(documentHeight, Math.ceil(y + height));
  if (right - left < 1 || bottom - top < 1) return null;
  const clip = { x: left, y: top, width: right - left, height: bottom - top };
  const limit = Math.min(scale, maxSide / clip.width, maxSide / clip.height, Math.sqrt(maxPixels / (clip.width * clip.height)));
  const used = Math.min(scale, Math.floor(limit * 100) / 100);
  return {
    clip, document: { width: Math.ceil(documentWidth), height: Math.ceil(documentHeight) }, stage: !!stage, scale: used,
    width: Math.max(1, Math.floor(clip.width * used)), height: Math.max(1, Math.floor(clip.height * used)), capped: used < scale,
  };
}

function readMeasure(data: Record<string, unknown>): StudioCaptureMeasure {
  const scroll = data.scroll as StudioCaptureMeasure['scroll'] | undefined;
  const size = data.document as StudioCaptureMeasure['document'] | undefined;
  if (!rectOk(data.rect) || !scroll || !finite(scroll.x) || !finite(scroll.y) || !size || !finite(size.width) || !finite(size.height)) throw new StudioCaptureError('failed');
  const measure: StudioCaptureMeasure = {
    rect: data.rect, scroll: { x: scroll.x, y: scroll.y }, document: { width: size.width, height: size.height },
    background: typeof data.background === 'string' && data.background.length < 80 ? data.background : '#ffffff',
    label: typeof data.label === 'string' ? data.label.slice(0, 120) : '', fixed: data.fixed === true,
  };
  const correction = data.correction as { x: unknown; y: unknown } | undefined;
  if (correction && finite(correction.x) && finite(correction.y)) measure.correction = { x: correction.x, y: correction.y };
  const stage = data.stage as StudioCaptureMeasure['stage'];
  if (stage && rectOk(stage) && finite(stage.naturalWidth) && finite(stage.naturalHeight) && stage.naturalWidth > 0 && stage.naturalHeight > 0) measure.stage = stage;
  return measure;
}

let sequence = 0;
function exchange(frame: Window, message: Record<string, unknown>, reply: string, timeoutMs: number, timeoutCode: StudioCaptureErrorCode): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = 'semurai-capture-' + Date.now().toString(36) + '-' + (++sequence);
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
    const receive = (event: MessageEvent) => {
      const data = event.data as Record<string, unknown> | null;
      if (event.source !== frame || !data || data.type !== reply || data.id !== id) return;
      cleanup();
      const codes: StudioCaptureErrorCode[] = ['not-found', 'empty-render', 'tainted', 'failed'];
      if (typeof data.error === 'string') reject(new StudioCaptureError(codes.includes(data.error as StudioCaptureErrorCode) ? data.error as StudioCaptureErrorCode : 'failed'));
      else resolve(data);
    };
    const timer = setTimeout(() => { cleanup(); reject(new StudioCaptureError(timeoutCode)); }, timeoutMs);
    window.addEventListener('message', receive);
    try { frame.postMessage({ ...message, id }, '*'); } catch { cleanup(); reject(new StudioCaptureError('unavailable')); }
  });
}

export interface StudioCaptureResult { blob: Blob; plan: StudioCapturePlan; label: string }

/** Measure, plan and render one PNG in the preview frame. */
export async function captureStudioPng(frame: Window | null | undefined, target: StudioCaptureTarget, options: { scale?: number; maxSide?: number; measureTimeoutMs?: number; renderTimeoutMs?: number } = {}): Promise<StudioCaptureResult> {
  if (!frame) throw new StudioCaptureError('unavailable');
  const measured = readMeasure(await exchange(frame, { type: 'semurai:capture-measure', target }, 'semurai:capture-measure:result', options.measureTimeoutMs ?? STUDIO_CAPTURE_MEASURE_TIMEOUT_MS, 'unavailable'));
  const plan = studioCapturePlan(measured, { scale: options.scale, maxSide: options.maxSide });
  if (!plan) throw new StudioCaptureError('empty');
  const rendered = await exchange(frame, { type: 'semurai:capture-render', clip: plan.clip, document: plan.document, stage: plan.stage, width: plan.width, height: plan.height, background: measured.background },
    'semurai:capture-render:result', options.renderTimeoutMs ?? STUDIO_CAPTURE_RENDER_TIMEOUT_MS, 'timeout');
  const blob = rendered.blob;
  if (!(blob instanceof Blob) || !blob.size) throw new StudioCaptureError('empty-render');
  return { blob, plan, label: measured.label };
}

/** Copies a PNG to the system clipboard; needs a fresh user gesture in most browsers. */
export async function copyStudioImage(blob: Blob, clipboard: Clipboard | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard): Promise<void> {
  if (!clipboard || typeof clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') throw new StudioCaptureError('clipboard-unsupported');
  try { await clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch { throw new StudioCaptureError('clipboard-denied'); }
}

/** The user-facing message for a capture or clipboard failure. */
export function studioCaptureMessage(error: unknown, copy: Record<'unavailable' | 'notFound' | 'empty' | 'emptyRender' | 'tainted' | 'timeout' | 'failed' | 'clipboardUnsupported' | 'clipboardDenied', string>): string {
  const code = error instanceof StudioCaptureError ? error.code : 'failed';
  const keys: Record<StudioCaptureErrorCode, keyof typeof copy> = {
    unavailable: 'unavailable', 'not-found': 'notFound', empty: 'empty', 'empty-render': 'emptyRender', tainted: 'tainted', timeout: 'timeout', failed: 'failed',
    'clipboard-unsupported': 'clipboardUnsupported', 'clipboard-denied': 'clipboardDenied',
  };
  return copy[keys[code]];
}

/** ASCII slug for file names: "Łódź Café 2027" -> "lodz-cafe-2027". */
export function studioSlug(value: string, max = 60): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

/** `<project-slug>-<element-or-page>`, without the extension. */
export function studioPngFileName(title: string, part: string): string {
  return [studioSlug(title) || 'semurai', studioSlug(part, 40)].filter(Boolean).join('-');
}
