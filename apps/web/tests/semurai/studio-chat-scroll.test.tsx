// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { STUDIO_CHAT_STICK_PX, useStudioChatScroll } from '../../src/semurai/studio-chat-scroll';

// jsdom has no layout: every log reports the height set here and remembers its scrollTop.
let height = 1000;
const tops = new WeakMap<Element, number>();
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { tops.set(this, Number(options.top)); });
let reduced = false;

beforeEach(() => {
  height = 1000; reduced = false; scrollTo.mockClear();
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => height });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get() { return tops.get(this) ?? 0; }, set(value: number) { tops.set(this, Math.min(value, height - 200)); } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, writable: true, value: scrollTo });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  for (const key of ['scrollHeight', 'clientHeight', 'scrollTop', 'scrollTo']) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
});

function Harness({ shown = true, revealed = false, jobs, onFollow }: { shown?: boolean; revealed?: boolean; jobs: string[]; onFollow?: (follow: () => void) => void }) {
  const chat = useStudioChatScroll({ shown, revealed, jobs, live: null });
  onFollow?.(chat.follow);
  return shown ? <div data-testid="log" ref={chat.log} onScroll={chat.onScroll}>{jobs.map(job => <p key={job}>{job}</p>)}</div> : <p>Comments</p>;
}
const log = () => screen.queryByTestId('log') ?? screen.getByRole('log');
function userScroll(top: number) { log().scrollTop = top; fireEvent.scroll(log()); }

describe('Studio chat scroll', () => {
  it('opens at the newest message when the chat is shown again', () => {
    const view = render(<Harness shown={false} jobs={['a', 'b']} />);
    view.rerender(<Harness shown jobs={['a', 'b']} />);
    expect(log().scrollTop).toBe(800);
  });

  it('jumps to the end after a mode switch even if the user had scrolled up', () => {
    const view = render(<Harness jobs={['a']} />);
    userScroll(100);
    view.rerender(<Harness shown={false} jobs={['a']} />);
    view.rerender(<Harness shown jobs={['a']} />);
    expect(log().scrollTop).toBe(800);
  });

  it('jumps to the end when the mobile panel is revealed', () => {
    const view = render(<Harness jobs={['a']} />);
    userScroll(100);
    view.rerender(<Harness revealed jobs={['a']} />);
    expect(log().scrollTop).toBe(800);
  });

  it('follows streamed content while the user is near the end', () => {
    const view = render(<Harness jobs={['a']} />);
    userScroll(800 - STUDIO_CHAT_STICK_PX + 10);
    height = 1400;
    view.rerender(<Harness jobs={['a', 'b']} />);
    expect(log().scrollTop).toBe(1200);
  });

  it('leaves the view alone when the user scrolled up to read history', () => {
    const view = render(<Harness jobs={['a']} />);
    userScroll(300);
    height = 1400;
    view.rerender(<Harness jobs={['a', 'b']} />);
    expect(log().scrollTop).toBe(300);
    // Scrolling back to the end pins the log again.
    userScroll(1200);
    height = 1800;
    view.rerender(<Harness jobs={['a', 'b', 'c']} />);
    expect(log().scrollTop).toBe(1600);
  });

  it('scrolls smoothly to the new turn after sending, even from older messages', () => {
    let follow = () => {};
    const view = render(<Harness jobs={['a']} onFollow={value => { follow = value; }} />);
    userScroll(100);
    act(() => follow());
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' });
    height = 1400;
    view.rerender(<Harness jobs={['a', 'sent']} onFollow={value => { follow = value; }} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1400, behavior: 'smooth' });
    expect(log().scrollTop).toBe(1400);
  });

  it('does not animate when the user prefers reduced motion', () => {
    reduced = true;
    let follow = () => {};
    const view = render(<Harness jobs={['a']} onFollow={value => { follow = value; }} />);
    userScroll(100);
    act(() => follow());
    height = 1400;
    view.rerender(<Harness jobs={['a', 'sent']} onFollow={value => { follow = value; }} />);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(log().scrollTop).toBe(1200);
  });
});

describe('Studio editor chat log', () => {
  const projectId = '11111111-2222-4333-8444-555555555555';
  const context: StudioContext = {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/studio/' + projectId + '/');
    const document = { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html: '<!doctype html><html><body><h1>Hi</h1></body></html>', notes: [] } };
    const jobs = [{ id: 'job', brief: 'Build a landing page', status: 'completed', retryable: false, base_version: 0 }];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const endpoint = String(url).split('/project/')[1];
      return new Response(JSON.stringify({ data: endpoint === 'document' ? document : endpoint === 'jobs' ? jobs : [] }), { status: 200 });
    }));
  });

  it('returns to the newest message after the Comment tool', async () => {
    render(<StudioEditor context={context} onClose={() => {}} />);
    await screen.findByText('Build a landing page');
    userScroll(100);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Comment' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(screen.queryByRole('log')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0]!);
    expect(screen.getByRole('log').scrollTop).toBe(800);
  });
});
