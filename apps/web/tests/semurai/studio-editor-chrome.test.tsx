// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { studioFileCount } from '../../src/semurai/studio-editor-copy';
import { studioFitZoom, studioZoomShortcut, studioZoomStep } from '../../src/semurai/studio-zoom';
import type { StudioComment } from '../../src/semurai/studio-review';

const projectId = '11111111-2222-4333-8444-555555555555';
const page = '<!doctype html><html><head></head><body><h1 data-od-id="hero">Welcome</h1></body></html>';
const about = '<!doctype html><html><head></head><body><h1>About us</h1></body></html>';
const deck = '<!doctype html><html><head></head><body><div class="deck-stage"><section class="slide active"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div></body></html>';
function context(artifactType = 'page'): StudioContext {
  return {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Landing', artifactType, locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
}
const target = { file: 'index.html', version: 1, label: 'h1', selector: 'h1', text: 'Welcome' };
const comment = (id: string, resolved: boolean, file = 'index.html'): StudioComment => ({ id, text: 'Note ' + id, target: { ...target, file }, resolved, revision: 1, author: 'Ann', created_at: '2026-09-20T10:00:00Z' });

let document_: { version: number; kind: string; name: string; html: string; files?: { path: string; content: string }[]; notes: string[] };
let comments: StudioComment[] = [];
let puts = 0;
beforeEach(() => {
  localStorage.clear(); puts = 0; comments = [];
  document_ = { version: 1, kind: 'page', name: 'Landing', html: page, notes: [] };
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint = String(url).split('/project/')[1];
    if (endpoint === 'document' && init?.method === 'PUT') { puts += 1; document_ = JSON.parse(String(init.body)).document; }
    const data = endpoint === 'document' ? { id: 'source', version: 1 + puts, document_hash: 'hash' + puts, document: document_ } : endpoint === 'comments' ? comments : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function open(artifactType = 'page') {
  const onClose = vi.fn();
  render(<StudioEditor context={context(artifactType)} onClose={onClose} />);
  await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toBeTruthy());
  return { onClose };
}
const tools = () => screen.getByRole('group', { name: 'Tools' });
const panel = () => document.getElementById('studio-chat')!;
function menu(trigger: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: trigger }));
  return screen.getByRole('menu');
}

describe('Studio chrome helpers', () => {
  it('counts project files with the Polish plural forms', () => {
    expect([1, 2, 4, 5, 12, 22, 25].map(count => studioFileCount('pl', count))).toEqual(['1 plik', '2 pliki', '4 pliki', '5 plików', '12 plików', '22 pliki', '25 plików']);
    expect(studioFileCount('en', 1)).toBe('1 file');
    expect(studioFileCount('de', 3)).toBe('3 Dateien');
  });
  it('steps through the zoom presets, fits device frames and reads the shortcuts', () => {
    expect(studioZoomStep(100, 1)).toBe(125);
    expect(studioZoomStep(83, 1)).toBe(100);
    expect(studioZoomStep(83, -1)).toBe(75);
    expect(studioZoomStep(200, 1)).toBe(200);
    expect(studioZoomStep(50, -1)).toBe(50);
    expect(studioFitZoom(1200, 0)).toBe(100);
    expect(studioFitZoom(384, 768)).toBe(50);
    expect(studioFitZoom(2000, 390)).toBe(100);
    expect(studioFitZoom(100, 768)).toBe(25);
    expect(studioZoomShortcut({ key: '=', ctrlKey: true, metaKey: false, altKey: false })).toBe('in');
    expect(studioZoomShortcut({ key: '-', ctrlKey: false, metaKey: true, altKey: false })).toBe('out');
    expect(studioZoomShortcut({ key: '0', ctrlKey: true, metaKey: false, altKey: false })).toBe('reset');
    expect(studioZoomShortcut({ key: '0', ctrlKey: false, metaKey: false, altKey: false })).toBeNull();
  });
});

describe('Studio tool group drives the side panel', () => {
  it('shows chat, comments or the Edit panel for the active tool and returns to chat', async () => {
    await open();
    expect(within(panel()).getByRole('textbox', { name: 'What would you like to change?' })).toBeTruthy();
    expect(within(tools()).getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(tools()).getByRole('button', { name: /^Comment/ }));
    expect(within(panel()).getByRole('region', { name: 'Comments' })).toBeTruthy();
    expect(within(panel()).queryByRole('textbox', { name: 'What would you like to change?' })).toBeNull();
    expect(within(panel()).getByRole('group', { name: 'Selection method' })).toBeTruthy();
    expect(panel().querySelector('header')!.textContent).toContain('Comments');

    fireEvent.click(within(tools()).getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('studio-edit-panel')).toBeTruthy();
    expect(within(panel()).queryByRole('region', { name: 'Comments' })).toBeNull();
    // Image insert lives in the Edit context, not in the global bar.
    expect(within(screen.getByTestId('studio-edit-panel')).getByRole('button', { name: 'Add image' })).toBeTruthy();

    fireEvent.click(within(panel()).getByRole('button', { name: 'Back to chat' }));
    expect(within(panel()).getByRole('textbox', { name: 'What would you like to change?' })).toBeTruthy();
    expect(screen.queryByTestId('studio-edit-panel')).toBeNull();
    expect(within(panel()).queryByRole('button', { name: 'Back to chat' })).toBeNull();
  });

  it('switching to Source leaves the Edit tool and Edit returns to the preview', async () => {
    await open();
    fireEvent.click(within(tools()).getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.queryByTestId('studio-edit-panel')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Project source' })).toBeTruthy();
    fireEvent.click(within(tools()).getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('studio-edit-panel')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the two exits apart: back to Semurai is a link, closing the session sits in the overflow menu', async () => {
    const { onClose } = await open();
    expect(screen.getByRole('link', { name: 'Back to Semurai' }).getAttribute('href')).toBe('https://core.test/app/chat/creative');
    expect(screen.queryByRole('button', { name: 'Close session' })).toBeNull();
    fireEvent.click(within(menu('More options')).getByRole('menuitem', { name: 'Close session' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows one open-comment count for the active file on the Comment tool', async () => {
    comments = [comment('a', false), comment('b', true), comment('c', false, 'other.html')];
    await open();
    const button = await waitFor(() => within(tools()).getByRole('button', { name: 'Comment (Open comments: 1)' }));
    expect(button.textContent).toBe('Comment1');
    expect(screen.queryAllByText('3')).toHaveLength(0);
  });
});

describe('Studio top bar', () => {
  it('switches files from the file menu', async () => {
    document_ = { ...document_, files: [{ path: 'about.html', content: about }] };
    await open();
    const files = menu('index.html · 2 files');
    expect(within(files).getByRole('menuitemradio', { name: 'index.html' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(files).getByRole('menuitemradio', { name: 'about.html' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'about.html · 2 files' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!.srcdoc).toContain('About us'));
  });

  it('zooms from the menu, fits the device frame to the canvas and follows Ctrl/Cmd +, - and 0', async () => {
    await open();
    const viewport = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!.parentElement!;
    const items = [...menu('Zoom: 100%').querySelectorAll('[role^="menuitem"]')].map(item => item.textContent);
    expect(items).toEqual(['Zoom inCtrl +', 'Zoom outCtrl -', 'Fit to width', '50%', '75%', '100%Ctrl 0', '125%', '150%', '200%']);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '150%' }));
    expect(screen.getByRole('button', { name: 'Zoom: 150%' })).toBeTruthy();
    expect(viewport().style.zoom).toBe('1.5');

    fireEvent.keyDown(window, { key: '-', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Zoom: 125%' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '=', metaKey: true });
    expect(screen.getByRole('button', { name: 'Zoom: 150%' })).toBeTruthy();
    fireEvent.keyDown(window, { key: '0', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Zoom: 100%' })).toBeTruthy();

    // A 768px tablet frame on a 384px canvas fits at 50%.
    fireEvent.click(screen.getByRole('button', { name: 'Tablet' }));
    Object.defineProperty(viewport().parentElement!, 'clientWidth', { configurable: true, value: 384 });
    fireEvent.click(within(menu('Zoom: 100%')).getByRole('menuitemradio', { name: 'Fit to width' }));
    expect(screen.getByRole('button', { name: 'Zoom: 50%' })).toBeTruthy();
    expect(viewport().style.zoom).toBe('0.5');
  });

  it('offers full screen for pages and the three presentation modes for decks', async () => {
    const fullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: fullscreen });
    await open();
    const pageMenu = menu('Present');
    expect(within(pageMenu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Full screen']);
    fireEvent.click(within(pageMenu).getByRole('menuitem', { name: 'Full screen' }));
    await waitFor(() => expect(fullscreen).toHaveBeenCalledOnce());
    cleanup();

    document_ = { version: 1, kind: 'presentation', name: 'Deck', html: deck, notes: ['First', 'Second'] };
    await open('presentation');
    const deckMenu = menu('Present');
    expect(within(deckMenu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['From the beginning', 'From current slide', 'Presenter view']);
    fireEvent.click(within(deckMenu).getByRole('menuitem', { name: 'Presenter view' }));
    expect(screen.getByText('First', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End presentation' })).toBeTruthy();
    // Decks have no image insert in the Edit panel.
    fireEvent.click(screen.getByRole('button', { name: 'End presentation' }));
    fireEvent.click(within(tools()).getByRole('button', { name: 'Edit' }));
    expect(within(screen.getByTestId('studio-edit-panel')).queryByRole('button', { name: 'Add image' })).toBeNull();
  });

  it('shows the save state, saves with the button and with Ctrl+S, and names the version on History', async () => {
    await open();
    expect(screen.getByText('Saved')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'History · Version 1' })).toBeTruthy();

    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!;
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'od-edit-text-commit', id: 'hero', value: 'Hello' }, source: frame.contentWindow })); });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(puts).toBe(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'History · Version 2' })).toBeTruthy());

    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'od-edit-text-commit', id: 'hero', value: 'Hi' }, source: frame.contentWindow })); });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(puts).toBe(2));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });

  it('keeps the export menu with HTML, PNG, print and saved exports, and no footer chrome', async () => {
    await open();
    const exportMenu = menu('Export');
    expect(within(exportMenu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['HTML + CSS', 'PNG: whole page', 'PNG: pick an element', 'Print / PDF', 'Saved exports']);
    fireEvent.click(within(exportMenu).getByRole('menuitem', { name: 'Saved exports' }));
    expect(screen.getByRole('complementary', { name: 'Saved exports' })).toBeTruthy();
    expect(document.querySelector('footer')).toBeNull();
    expect(screen.queryByText(/EN · page/)).toBeNull();
  });
});
