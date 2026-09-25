import type { StudioCapturePlan } from './studio-capture';

/**
 * "Draw" sub-tool of the Comment mode: freehand pen, rectangle and arrow marks
 * drawn on a host-side layer above the preview, then sent to the chat as one
 * PNG (the preview viewport with the marks on top).
 *
 * Every point is in the preview's own CSS pixels, with 0,0 at the top-left of
 * the visible viewport, so the marks line up with a viewport capture however
 * far the canvas is zoomed.
 */

export type StudioDrawTool = 'pen' | 'rect' | 'arrow';
export interface StudioPoint { x: number; y: number }
export interface StudioStroke { tool: StudioDrawTool; color: string; width: number; points: StudioPoint[] }
export interface StudioDrawState { tool: StudioDrawTool; color: string; strokes: StudioStroke[]; draft: StudioStroke | null }
export type StudioDrawAction =
  | { type: 'tool'; tool: StudioDrawTool }
  | { type: 'color'; color: string }
  | { type: 'begin'; point: StudioPoint }
  | { type: 'move'; point: StudioPoint }
  | { type: 'end' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'clear' };

/** One accent (a clear red that reads on most designs) and two alternates. */
export const STUDIO_DRAW_COLORS = ['#e5484d', '#1a74ff', '#f5a524'] as const;
export const STUDIO_DRAW_WIDTH = 4;
/** Longest side of the annotated screenshot; the upload is resized to 1200px anyway. */
export const STUDIO_ANNOTATION_MAX_SIDE = 1600;
export const STUDIO_ANNOTATION_SCALE = 2;
/** Above this the PNG is re-encoded as JPEG to stay under the 6 MB media upload limit. */
export const STUDIO_ANNOTATION_PNG_LIMIT = 5_500_000;
const MAX_STROKES = 200;
const MAX_POINTS = 4000;
/** Rectangles and arrows smaller than this in both directions are treated as a slip. */
const MIN_SHAPE = 4;

export const initialStudioDraw: StudioDrawState = { tool: 'pen', color: STUDIO_DRAW_COLORS[0], strokes: [], draft: null };

function meaningful(stroke: StudioStroke): boolean {
  if (stroke.tool === 'pen') return stroke.points.length > 0;
  const [a, b] = stroke.points;
  return !!a && !!b && (Math.abs(b.x - a.x) >= MIN_SHAPE || Math.abs(b.y - a.y) >= MIN_SHAPE);
}

export function studioDrawReducer(state: StudioDrawState, action: StudioDrawAction): StudioDrawState {
  switch (action.type) {
    case 'tool': return { ...state, tool: action.tool, draft: null };
    case 'color': return { ...state, color: action.color };
    case 'begin': {
      if (state.strokes.length >= MAX_STROKES) return state;
      const point = action.point;
      return { ...state, draft: { tool: state.tool, color: state.color, width: STUDIO_DRAW_WIDTH, points: state.tool === 'pen' ? [point] : [point, point] } };
    }
    case 'move': {
      const draft = state.draft; if (!draft) return state;
      if (draft.tool !== 'pen') return { ...state, draft: { ...draft, points: [draft.points[0]!, action.point] } };
      const last = draft.points.at(-1)!;
      // Skip sub-pixel jitter and keep a long scribble bounded.
      if (Math.hypot(action.point.x - last.x, action.point.y - last.y) < 1.5 || draft.points.length >= MAX_POINTS) return state;
      return { ...state, draft: { ...draft, points: [...draft.points, action.point] } };
    }
    case 'end': {
      const draft = state.draft; if (!draft) return state;
      return { ...state, draft: null, strokes: meaningful(draft) ? [...state.strokes, draft] : state.strokes };
    }
    case 'cancel': return state.draft ? { ...state, draft: null } : state;
    case 'undo': return state.draft ? { ...state, draft: null } : state.strokes.length ? { ...state, strokes: state.strokes.slice(0, -1) } : state;
    case 'clear': return state.strokes.length || state.draft ? { ...state, strokes: [], draft: null } : state;
  }
}

/** The two barbs of an arrow head at `to`, sized to the line width. */
export function studioArrowHead(from: StudioPoint, to: StudioPoint, width = STUDIO_DRAW_WIDTH): [StudioPoint, StudioPoint] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(12, width * 4), spread = Math.PI / 7;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

const round = (value: number) => Math.round(value * 10) / 10;
/** SVG path data for a stroke; a pen dot becomes a tiny segment that round caps turn into a dot. */
export function studioStrokePath(stroke: StudioStroke): string {
  const [first, second] = stroke.points;
  if (!first) return '';
  if (stroke.tool === 'rect') {
    const end = second ?? first;
    const x = Math.min(first.x, end.x), y = Math.min(first.y, end.y), w = Math.abs(end.x - first.x), h = Math.abs(end.y - first.y);
    return `M${round(x)} ${round(y)}h${round(w)}v${round(h)}h${round(-w)}Z`;
  }
  if (stroke.tool === 'arrow') {
    const end = second ?? first;
    const [left, right] = studioArrowHead(first, end, stroke.width);
    return `M${round(first.x)} ${round(first.y)}L${round(end.x)} ${round(end.y)}M${round(left.x)} ${round(left.y)}L${round(end.x)} ${round(end.y)}L${round(right.x)} ${round(right.y)}`;
  }
  if (stroke.points.length === 1) return `M${round(first.x)} ${round(first.y)}l0.01 0`;
  return stroke.points.map((point, index) => (index ? 'L' : 'M') + round(point.x) + ' ' + round(point.y)).join('');
}

/** Paints the strokes onto a 2D context, scaled from preview CSS pixels to canvas pixels. */
export function paintStudioStrokes(context: CanvasRenderingContext2D, strokes: StudioStroke[], scaleX: number, scaleY = scaleX) {
  context.save();
  context.scale(scaleX, scaleY);
  context.lineCap = 'round'; context.lineJoin = 'round';
  for (const stroke of strokes) {
    const [first, second] = stroke.points;
    if (!first) continue;
    context.strokeStyle = stroke.color; context.lineWidth = stroke.width;
    context.beginPath();
    if (stroke.tool === 'rect') {
      const end = second ?? first;
      context.rect(Math.min(first.x, end.x), Math.min(first.y, end.y), Math.abs(end.x - first.x), Math.abs(end.y - first.y));
    } else if (stroke.tool === 'arrow') {
      const end = second ?? first;
      const [left, right] = studioArrowHead(first, end, stroke.width);
      context.moveTo(first.x, first.y); context.lineTo(end.x, end.y);
      context.moveTo(left.x, left.y); context.lineTo(end.x, end.y); context.lineTo(right.x, right.y);
    } else {
      context.moveTo(first.x, first.y);
      if (stroke.points.length === 1) context.lineTo(first.x + 0.01, first.y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  context.restore();
}

/**
 * Output size of the annotated screenshot and the factor from preview CSS
 * pixels to its pixels. The capture plan already capped the size; the factors
 * are taken per axis because the plan floors both sides.
 */
export function studioAnnotationSize(plan: Pick<StudioCapturePlan, 'clip' | 'width' | 'height'>): { width: number; height: number; scaleX: number; scaleY: number } {
  return { width: plan.width, height: plan.height, scaleX: plan.width / Math.max(1, plan.clip.width), scaleY: plan.height / Math.max(1, plan.clip.height) };
}

function loadImage(blob: Blob): Promise<CanvasImageSource & { close?: () => void }> {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Screenshot could not be read')); };
    image.src = url;
  });
}
function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Annotation could not be encoded')), type, quality));
}

/** The viewport screenshot with the strokes painted on top, as PNG (JPEG when the PNG would be too large to upload). */
export async function composeStudioAnnotation(screenshot: Blob, strokes: StudioStroke[], plan: Pick<StudioCapturePlan, 'clip' | 'width' | 'height'>): Promise<Blob> {
  const size = studioAnnotationSize(plan);
  const image = await loadImage(screenshot);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, 0, 0, size.width, size.height);
  image.close?.();
  paintStudioStrokes(context, strokes, size.scaleX, size.scaleY);
  const png = await encode(canvas, 'image/png');
  return png.size > STUDIO_ANNOTATION_PNG_LIMIT ? encode(canvas, 'image/jpeg', 0.9) : png;
}

export function studioBlobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.readAsDataURL(blob);
  });
}
