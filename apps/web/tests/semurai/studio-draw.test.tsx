// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { studioCapturePlan } from '../../src/semurai/studio-capture';
import {
  initialStudioDraw, paintStudioStrokes, STUDIO_ANNOTATION_MAX_SIDE, STUDIO_DRAW_COLORS, studioAnnotationSize, studioArrowHead, studioDrawReducer, studioStrokePath,
  type StudioDrawAction, type StudioDrawState,
} from '../../src/semurai/studio-draw';

// The canvas composite needs a real 2D context; the editor flow gets a stand-in PNG.
const composed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/semurai/studio-draw', async original => {
  const actual = await original<typeof import('../../src/semurai/studio-draw')>();
  return { ...actual, composeStudioAnnotation: vi.fn(async (...args: unknown[]) => { composed.calls.push(args); return new Blob(['annotated'], { type: 'image/png' }); }) };
});

const run = (actions: StudioDrawAction[], state: StudioDrawState = initialStudioDraw) => actions.reduce(studioDrawReducer, state);

describe('draw tool state', () => {
  it('draws pen strokes point by point, skipping jitter', () => {
    const state = run([{ type: 'begin', point: { x: 10, y: 10 } }, { type: 'move', point: { x: 10.5, y: 10.5 } }, { type: 'move', point: { x: 30, y: 12 } }, { type: 'end' }]);
    expect(state.draft).toBeNull();
    expect(state.strokes).toEqual([{ tool: 'pen', color: STUDIO_DRAW_COLORS[0], width: 4, points: [{ x: 10, y: 10 }, { x: 30, y: 12 }] }]);
    // A click is a dot.
    expect(run([{ type: 'begin', point: { x: 5, y: 5 } }, { type: 'end' }]).strokes).toHaveLength(1);
  });

  it('keeps rectangles and arrows as two points, drops slips, and uses the chosen tool and color', () => {
    const state = run([
      { type: 'tool', tool: 'rect' }, { type: 'color', color: STUDIO_DRAW_COLORS[1] },
      { type: 'begin', point: { x: 100, y: 80 } }, { type: 'move', point: { x: 60, y: 40 } }, { type: 'move', point: { x: 20, y: 10 } }, { type: 'end' },
      { type: 'tool', tool: 'arrow' }, { type: 'begin', point: { x: 0, y: 0 } }, { type: 'move', point: { x: 2, y: 3 } }, { type: 'end' },
      { type: 'begin', point: { x: 0, y: 0 } }, { type: 'move', point: { x: 50, y: 0 } }, { type: 'end' },
    ]);
    expect(state.strokes.map(stroke => [stroke.tool, stroke.color, stroke.points])).toEqual([
      ['rect', STUDIO_DRAW_COLORS[1], [{ x: 100, y: 80 }, { x: 20, y: 10 }]],
      ['arrow', STUDIO_DRAW_COLORS[1], [{ x: 0, y: 0 }, { x: 50, y: 0 }]],
    ]);
    expect(studioStrokePath(state.strokes[0]!)).toBe('M20 10h80v70h-80Z');
  });

  it('undoes the last mark (or the one in progress), cancels and clears', () => {
    const drawn = run([{ type: 'begin', point: { x: 0, y: 0 } }, { type: 'move', point: { x: 9, y: 9 } }, { type: 'end' }, { type: 'begin', point: { x: 20, y: 20 } }, { type: 'end' }]);
    expect(drawn.strokes).toHaveLength(2);
    const inProgress = run([{ type: 'begin', point: { x: 1, y: 1 } }], drawn);
    expect(studioDrawReducer(inProgress, { type: 'undo' })).toEqual(drawn);
    expect(studioDrawReducer(inProgress, { type: 'cancel' })).toEqual(drawn);
    expect(studioDrawReducer(drawn, { type: 'undo' }).strokes).toHaveLength(1);
    expect(studioDrawReducer(drawn, { type: 'clear' }).strokes).toEqual([]);
    expect(studioDrawReducer(initialStudioDraw, { type: 'undo' })).toBe(initialStudioDraw);
  });

  it('draws an arrow head at the end of the line', () => {
    const [left, right] = studioArrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(left.x).toBeCloseTo(100 - 16 * Math.cos(Math.PI / 7));
    expect(left.y).toBeCloseTo(16 * Math.sin(Math.PI / 7));
    expect(right.y).toBeCloseTo(-left.y);
  });
});

describe('annotated screenshot size', () => {
  it('caps a 2x viewport capture at the longest side and maps preview pixels onto it', () => {
    // A 1440x900 viewport scrolled 1200px down a 5000px page.
    const plan = studioCapturePlan({ rect: { x: 0, y: 0, width: 1440, height: 900 }, scroll: { x: 0, y: 1200 }, document: { width: 1440, height: 5000 }, background: '#fff', label: '' },
      { scale: 2, maxSide: STUDIO_ANNOTATION_MAX_SIDE })!;
    expect(plan.clip).toEqual({ x: 0, y: 1200, width: 1440, height: 900 });
    expect(plan.capped).toBe(true);
    const size = studioAnnotationSize(plan);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(STUDIO_ANNOTATION_MAX_SIDE);
    expect([size.width, size.height]).toEqual([1598, 999]);
    expect(size.scaleX).toBeCloseTo(1598 / 1440);
    expect(size.scaleY).toBeCloseTo(999 / 900);
    // A small phone viewport keeps the full 2x.
    const phone = studioAnnotationSize(studioCapturePlan({ rect: { x: 0, y: 0, width: 390, height: 700 }, scroll: { x: 0, y: 0 }, document: { width: 390, height: 3000 }, background: '#fff', label: '' }, { scale: 2, maxSide: STUDIO_ANNOTATION_MAX_SIDE })!);
    expect(phone).toEqual({ width: 780, height: 1400, scaleX: 2, scaleY: 2 });
  });

  it('paints the marks scaled onto the screenshot', () => {
    const calls: string[] = [];
    const context = new Proxy({}, { get: (_, key) => typeof key === 'string' && ['strokeStyle', 'lineWidth', 'lineCap', 'lineJoin'].includes(key) ? undefined : (...args: unknown[]) => { calls.push(String(key) + '(' + args.join(',') + ')'); },
      set: (_, key, value) => { calls.push(String(key) + '=' + value); return true; } }) as unknown as CanvasRenderingContext2D;
    paintStudioStrokes(context, [{ tool: 'rect', color: '#e5484d', width: 4, points: [{ x: 30, y: 40 }, { x: 10, y: 20 }] }], 2);
    expect(calls).toEqual(['save()', 'scale(2,2)', 'lineCap=round', 'lineJoin=round', 'strokeStyle=#e5484d', 'lineWidth=4', 'beginPath()', 'rect(10,20,20,20)', 'stroke()', 'restore()']);
  });
});

const projectId = '11111111-2222-4333-8444-555555555555';
const page = '<!doctype html><html><head></head><body><h1 data-od-id="hero">Welcome</h1></body></html>';
function context(): StudioContext {
  return {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
}
let uploads: Record<string, unknown>[] = [];
let posts: string[] = [];
let uploadFails = false;
let captureTargets: unknown[] = [];
beforeEach(() => {
  localStorage.clear(); uploads = []; posts = []; uploadFails = false; captureTargets = []; composed.calls = [];
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint = String(url).split('/project/')[1]!;
    if (init?.method === 'POST') posts.push(endpoint);
    if (endpoint === 'media/upload') {
      uploads.push(JSON.parse(String(init?.body)));
      if (uploadFails) return new Response('{}', { status: 422 });
      return new Response(JSON.stringify({ data: { id: 'shot-1', title: 'Marks on the preview', description: '', dataUrl: 'data:image/webp;base64,AAAA' } }), { status: 201 });
    }
    const data = endpoint === 'document' ? { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html: page, notes: [] } } : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
  // jsdom has no layout: the drawing layer is an 800x600 box at the origin.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) as DOMRect);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!;
/** Answers the viewport capture the way the preview bridge does. */
function bridge() {
  const win = frame().contentWindow!;
  vi.spyOn(win, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
    if (message.type === 'semurai:capture-measure') captureTargets.push(message.target);
    const reply = message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', rect: { x: 0, y: 0, width: 800, height: 600 }, scroll: { x: 0, y: 300 }, document: { width: 800, height: 2000 }, background: '#fff', label: '' }
      : message.type === 'semurai:capture-render' ? { type: 'semurai:capture-render:result', blob: new Blob(['png'], { type: 'image/png' }), width: 1600, height: 1200 } : null;
    if (reply) queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { ...reply, id: message.id }, source: win })));
  }) as typeof win.postMessage);
}
async function openDraw() {
  render(<StudioEditor context={context()} onClose={() => {}} />);
  await waitFor(() => expect(frame()?.srcdoc).toBeTruthy());
  bridge();
  fireEvent.click(within(screen.getByRole('group', { name: 'Tools' })).getByRole('button', { name: /^Comment/ }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Selection method' })).getByRole('button', { name: 'Draw' }));
  return screen.getByTestId('studio-draw-layer');
}
function stroke(layer: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(layer, { pointerId: 1, clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2 });
  fireEvent.pointerUp(layer, { pointerId: 1, clientX: to[0], clientY: to[1] });
}
const toolbar = () => screen.getByRole('toolbar', { name: 'Drawing' });

describe('Draw on the preview and send to chat', () => {
  it('draws on the layer, then attaches the annotated viewport to the composer with a note, without sending', async () => {
    const layer = await openDraw();
    expect(layer.getAttribute('role')).toBe('application');
    const send = within(toolbar()).getByRole('button', { name: 'Send to chat' });
    expect(send.hasAttribute('disabled')).toBe(true);

    stroke(layer, [100, 100], [300, 120]);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Arrow' }));
    fireEvent.click(within(toolbar()).getByRole('radio', { name: 'Blue' }));
    stroke(layer, [400, 400], [200, 200]);
    expect(layer.querySelectorAll('path')).toHaveLength(2);
    expect(layer.querySelectorAll('path')[1]!.getAttribute('stroke')).toBe(STUDIO_DRAW_COLORS[1]);

    fireEvent.click(send);
    await waitFor(() => expect(uploads).toHaveLength(1));
    // The visible viewport is captured, and both marks are composited in preview pixels.
    expect(captureTargets).toEqual([{ kind: 'viewport' }]);
    const [, strokes, plan] = composed.calls[0] as [Blob, { tool: string; points: { x: number; y: number }[] }[], { clip: unknown }];
    expect(strokes.map(item => [item.tool, item.points[0], item.points.at(-1)])).toEqual([['pen', { x: 100, y: 100 }, { x: 300, y: 120 }], ['arrow', { x: 400, y: 400 }, { x: 200, y: 200 }]]);
    expect(plan.clip).toEqual({ x: 0, y: 300, width: 800, height: 600 });
    expect(uploads[0]).toMatchObject({ title: 'Marks on the preview' });
    expect(String(uploads[0]!.image_data)).toMatch(/^data:image\/png;base64,/);

    // Back in the chat: the screenshot is attached, the note is prefilled and focused, nothing was sent.
    const composer = await screen.findByRole('textbox', { name: 'What would you like to change?' }) as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toBe('See the marks on the screenshot: '));
    expect(screen.getByRole('img', { name: 'Marks on the preview' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(composer));
    expect(posts).not.toContain('jobs');
    expect(screen.queryByTestId('studio-draw-layer')).toBeNull();
  });

  it('keeps the drawing and offers the PNG when the upload fails', async () => {
    uploadFails = true;
    const downloads: string[] = [];
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:png'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    const layer = await openDraw();
    stroke(layer, [10, 10], [200, 50]);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Send to chat' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be attached');
    expect(layer.querySelectorAll('path')).toHaveLength(1);
    fireEvent.click(within(alert).getByRole('button', { name: 'Download PNG' }));
    expect(downloads).toEqual(['landing-marks-on-the-preview.png']);
  });

  it('asks before leaving Comment mode with unsent marks, and Escape only ends drawing', async () => {
    const layer = await openDraw();
    stroke(layer, [10, 10], [200, 50]);
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Undo last mark' }));
    expect(layer.querySelectorAll('path')).toHaveLength(0);
    stroke(layer, [10, 10], [200, 50]);

    // Escape leaves the Draw sub-tool; the marks stay visible (not interactive) in Comment mode.
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(within(screen.getByRole('group', { name: 'Selection method' })).getByRole('button', { name: 'Element' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
    expect(screen.getByTestId('studio-draw-layer').getAttribute('aria-hidden')).toBe('true');

    const tools = screen.getByRole('group', { name: 'Tools' });
    fireEvent.click(within(tools).getByRole('button', { name: 'Select' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Discard the drawing?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('studio-draw-layer').querySelectorAll('path')).toHaveLength(1);

    fireEvent.click(within(tools).getByRole('button', { name: 'Select' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard drawing' }));
    expect(screen.getByRole('textbox', { name: 'What would you like to change?' })).toBeTruthy();
    fireEvent.click(within(tools).getByRole('button', { name: /^Comment/ }));
    expect(screen.queryByTestId('studio-draw-layer')).toBeNull();
    // Leaving without marks needs no question.
    fireEvent.click(within(tools).getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('studio-edit-panel')).toBeTruthy();
  });
});
