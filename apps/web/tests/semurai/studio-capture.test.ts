// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureStudioPng, copyStudioImage, STUDIO_CAPTURE_MAX_SIDE, StudioCaptureError, studioCaptureMessage, studioCapturePlan, studioPngFileName, studioSlug,
  type StudioCaptureMeasure,
} from '../../src/semurai/studio-capture';
import { studioCaptureCopy } from '../../src/semurai/studio-editor-copy';
import { studioPreviewSource } from '../../src/semurai/studio-preview';

const measure = (overrides: Partial<StudioCaptureMeasure> = {}): StudioCaptureMeasure => ({
  rect: { x: 100, y: 50, width: 300, height: 200 }, scroll: { x: 0, y: 0 }, document: { width: 1440, height: 5000 }, background: '#fff', label: 'article-card', ...overrides,
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('PNG clip plan', () => {
  it('adds the scroll offset back for an element below the fold and renders at 2x', () => {
    expect(studioCapturePlan(measure({ scroll: { x: 0, y: 1200 } }))).toEqual({
      clip: { x: 100, y: 1250, width: 300, height: 200 }, document: { width: 1440, height: 5000 }, stage: false, scale: 2, width: 600, height: 400, capped: false,
    });
    // Horizontal scroll counts too; fractional boxes grow to whole pixels.
    expect(studioCapturePlan(measure({ rect: { x: 10.4, y: 20.6, width: 99.2, height: 50 }, scroll: { x: 30, y: 400 } }))!.clip).toEqual({ x: 40, y: 420, width: 100, height: 51 });
  });

  it('keeps fixed elements at their viewport position and undoes a sticky shift', () => {
    expect(studioCapturePlan(measure({ scroll: { x: 0, y: 1200 }, fixed: true }))!.clip).toEqual({ x: 100, y: 50, width: 300, height: 200 });
    // A sticky header pinned at the top after scrolling 1200px sits at y=0 in the render.
    expect(studioCapturePlan(measure({ rect: { x: 0, y: 0, width: 1440, height: 80 }, scroll: { x: 0, y: 1200 }, correction: { x: 0, y: 1200 } }))!.clip).toEqual({ x: 0, y: 0, width: 1440, height: 80 });
  });

  it('covers the whole document for a page capture regardless of scroll', () => {
    const plan = studioCapturePlan(measure({ rect: { x: 0, y: -900, width: 1440, height: 5000 }, scroll: { x: 0, y: 900 } }))!;
    expect(plan.clip).toEqual({ x: 0, y: 0, width: 1440, height: 5000 });
    expect([plan.width, plan.height, plan.capped]).toEqual([2880, 10000, false]);
  });

  it('clamps to the document and returns null when nothing visible is left', () => {
    expect(studioCapturePlan(measure({ rect: { x: -20, y: 4950, width: 300, height: 200 } }))!.clip).toEqual({ x: 0, y: 4950, width: 280, height: 50 });
    expect(studioCapturePlan(measure({ rect: { x: 100, y: 50, width: 0, height: 200 } }))).toBeNull();
    expect(studioCapturePlan(measure({ rect: { x: 2000, y: 50, width: 300, height: 200 } }))).toBeNull();
  });

  it('maps deck elements from the scaled stage to the natural 1920x1080 slide', () => {
    const plan = studioCapturePlan(measure({ rect: { x: 200, y: 100, width: 480, height: 54 }, scroll: { x: 0, y: 500 }, stage: { x: 100, y: 50, width: 960, height: 540, naturalWidth: 1920, naturalHeight: 1080 } }))!;
    expect(plan).toMatchObject({ clip: { x: 200, y: 100, width: 960, height: 108 }, document: { width: 1920, height: 1080 }, stage: true, width: 1920, height: 216 });
  });

  it('caps very large captures at the side and pixel limits and says so', () => {
    const tall = studioCapturePlan(measure({ rect: { x: 0, y: 0, width: 1440, height: 20_000 }, document: { width: 1440, height: 20_000 } }))!;
    expect(tall.capped).toBe(true);
    expect(tall.height).toBeLessThanOrEqual(STUDIO_CAPTURE_MAX_SIDE);
    expect(tall.scale).toBe(0.81);
    const square = studioCapturePlan(measure({ rect: { x: 0, y: 0, width: 4000, height: 4000 }, document: { width: 4000, height: 4000 } }))!;
    expect(square.scale).toBe(1.73);
    expect(square.width * square.height).toBeLessThanOrEqual(48_000_000);
    expect(studioCapturePlan(measure(), { scale: 1 })).toMatchObject({ scale: 1, width: 300, capped: false });
  });
});

describe('PNG file names', () => {
  it('slugs the project title and the exported part', () => {
    expect(studioSlug('Łódź Café 2027 (dev)')).toBe('lodz-cafe-2027-dev');
    expect(studioPngFileName('Lumen Coffee Roasters', 'article-card')).toBe('lumen-coffee-roasters-article-card');
    expect(studioPngFileName('Prezentacja: Wyniki', 'slajd-3')).toBe('prezentacja-wyniki-slajd-3');
    expect(studioPngFileName('***', 'strona')).toBe('semurai-strona');
  });
});

function frame() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  return iframe.contentWindow!;
}
/** Answers the host's capture messages the way the preview bridge does. */
function answer(win: Window, reply: (message: Record<string, unknown>) => Record<string, unknown> | null) {
  const sent: Record<string, unknown>[] = [];
  vi.spyOn(win, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
    sent.push(message);
    const data = reply(message);
    if (data) queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { ...data, id: message.id }, source: win })));
  }) as typeof win.postMessage);
  return sent;
}
const measured = { rect: { x: 100, y: 50, width: 300, height: 200 }, scroll: { x: 0, y: 1200 }, document: { width: 1440, height: 5000 }, background: 'rgb(255, 255, 255)', label: 'article-card' };

describe('capture exchange with the preview frame', () => {
  it('measures, then renders the planned clip and returns the PNG', async () => {
    const win = frame();
    const png = new Blob(['png'], { type: 'image/png' });
    const sent = answer(win, message => message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured }
      : { type: 'semurai:capture-render:result', blob: png, width: 600, height: 400 });
    const result = await captureStudioPng(win, { kind: 'element', elementId: 'hero' });
    expect(result.blob).toBe(png);
    expect(result.label).toBe('article-card');
    expect(sent[0]).toMatchObject({ type: 'semurai:capture-measure', target: { kind: 'element', elementId: 'hero' } });
    expect(sent[1]).toMatchObject({ type: 'semurai:capture-render', clip: { x: 100, y: 1250, width: 300, height: 200 }, width: 600, height: 400, background: 'rgb(255, 255, 255)', stage: false });
  });

  it('turns every failure into a coded error', async () => {
    await expect(captureStudioPng(null, { kind: 'page' })).rejects.toMatchObject({ code: 'unavailable' });
    const missing = frame();
    answer(missing, () => ({ type: 'semurai:capture-measure:result', error: 'not-found' }));
    await expect(captureStudioPng(missing, { kind: 'element', elementId: 'gone' })).rejects.toMatchObject({ code: 'not-found' });
    const tainted = frame();
    answer(tainted, message => message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured } : { type: 'semurai:capture-render:result', error: 'tainted' });
    await expect(captureStudioPng(tainted, { kind: 'page' })).rejects.toMatchObject({ code: 'tainted' });
    const empty = frame();
    answer(empty, () => ({ type: 'semurai:capture-measure:result', ...measured, rect: { x: 0, y: 0, width: 0, height: 0 } }));
    await expect(captureStudioPng(empty, { kind: 'page' })).rejects.toMatchObject({ code: 'empty' });
    const blank = frame();
    answer(blank, message => message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured } : { type: 'semurai:capture-render:result', blob: new Blob([]) });
    await expect(captureStudioPng(blank, { kind: 'page' })).rejects.toMatchObject({ code: 'empty-render' });
    // No bridge in the frame: the measurement never answers.
    const silent = frame();
    answer(silent, () => null);
    await expect(captureStudioPng(silent, { kind: 'page' }, { measureTimeoutMs: 20 })).rejects.toMatchObject({ code: 'unavailable' });
    const slow = frame();
    answer(slow, message => message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured } : null);
    await expect(captureStudioPng(slow, { kind: 'page' }, { renderTimeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
  });

  it('ignores answers from other frames', async () => {
    const win = frame(); const other = frame();
    vi.spyOn(win, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'semurai:capture-measure:result', id: message.id, ...measured }, source: other })));
    }) as typeof win.postMessage);
    await expect(captureStudioPng(win, { kind: 'page' }, { measureTimeoutMs: 30 })).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('clipboard copy', () => {
  class FakeItem { constructor(readonly items: Record<string, Blob>) {} }
  it('writes the PNG as image/png', async () => {
    vi.stubGlobal('ClipboardItem', FakeItem);
    const write = vi.fn(async () => {});
    const png = new Blob(['png'], { type: 'image/png' });
    await copyStudioImage(png, { write } as unknown as Clipboard);
    expect((write.mock.calls[0] as unknown as [FakeItem[]])[0][0]!.items).toEqual({ 'image/png': png });
  });
  it('reports a denied or unsupported clipboard', async () => {
    vi.stubGlobal('ClipboardItem', FakeItem);
    await expect(copyStudioImage(new Blob(['x']), { write: vi.fn(async () => { throw new Error('NotAllowedError'); }) } as unknown as Clipboard)).rejects.toMatchObject({ code: 'clipboard-denied' });
    await expect(copyStudioImage(new Blob(['x']), undefined)).rejects.toMatchObject({ code: 'clipboard-unsupported' });
    vi.stubGlobal('ClipboardItem', undefined);
    await expect(copyStudioImage(new Blob(['x']), { write: vi.fn() } as unknown as Clipboard)).rejects.toMatchObject({ code: 'clipboard-unsupported' });
  });
  it('shows a Polish message for each failure', () => {
    const pl = studioCaptureCopy.pl;
    expect(studioCaptureMessage(new StudioCaptureError('tainted'), pl)).toBe(pl.tainted);
    expect(studioCaptureMessage(new StudioCaptureError('clipboard-denied'), pl)).toBe(pl.clipboardDenied);
    expect(studioCaptureMessage(new Error('boom'), pl)).toBe(pl.failed);
  });
});

describe('capture bridge injection', () => {
  it('ships the capture bridge only in the live preview, not in thumbnails', () => {
    const page = '<!doctype html><html><head></head><body><h1>Hi</h1></body></html>';
    expect(studioPreviewSource(page, 0, false, false, false, true)).toContain('semurai:capture-measure');
    expect(studioPreviewSource(page, 0, false, false)).not.toContain('semurai:capture-measure');
  });
});
