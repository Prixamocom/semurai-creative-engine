// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';

const projectId = '11111111-2222-4333-8444-555555555555';
const context: StudioContext = {
  projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
  project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
};
const page = (text: string) => `<!doctype html><html><head></head><body><h1>${text}</h1></body></html>`;
const version = (number: number, text: string) => ({ id: 'v' + number, version: number, document_hash: 'hash' + number, document: { version: 1, kind: 'page', name: 'Landing', html: page(text), notes: [] } });
const job = (status: string) => ({ id: 'job-1', run_id: 'run-1', status, operation: 'edit', brief: 'Edit the file index.html within this project. Preserve other files.\nNew heading', base_version: 1, events: [], assistant_messages: [], created_at: new Date().toISOString() });

class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, (event: MessageEvent) => void>();
  constructor(public url: string) { FakeEventSource.last = this; }
  addEventListener(type: string, listener: (event: MessageEvent) => void) { this.listeners.set(type, listener); }
  close() {}
  emit(type: string, data: unknown) { this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) })); }
}

let finished = false;
beforeEach(() => {
  finished = false;
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const endpoint = String(url).split('/project/')[1];
    const data = endpoint === 'document' ? (finished ? version(2, 'After') : version(1, 'Before'))
      : endpoint === 'jobs' ? [job(finished ? 'completed' : 'generating')] : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); FakeEventSource.last = null; });

describe('Studio adopts a finished run from the live stream', () => {
  it('refreshes right after the stream reports the run as completed, without waiting for the job poll', async () => {
    render(<StudioEditor context={context} onClose={() => {}} />);
    const frame = await waitFor(() => { const element = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]'); expect(element?.srcdoc).toContain('Before'); return element!; });
    const fetchMock = vi.mocked(fetch);
    vi.useFakeTimers();
    const before = fetchMock.mock.calls.length;
    finished = true;
    act(() => { FakeEventSource.last!.emit('chat', [{ runId: 'run-1', status: 'completed', messages: [] }]); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    vi.useRealTimers();
    await waitFor(() => expect(frame.srcdoc).toContain('After'));
  });

  it('does not refresh for runs that are already finished in the job list', async () => {
    finished = true;
    render(<StudioEditor context={context} onClose={() => {}} />);
    await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toContain('After'));
    const fetchMock = vi.mocked(fetch);
    vi.useFakeTimers();
    const before = fetchMock.mock.calls.length;
    act(() => { FakeEventSource.last!.emit('chat', [{ runId: 'run-1', status: 'completed', messages: [] }]); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
