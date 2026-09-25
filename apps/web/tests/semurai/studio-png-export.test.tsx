// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';

const projectId = '11111111-2222-4333-8444-555555555555';
const page = '<!doctype html><html><head></head><body><h1 data-od-id="hero">Welcome</h1></body></html>';
const deck = '<!doctype html><html><head></head><body><div class="deck-stage"><section class="slide active"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div></body></html>';
let html = page;
function context(artifactType = 'page', uiLocale: 'en' | 'pl' = 'en'): StudioContext {
  return {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Łódź Landing', artifactType, locale: uiLocale, sourceLocale: uiLocale, uiLocale, direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
}
const measured = { rect: { x: 10, y: 20, width: 300, height: 100 }, scroll: { x: 0, y: 800 }, document: { width: 1200, height: 3000 }, background: 'rgb(255, 255, 255)', label: 'h1-hero' };
let downloads: string[] = [];
let sent: Record<string, unknown>[] = [];
let renderReply: Record<string, unknown> = {};

beforeEach(() => {
  localStorage.clear(); downloads = []; sent = []; html = page;
  renderReply = { type: 'semurai:capture-render:result', blob: new Blob(['png'], { type: 'image/png' }), width: 600, height: 200 };
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const endpoint = String(url).split('/project/')[1];
    const data = endpoint === 'document' ? { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html, notes: ['', ''] } } : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:png'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"], iframe[title="Podgląd"]')!;
/** Stands in for the capture bridge inside the preview frame. */
function bridge() {
  const win = frame().contentWindow!;
  vi.spyOn(win, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
    if (String(message.type).startsWith('semurai:capture-')) sent.push(message);
    const reply = message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured } : message.type === 'semurai:capture-render' ? renderReply : null;
    if (reply) queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { ...reply, id: message.id }, source: win })));
  }) as typeof win.postMessage);
  return win;
}
function fromFrame(data: Record<string, unknown>) {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data, source: frame().contentWindow })); });
}
async function open(artifactType = 'page', locale: 'en' | 'pl' = 'en') {
  render(<StudioEditor context={context(artifactType, locale)} onClose={() => {}} />);
  await waitFor(() => expect(frame()?.srcdoc).toBeTruthy());
  return bridge();
}
function exportMenu(name = 'Export') {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('menu');
}

describe('PNG export menu', () => {
  it('offers the whole page and element picking for pages', async () => {
    await open();
    expect(within(exportMenu()).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['HTML + CSS', 'PNG: whole page', 'PNG: pick an element', 'Print / PDF', 'Saved exports']);
  });

  it('offers the current slide for decks and uses Polish labels', async () => {
    html = deck;
    await open('presentation', 'pl');
    expect(within(exportMenu('Eksport')).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['HTML + CSS', 'PowerPoint', 'PNG: bieżący slajd', 'PNG: wybierz element', 'Drukuj / PDF', 'Zapisane eksporty']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'PNG: bieżący slajd' }));
    await waitFor(() => expect(downloads).toEqual(['lodz-landing-slajd-1.png']));
    expect(sent[0]).toMatchObject({ type: 'semurai:capture-measure', target: { kind: 'slide', index: 0 } });
  });

  it('is unavailable in the Source view', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    const menu = exportMenu();
    expect(within(menu).getByRole('menuitem', { name: 'PNG: whole page' }).hasAttribute('disabled')).toBe(true);
    expect(within(menu).getByRole('menuitem', { name: 'PNG: pick an element' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('PNG capture flow', () => {
  it('downloads the whole page as <project>-<part>.png and offers the clipboard', async () => {
    await open();
    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: whole page' }));
    await screen.findByText('Downloaded lodz-landing-page.png');
    expect(downloads).toEqual(['lodz-landing-page.png']);
    expect(sent[0]).toMatchObject({ type: 'semurai:capture-measure', target: { kind: 'page' } });
    expect(sent[1]).toMatchObject({ type: 'semurai:capture-render', clip: { x: 10, y: 820, width: 300, height: 100 }, width: 600, height: 200 });

    const write = vi.fn(async () => {});
    vi.stubGlobal('ClipboardItem', class { constructor(readonly items: Record<string, Blob>) {} });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await screen.findByText('Image copied');
    expect(write).toHaveBeenCalledOnce();
  });

  it('reports a clipboard refusal and keeps the copy action for another try', async () => {
    await open();
    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: whole page' }));
    await screen.findByText('Downloaded lodz-landing-page.png');
    vi.stubGlobal('ClipboardItem', class { constructor(readonly items: Record<string, Blob>) {} });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: vi.fn(async () => { throw new Error('denied'); }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    const alert = await screen.findByText('The image could not be copied. The browser denied clipboard access.');
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeTruthy();
  });

  it('shows a clear error when the browser blocks reading the render', async () => {
    renderReply = { type: 'semurai:capture-render:result', error: 'tainted' };
    await open('page', 'pl');
    fireEvent.click(within(exportMenu('Eksport')).getByRole('menuitem', { name: 'PNG: cała strona' }));
    expect(await screen.findByText('Ta przeglądarka (np. Safari) blokuje zapis obrazu z podglądu. Użyj Chrome, Edge lub Firefox.')).toBeTruthy();
    expect(downloads).toEqual([]);
  });
});

describe('PNG pick mode', () => {
  it('enters with a hint, captures the clicked element and leaves pick mode', async () => {
    const win = await open();
    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: pick an element' }));
    expect(screen.getByText('Click an element to export · Esc cancels')).toBeTruthy();
    expect(win.postMessage).toHaveBeenCalledWith({ type: 'semurai:capture-pick', enabled: true }, '*');
    fromFrame({ type: 'semurai:capture-picked', elementId: 'hero', label: 'h1-hero' });
    expect(screen.queryByText('Click an element to export · Esc cancels')).toBeNull();
    await waitFor(() => expect(downloads).toEqual(['lodz-landing-h1-hero.png']));
    expect(sent.find(message => message.type === 'semurai:capture-measure')).toMatchObject({ target: { kind: 'element', elementId: 'hero' } });
  });

  it('cancels with Escape in the host, from the frame, or with the Cancel button', async () => {
    const win = await open();
    const hint = () => screen.queryByText('Click an element to export · Esc cancels');
    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: pick an element' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(hint()).toBeNull();
    expect(win.postMessage).toHaveBeenLastCalledWith({ type: 'semurai:capture-pick', enabled: false }, '*');

    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: pick an element' }));
    fromFrame({ type: 'semurai:capture-pick-cancel' });
    expect(hint()).toBeNull();

    fireEvent.click(within(exportMenu()).getByRole('menuitem', { name: 'PNG: pick an element' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(hint()).toBeNull();
    // A late pick after cancelling does not capture anything.
    fromFrame({ type: 'semurai:capture-picked', elementId: 'hero', label: 'h1' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(downloads).toEqual([]);
  });

  it('exports the selected element from the Edit panel', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Tools' })).getByRole('button', { name: 'Edit' }));
    const target = { id: 'hero', kind: 'text', label: 'Welcome', tagName: 'h1', className: '', text: 'Welcome', rect: { x: 0, y: 0, width: 100, height: 40 }, fields: {}, attributes: {}, styles: {}, isLayoutContainer: false, outerHtml: '<h1>Welcome</h1>' };
    fromFrame({ type: 'od-edit-select', target });
    fireEvent.click(within(screen.getByTestId('studio-edit-panel')).getByRole('button', { name: 'Export element as PNG' }));
    await waitFor(() => expect(downloads).toEqual(['lodz-landing-h1-hero.png']));
    expect(sent.find(message => message.type === 'semurai:capture-measure')).toMatchObject({ target: { kind: 'element', elementId: 'hero' } });
  });
});
