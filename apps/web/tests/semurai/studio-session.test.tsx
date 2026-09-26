// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SemuraiStudio } from '../../src/semurai/Studio';
import { startStudioSessionRenewal, studioCapMinutes, STUDIO_REFRESH_LEAD_MS, STUDIO_REFRESH_RETRY_MS, type StudioSessionState } from '../../src/semurai/studio-session';

const MINUTE = 60_000;
const PATH = '/studio/11111111-2222-4333-8444-555555555555/';

describe('Studio session renewal scheduling', () => {
  let now = 0;
  beforeEach(() => { vi.useFakeTimers(); now = 1_000_000; vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });
  const advance = async (ms: number) => { now += ms; await vi.advanceTimersByTimeAsync(ms); };
  function start(initial: StudioSessionState, respond: (body: { active: boolean }) => Response | Promise<Response>) {
    const calls: { active: boolean; headers: Headers; method?: string; url: string }[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { active: boolean };
      calls.push({ active: body.active, headers: new Headers(init?.headers), method: init?.method, url: String(url) });
      return respond(body);
    }) as unknown as typeof fetch;
    const onChange = vi.fn(), onExpired = vi.fn();
    const stop = startStudioSessionRenewal({ path: PATH, initial, onChange, onExpired, fetcher, now: () => now });
    return { calls, onChange, onExpired, stop };
  }
  const renewed = (expiresAt: number, sessionExpiresAt: number) => new Response(JSON.stringify({ expiresAt, sessionExpiresAt }), { status: 200 });

  it('renews three minutes before the end, reports input since the last renewal and keeps sliding', async () => {
    const cap = now + 12 * 60 * MINUTE;
    const session = start({ expiresAt: now + 15 * MINUTE, sessionExpiresAt: cap }, () => renewed(now + 15 * MINUTE, cap));
    await advance(12 * MINUTE - 1);
    expect(session.calls).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'a' });
    await advance(1);
    expect(session.calls).toHaveLength(1);
    expect(session.calls[0]).toMatchObject({ active: true, method: 'POST', url: PATH + 'session/refresh' });
    expect(session.calls[0]!.headers.get('X-Creative-Action')).toBe('session');
    expect(session.onChange).toHaveBeenLastCalledWith({ expiresAt: now + 15 * MINUTE, sessionExpiresAt: cap });
    // No input since then: the next renewal says so, and the server decides when an idle session lapses.
    await advance(15 * MINUTE - STUDIO_REFRESH_LEAD_MS);
    expect(session.calls).toHaveLength(2);
    expect(session.calls[1]!.active).toBe(false);
    expect(session.onExpired).not.toHaveBeenCalled();
    session.stop();
  });

  it('ends the session when the renewal is refused', async () => {
    const session = start({ expiresAt: now + 4 * MINUTE, sessionExpiresAt: now + 60 * MINUTE }, () => new Response('{}', { status: 401 }));
    await advance(MINUTE);
    expect(session.calls).toHaveLength(1);
    expect(session.onExpired).toHaveBeenCalledTimes(1);
    await advance(10 * MINUTE);
    expect(session.calls).toHaveLength(1);
  });

  it('retries failed renewals while the session runs and gives up at its end', async () => {
    const session = start({ expiresAt: now + 4 * MINUTE, sessionExpiresAt: now + 60 * MINUTE }, () => { throw new TypeError('offline'); });
    fireEvent.pointerDown(window);
    await advance(MINUTE);
    expect(session.calls).toHaveLength(1);
    await advance(STUDIO_REFRESH_RETRY_MS);
    expect(session.calls).toHaveLength(2);
    // Input before a failed attempt is still reported on the retry.
    expect(session.calls.map(call => call.active)).toEqual([true, true]);
    expect(session.onExpired).not.toHaveBeenCalled();
    await advance(3 * MINUTE);
    expect(session.onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not renew past the absolute cap and expires exactly at the end', async () => {
    const end = now + 8 * MINUTE;
    const session = start({ expiresAt: end, sessionExpiresAt: end }, () => renewed(end, end));
    await advance(8 * MINUTE - 1);
    expect(session.calls).toHaveLength(0);
    expect(session.onExpired).not.toHaveBeenCalled();
    await advance(1);
    expect(session.onExpired).toHaveBeenCalledTimes(1);
  });

  it('renews on return to the tab when the end is near (background timers can be late)', async () => {
    const session = start({ expiresAt: now + 15 * MINUTE, sessionExpiresAt: now + 60 * MINUTE }, () => renewed(now + 15 * MINUTE, now + 60 * MINUTE));
    fireEvent.focus(window);
    await advance(0);
    expect(session.calls).toHaveLength(0);
    now += 11 * MINUTE; // the timer did not run yet
    fireEvent.focus(window);
    await vi.advanceTimersByTimeAsync(0);
    expect(session.calls).toHaveLength(1);
    session.stop();
  });

  it('counts the minutes to the absolute cap only in its last ten minutes', () => {
    expect(studioCapMinutes({ expiresAt: 0, sessionExpiresAt: 20 * MINUTE }, 0)).toBeNull();
    expect(studioCapMinutes({ expiresAt: 0, sessionExpiresAt: 10 * MINUTE }, 0)).toBe(10);
    expect(studioCapMinutes({ expiresAt: 0, sessionExpiresAt: 10 * MINUTE }, 3 * MINUTE + 1)).toBe(7);
    expect(studioCapMinutes({ expiresAt: 0, sessionExpiresAt: 10 * MINUTE }, 10 * MINUTE)).toBeNull();
  });
});

describe('Studio session expiry', () => {
  const page = '<!doctype html><html><head></head><body><h1 data-od-id="hero">Welcome</h1></body></html>';
  let refreshes = 0;
  beforeEach(() => {
    refreshes = 0;
    localStorage.clear();
    window.history.replaceState({}, '', PATH);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/context')) return new Response(JSON.stringify({
        projectId: '11111111-2222-4333-8444-555555555555', workspaceId: 'workspace', returnUrl: 'https://core.test/app/chat/creative',
        // The renewal falls due right away (less than three minutes left).
        expiresAt: Date.now() + STUDIO_REFRESH_LEAD_MS - 50, sessionExpiresAt: Date.now() + 3_600_000,
        project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
      }), { status: 200 });
      if (target.endsWith('/session/refresh')) { refreshes++; return new Response('{}', { status: 401 }); }
      const endpoint = target.split('/project/')[1];
      const data = endpoint === 'document' ? { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html: page, notes: [] } } : [];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('shows the expired screen when a refused renewal ends a session without unsaved work', async () => {
    render(<SemuraiStudio />);
    await screen.findByText('This Studio session has expired.');
    expect(refreshes).toBe(1);
    expect(screen.queryByTestId('semurai-studio-editor')).toBeNull();
  });

  it('keeps the editor with a banner and no Save when the session ends with unsaved work', async () => {
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    // Hold the renewal until the document has an unsaved change.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    fetchMock.mockImplementation(async (url, init) => { if (String(url).endsWith('/session/refresh')) await held; return original(url as string, init); });
    render(<SemuraiStudio />);
    await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Project source' }), { target: { value: page.replace('Welcome', 'Hello') } });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await act(async () => { release(); await held; });
    await screen.findByText('Session expired. Reopen Studio from Semurai. You can download unsaved work as HTML.');
    expect(screen.getByTestId('semurai-studio-editor')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Project source' }) as HTMLTextAreaElement).value).toContain('Hello');
  });
});
