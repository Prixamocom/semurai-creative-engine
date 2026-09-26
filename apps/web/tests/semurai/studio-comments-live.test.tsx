// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { STUDIO_COMMENT_POLL_MS, studioCommentOnSlide, type ReviewTarget, type StudioComment } from '../../src/semurai/studio-review';

const projectId = '11111111-2222-4333-8444-555555555555';
const page = '<!doctype html><html><head></head><body><h1 data-od-id="hero">Welcome</h1></body></html>';
const deck = '<!doctype html><html><head></head><body><div class="deck-stage"><section class="slide active"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div></body></html>';
function context(artifactType: string): StudioContext {
  return {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Project', artifactType, locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
}
const target = (overrides: Partial<ReviewTarget> = {}): ReviewTarget => ({ file: 'index.html', version: 1, label: 'h1', selector: 'h1', text: '', ...overrides });
const comment = (id: string, overrides: Partial<StudioComment> = {}): StudioComment => ({ id, text: 'Note ' + id, target: target(), resolved: false, revision: 1, author: 'Ann', created_at: '2026-09-20T10:00:00Z', ...overrides });

let html = page;
let server: StudioComment[] = [];
/** A pending GET comments answer, released by the test (null: answer right away). */
let held: { release: () => void } | null = null;
let holdNext = false;
let visibility: DocumentVisibilityState = 'visible';
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const endpoint = String(url).split('/project/')[1];
  if (endpoint === 'comments' && init?.method === 'POST') {
    const body = JSON.parse(String(init.body)) as { action: string; id: string };
    server = server.map(item => item.id === body.id ? { ...item, revision: item.revision + 1, resolved: body.action === 'resolve' } : item);
    return new Response(JSON.stringify({ data: server }));
  }
  if (endpoint === 'comments') {
    const snapshot = server;
    if (holdNext) { holdNext = false; await new Promise<void>(resolve => { held = { release: resolve }; }); }
    return new Response(JSON.stringify({ data: snapshot }));
  }
  const data = endpoint === 'document' ? { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Project', html, notes: [] } } : [];
  return new Response(JSON.stringify({ data }));
});
const reads = () => fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/project/comments') && init?.method === 'GET').length;
/** Lets the stubbed fetch and the state updates settle (real macrotask; only intervals are faked). */
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); await new Promise(resolve => setTimeout(resolve, 0)); });
const poll = async (ms = STUDIO_COMMENT_POLL_MS) => { await act(async () => { vi.advanceTimersByTime(ms); }); await settle(); };
function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}
const tools = () => screen.getByRole('group', { name: 'Tools' });
const panel = () => document.getElementById('studio-chat')!;
const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!;

async function open(artifactType = 'page') {
  render(<StudioEditor context={context(artifactType)} onClose={() => {}} />);
  await waitFor(() => expect(frame()?.srcdoc).toBeTruthy());
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  html = page; server = []; held = null; holdNext = false; visibility = 'visible';
  fetchMock.mockClear();
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

describe('live comments in the Studio', () => {
  it('reads right away on entering the Comment tool, then every 30 s while visible, and stops in other tools or hidden tabs', async () => {
    await open();
    // Only the interval is faked, so the stubbed fetch and Testing Library keep real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const initial = reads();
    await poll();
    expect(reads()).toBe(initial);

    fireEvent.click(within(tools()).getByRole('button', { name: /^Comment/ }));
    await settle();
    expect(reads()).toBe(initial + 1);

    server = [comment('guest', { text: 'Added through the share link', author: 'Marta', author_kind: 'guest' })];
    await poll(STUDIO_COMMENT_POLL_MS - 1);
    expect(reads()).toBe(initial + 1);
    await poll(1);
    expect(reads()).toBe(initial + 2);
    expect(within(panel()).getByText('Added through the share link')).toBeTruthy();

    setVisibility('hidden');
    await poll(3 * STUDIO_COMMENT_POLL_MS);
    expect(reads()).toBe(initial + 2);
    setVisibility('visible');
    await settle();
    expect(reads()).toBe(initial + 3);
    await poll();
    expect(reads()).toBe(initial + 4);

    fireEvent.click(within(tools()).getByRole('button', { name: 'Select' }));
    await poll(3 * STUDIO_COMMENT_POLL_MS);
    expect(reads()).toBe(initial + 4);
  });

  it('keeps a reply draft through polls and never lets an older read replace a newer write or overlap another read', async () => {
    server = [comment('one')];
    await open();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fireEvent.click(within(tools()).getByRole('button', { name: /^Comment/ }));
    await settle();
    const reply = () => within(panel()).getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement;
    fireEvent.change(reply(), { target: { value: 'My draft' } });

    await poll();
    expect(reply().value).toBe('My draft');
    server = [{ ...server[0]!, revision: 2, replies: [{ id: 'g1', text: 'Guest answer', author: 'Marta', author_kind: 'guest', created_at: '2026-09-20T11:00:00Z' }] }];
    await poll();
    expect(within(panel()).getByText('Guest answer')).toBeTruthy();
    expect(reply().value).toBe('My draft');

    // A read hangs with the thread still open; meanwhile the user resolves it.
    holdNext = true;
    await poll();
    expect(held).not.toBeNull();
    const before = reads();
    await poll();
    expect(reads()).toBe(before);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Resolve' }));
    await within(panel()).findByText('No comments for this file.');
    await act(async () => { held!.release(); });
    await settle();
    expect(within(panel()).getByText('No comments for this file.')).toBeTruthy();
    // The next poll carries the resolved thread again.
    await poll();
    expect(reads()).toBe(before + 1);
    expect(within(panel()).getByText('No comments for this file.')).toBeTruthy();
  });
});

describe('deck comment pins in the Studio', () => {
  it('keeps slide-less threads on every slide and slide threads on their own slide', () => {
    const onSlide = comment('s', { target: target({ slideIndex: 1 }) });
    const anywhere = comment('a');
    expect([studioCommentOnSlide(onSlide, true, 0), studioCommentOnSlide(onSlide, true, 1), studioCommentOnSlide(anywhere, true, 0), studioCommentOnSlide(onSlide, false, 0)]).toEqual([false, true, true, true]);
  });

  it('pins guest comments only on their slide and names the slide in the panel, where choosing it goes there', async () => {
    html = deck;
    server = [
      comment('first', { text: 'On slide one', target: target({ label: 'Slajd 1', selector: 'body', slideIndex: 0 }), author: 'Marta', author_kind: 'guest' }),
      comment('second', { text: 'On slide two', target: target({ label: 'Slajd 2', selector: 'body', slideIndex: 1 }), author: 'Marta', author_kind: 'guest' }),
      comment('general', { text: 'Whole deck' }),
    ];
    await open('presentation');
    const win = frame().contentWindow!;
    const post = vi.spyOn(win, 'postMessage') as unknown as ReturnType<typeof vi.fn>;
    const pins = () => {
      const last = post.mock.calls.map(call => call[0] as { type?: string; items?: { id: string; number: number }[] }).filter(message => message?.type === 'semurai:comment-markers').at(-1);
      return last?.items?.map(item => item.id + ':' + item.number);
    };
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'semurai:comment-markers-ready' }, source: win })); });
    expect(pins()).toEqual(['first:1', 'general:3']);
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'od:slide-state', active: 1 }, source: win })); });
    expect(pins()).toEqual(['second:2', 'general:3']);

    fireEvent.click(within(tools()).getByRole('button', { name: /^Comment/ }));
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'od:slide-state', active: 0 }, source: win })); });
    expect(within(panel()).getByText('Slide 1')).toBeTruthy();
    const chip = within(panel()).getByText('Slide 2');
    expect(within(panel()).getAllByText(/^Slide \d$/)).toHaveLength(2);
    // A whole-slide thread shows only the chip, not its stored "Slajd N" label as well.
    expect(within(panel()).queryByText('Slajd 2')).toBeNull();
    post.mockClear();
    fireEvent.click(chip);
    expect(post).toHaveBeenCalledWith({ type: 'od:slide', action: 'go', index: 1 }, '*');
    expect(pins()).toEqual(['second:2', 'general:3']);
  });
});
