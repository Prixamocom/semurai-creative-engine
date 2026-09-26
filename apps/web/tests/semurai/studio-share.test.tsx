// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioShareButton } from '../../src/semurai/StudioShareDialog';
import { StudioCommentThread } from '../../src/semurai/StudioCommentThread';
import { SemuraiShareViewer } from '../../src/semurai/ShareViewer';
import { threadBrief, type StudioComment } from '../../src/semurai/studio-review';
import { browserUiLocale, shareCount, shareTokenFromPath, shareUiLocale, type PublicComment, type ShareItem } from '../../src/semurai/studio-share';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('share helpers', () => {
  it('reads only well-formed tokens from the viewer path', () => {
    expect(shareTokenFromPath('/s/' + TOKEN)).toBe(TOKEN);
    expect(shareTokenFromPath('/s/' + TOKEN + '/')).toBe(TOKEN);
    expect(shareTokenFromPath('/s/' + TOKEN.slice(1))).toBeNull();
    expect(shareTokenFromPath('/s/' + TOKEN + '/api/share')).toBeNull();
    expect(shareTokenFromPath('/studio/' + TOKEN + '/')).toBeNull();
  });
  it('picks the viewer language from the browser and counts with Polish plural forms', () => {
    expect(shareUiLocale(['pl-PL', 'en'])).toBe('pl');
    expect(shareUiLocale(['fr-FR', 'de-AT'])).toBe('de');
    expect(shareUiLocale(['fr-FR'])).toBe('en');
    const languages = Object.getOwnPropertyDescriptor(navigator, 'languages');
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['de-CH', 'pl'] });
    expect(browserUiLocale()).toBe('de');
    Object.defineProperty(navigator, 'languages', { configurable: true, value: [] });
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'pl-PL' });
    expect(browserUiLocale()).toBe('pl');
    if (languages) Object.defineProperty(navigator, 'languages', languages); else delete (navigator as { languages?: unknown }).languages;
    delete (navigator as { language?: unknown }).language;
    expect([1, 2, 5, 12, 22, 25].map(count => shareCount('pl', 'views', count))).toEqual(['1 wyświetlenie', '2 wyświetlenia', '5 wyświetleń', '12 wyświetleń', '22 wyświetlenia', '25 wyświetleń']);
    expect([1, 3, 5, 14, 24].map(count => shareCount('pl', 'guestComments', count))).toEqual(['1 komentarz gościa', '3 komentarze gości', '5 komentarzy gości', '14 komentarzy gości', '24 komentarze gości']);
    expect(shareCount('en', 'views', 1)).toBe('1 view');
    expect(shareCount('de', 'guestComments', 2)).toBe('2 Gastkommentare');
  });
});

describe('Studio share dialog', () => {
  const link = (overrides: Partial<ShareItem> = {}): ShareItem => ({ id: '00000000-0000-4000-8000-000000000001', permission: 'comment', label: 'Dla klienta', status: 'active',
    url: 'https://creative.semur.ai/s/' + TOKEN, created_at: '2026-09-20T10:00:00Z', expires_at: null, last_viewed_at: null, view_count: 5, guest_comment_count: 2, ...overrides });
  let written: string[];
  beforeEach(() => {
    written = [];
    vi.stubGlobal('ClipboardItem', class { constructor(readonly items: Record<string, Blob>) {} });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: vi.fn(async (items: { items: Record<string, Blob> }[]) => { written.push(await items[0]!.items['text/plain']!.text()); }),
      writeText: vi.fn(async (value: string) => { written.push(value); }),
    } });
  });

  it('creates a link, copies it and lists links with their counts in Polish', async () => {
    const created = link({ id: '00000000-0000-4000-8000-000000000002', permission: 'view', label: null, url: 'https://creative.semur.ai/s/' + TOKEN.replace('A', 'B'), view_count: 0, guest_comment_count: 0 });
    const api = vi.fn(async (endpoint: string, method = 'GET', _body?: unknown) => {
      if (endpoint === 'shares' && method === 'GET') return { data: [link()] };
      if (endpoint === 'shares' && method === 'POST') return { data: created };
      throw new Error('unexpected ' + endpoint);
    });
    render(<StudioShareButton locale="pl" artifactType="presentation" api={api} />);
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Udostępnij' }));
    const dialog = await screen.findByRole('dialog', { name: 'Udostępnij projekt' });
    await within(dialog).findByText('Dla klienta');
    expect(within(dialog).getByText('5 wyświetleń')).toBeTruthy();
    expect(within(dialog).getByText('2 komentarze gości')).toBeTruthy();
    expect(within(dialog).getByText('Bez wygaśnięcia', { selector: 'p span' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dostęp: Podgląd i komentarze' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Tylko podgląd' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ważność: Bez wygaśnięcia' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Wygasa po 7 dniach' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Utwórz link' }));
    await within(dialog).findByText('Link bez nazwy');
    expect(api).toHaveBeenCalledWith('shares', 'POST', { permission: 'view', expires_in_days: 7 });
    await screen.findByText('Skopiowano link');
    expect(written).toEqual([created.url]);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kopiuj link' })[1]!);
    await waitFor(() => expect(written).toEqual([created.url, link().url]));
  });

  it('changes access and turns a link off after confirmation', async () => {
    const api = vi.fn(async (endpoint: string, method = 'GET', body?: unknown) => {
      if (endpoint === 'shares') return { data: [link()] };
      if (endpoint.endsWith('/revoke')) return { data: { id: link().id, revoked: true } };
      return { data: link({ permission: (body as { permission: 'view' }).permission }) };
    });
    render(<StudioShareButton locale="en" artifactType="landing" api={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share project' });
    await within(dialog).findByText('Dla klienta');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Access · Dla klienta: View and comment' }));
    const menus = screen.getAllByRole('menu');
    fireEvent.click(within(menus.at(-1)!).getByRole('menuitemradio', { name: 'View only' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('shares/' + link().id, 'POST', { permission: 'view' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off link' }));
    expect(api).toHaveBeenCalledTimes(2);
    const confirm = within(dialog).getByRole('group', { name: 'Turn off this link?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Turn off link' }));
    await within(dialog).findByText('There are no links to this project yet.');
    expect(api).toHaveBeenLastCalledWith('shares/' + link().id + '/revoke', 'POST', {});
  });

  it('explains when sharing is unavailable, a limit is hit, or the project type cannot be shared', async () => {
    const missing = vi.fn(async () => { throw Object.assign(new Error('Not found'), { status: 404 }); });
    render(<StudioShareButton locale="pl" artifactType="page" api={missing} />);
    fireEvent.click(screen.getByRole('button', { name: 'Udostępnij' }));
    await screen.findByText('Udostępnianie jest chwilowo niedostępne');
    cleanup();
    const limited = vi.fn(async (_endpoint: string, method = 'GET') => {
      if (method === 'GET') return { data: [] };
      throw Object.assign(new Error('Limit'), { status: 422, code: 'creative.share_limit' });
    });
    render(<StudioShareButton locale="pl" artifactType="page" api={limited} />);
    fireEvent.click(screen.getByRole('button', { name: 'Udostępnij' }));
    await screen.findByText('Nie ma jeszcze linków do tego projektu.');
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz link' }));
    await screen.findByText('Osiągnięto limit aktywnych linków. Wyłącz nieużywany link i spróbuj ponownie.');
    cleanup();
    render(<StudioShareButton locale="pl" artifactType="video" api={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Udostępnij' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Udostępnianie linkiem nie obejmuje jeszcze grafik i filmów.');
  });
});

describe('guest comments in the Studio', () => {
  const target = { file: 'index.html', version: 2, label: 'Slajd 1', selector: 'body', text: '', slideIndex: 0 };
  const comment: StudioComment = { id: 'one', text: 'Dodajcie logo', target, resolved: false, revision: 2, created_at: '2026-09-20T10:00:00Z', author: 'Marta', author_kind: 'guest',
    replies: [{ id: 'r1', text: 'Dodamy.', author: 'Anna', author_kind: 'member', created_at: '2026-09-20T11:00:00Z' }, { id: 'r2', text: '<b>Dzięki</b>', author: 'Marta', author_kind: 'guest', created_at: '2026-09-20T12:00:00Z' }] };
  it('marks guest entries with a text badge and labels them for the AI chat', () => {
    const ask = vi.fn();
    render(<StudioCommentThread comment={comment} locale="pl" disabled={false} api={vi.fn()} onChange={() => {}} onAsk={ask} />);
    expect(screen.getAllByText('Gość')).toHaveLength(2);
    expect(screen.getByText('<b>Dzięki</b>')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj do czatu AI' }));
    expect(ask).toHaveBeenCalledWith('Komentarz gościa (Marta): Dodajcie logo\n\nAnna: Dodamy.\n\nKomentarz gościa (Marta): <b>Dzięki</b>');
    expect(threadBrief({ ...comment, author_kind: undefined, replies: [] })).toBe('Dodajcie logo');
  });
});

describe('public share viewer', () => {
  const deck = '<!doctype html><html><head></head><body><div class="deck-stage"><section class="slide active"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div></body></html>';
  const payload = (permission: 'view' | 'comment') => ({ data: { share: { permission, expires_at: null }, project: { title: 'Plan 2027', artifact_type: 'presentation', locale: 'pl', direction: 'ltr' },
    document: { version: 3, document_hash: 'h', name: 'Plan', html: deck, files: [] } } });
  const guestThread: PublicComment = { id: 'c1', text: 'Świetne', target: { file: 'index.html', version: 3, label: 'Slajd 1', selector: 'body', text: '', slideIndex: 0 },
    resolved: false, revision: 1, created_at: '2026-09-20T10:00:00Z', author: 'Ola', author_kind: 'guest',
    // The public API withholds member names (author null).
    replies: [{ id: 'r1', text: 'Dziękujemy', author: null, author_kind: 'member', created_at: '2026-09-20T11:00:00Z' }] };
  const memberThread: PublicComment = { id: 'c2', text: 'Nowy układ', target: { file: 'index.html', version: 3, label: 'h1', selector: 'h1', text: '' },
    resolved: false, revision: 1, created_at: '2026-09-20T10:00:00Z', author: null, author_kind: 'member', replies: [] };
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['pl-PL'] });
  });
  function fetcher(permission: 'view' | 'comment', posts: { body: Record<string, unknown>; headers: Headers }[] = [], status = 200) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      if (status !== 200) return new Response(JSON.stringify({ error: 'creative.share_not_found' }), { status });
      if (path === '/s/' + TOKEN + '/api/share') return new Response(JSON.stringify(payload(permission)));
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push({ body, headers: new Headers(init.headers) });
        return new Response(JSON.stringify({ data: [guestThread, { ...guestThread, id: String(body.id), text: String(body.text), author: String(body.guest_name) }] }));
      }
      return new Response(JSON.stringify({ data: [guestThread, memberThread] }));
    }) as unknown as typeof fetch;
  }

  it('shows a view link read-only in a script-only sandbox, without comments or speaker notes', async () => {
    const load = fetcher('view');
    render(<SemuraiShareViewer token={TOKEN} fetcher={load} />);
    await screen.findByRole('heading', { name: 'Plan 2027' });
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.srcdoc).not.toContain('semurai-comment-markers');
    expect(screen.getByText('Tylko podgląd')).toBeTruthy();
    expect(screen.getByText('Slajd 1 / 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /komentarze/i })).toBeNull();
    expect(screen.queryByText(/notatki/i)).toBeNull();
    expect(vi.mocked(load).mock.calls.map(call => String(call[0]))).toEqual(['/s/' + TOKEN + '/api/share']);
  });

  it('posts guest comments with the action header, the honeypot and the current slide, and remembers the name', async () => {
    const posts: { body: Record<string, unknown>; headers: Headers }[] = [];
    render(<SemuraiShareViewer token={TOKEN} fetcher={fetcher('comment', posts)} />);
    await screen.findByText('Świetne');
    expect(screen.getAllByText('Gość').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Napisz komentarz…' }), { target: { value: 'Popraw kolory' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij komentarz' }));
    await screen.findByText('Podaj swoje imię.');
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Twoje imię' }), { target: { value: '  Jan   Kowalski ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij komentarz' }));
    await screen.findByText('Popraw kolory');
    expect(posts[0]!.headers.get('X-Creative-Action')).toBe('share-comment');
    expect(posts[0]!.body).toEqual({ action: 'create', id: expect.any(String), text: 'Popraw kolory', guest_name: 'Jan Kowalski', website: '',
      target: { file: 'index.html', version: 3, label: 'Slajd 1', selector: 'body', text: '', slideIndex: 0 } });
    expect(localStorage.getItem('semurai-share-guest-name')).toBe('Jan Kowalski');
    expect(screen.queryByRole('button', { name: /rozwiąż/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /czatu AI/i })).toBeNull();
  });

  it('shows workspace members as the project author, never by name, and guests by their own name', async () => {
    render(<SemuraiShareViewer token={TOKEN} fetcher={fetcher('comment')} />);
    await screen.findByText('Nowy układ');
    const member = [...document.querySelectorAll<HTMLElement>('[data-author-kind="member"]')];
    expect(member).toHaveLength(2);
    for (const entry of member) {
      expect(within(entry).getByText('Autor projektu')).toBeTruthy();
      expect(within(entry).queryByText('Gość')).toBeNull();
      expect(entry.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
    }
    const guest = document.querySelector<HTMLElement>('[data-author-kind="guest"]')!;
    expect(within(guest).getByText('Ola')).toBeTruthy();
    expect(within(guest).getByText('Gość')).toBeTruthy();
    expect(within(guest).getByText('O')).toBeTruthy();
    expect(screen.queryByText('Rozwiązany')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Ukryj komentarze' }).some(button => button.textContent === 'Komentarze2')).toBe(true);
  });

  it('shows the loading state in the browser language before the project arrives', async () => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['de-DE', 'en'] });
    render(<SemuraiShareViewer token={TOKEN} fetcher={vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch} />);
    expect((await screen.findByRole('status')).textContent).toBe('Projekt wird geladen…');
    expect(screen.getByTestId('share-viewer').getAttribute('lang')).toBe('de');
  });

  it('shows a dead link screen for revoked, expired or unknown links', async () => {
    render(<SemuraiShareViewer token={TOKEN} fetcher={fetcher('view', [], 404)} />);
    await screen.findByText('Link wygasł lub został wyłączony.');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
