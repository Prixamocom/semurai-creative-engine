// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

const projectId = '11111111-2222-4333-8444-555555555555';
const html = '<!doctype html><html><head><style>section{height:2400px}</style></head><body><section><h1 data-od-id="hero">Welcome</h1></section></body></html>';
const context: StudioContext = {
  projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
  project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
};
const hero: ManualEditTarget = {
  id: 'hero', kind: 'text', label: 'Heading', tagName: 'h1', className: '', text: 'Welcome', rect: { x: 0, y: 1500, width: 400, height: 40 },
  fields: { text: 'Welcome' }, attributes: { 'data-od-id': 'hero' }, styles: { ...emptyManualEditStyles(), fontSize: '32px' }, isLayoutContainer: false, outerHtml: '<h1 data-od-id="hero">Welcome</h1>',
};

function fromPreview(frame: HTMLIFrameElement, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }));
}
function restoreMessages(post: ReturnType<typeof vi.fn>) {
  return post.mock.calls.map(([message]) => message).filter(message => message?.type === 'od:preview-scroll-restore');
}

beforeEach(() => {
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  const saved = { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html, notes: [] } };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const endpoint = String(url).split('/project/')[1];
    return new Response(JSON.stringify({ data: endpoint === 'document' ? saved : [] }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Studio preview scroll during manual edits', () => {
  it('returns the reloaded preview to the scrolled position after a font size change', async () => {
    render(<StudioEditor context={context} onClose={() => {}} />);
    const frame = await waitFor(() => { const element = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]'); expect(element?.srcdoc).toContain('Welcome'); return element!; });
    fromPreview(frame, { type: 'od:preview-scroll', frameLeft: 0, frameTop: 1480, canvasLeft: 0, canvasTop: 1480 });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fromPreview(frame, { type: 'od-edit-select', target: hero });
    const size = await screen.findByRole('textbox', { name: 'Font size' });
    fireEvent.change(size, { target: { value: '48px' } });
    const before = frame.srcdoc;
    fireEvent.keyDown(size, { key: 'Enter' });
    await waitFor(() => expect(frame.srcdoc).not.toBe(before));
    expect(frame.srcdoc).toContain('font-size: 48px');

    // The rebuilt document reports its initial top offset first (as seen in
    // production), then asks the host where to scroll.
    const post = vi.spyOn(frame.contentWindow!, 'postMessage') as unknown as ReturnType<typeof vi.fn>;
    fromPreview(frame, { type: 'od:preview-scroll', frameLeft: 0, frameTop: 0, canvasLeft: 0, canvasTop: 0 });
    fromPreview(frame, { type: 'od:preview-scroll-request' });
    expect(restoreMessages(post)).toEqual([{ type: 'od:preview-scroll-restore', frameLeft: 0, frameTop: 1480, canvasLeft: 0, canvasTop: 1480 }]);
  });

  it('keeps the target while the reloaded document reports a clamped offset, then follows the user again', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    render(<StudioEditor context={context} onClose={() => {}} />);
    const frame = await waitFor(() => { const element = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]'); expect(element?.srcdoc).toContain('Welcome'); return element!; });
    fromPreview(frame, { type: 'od:preview-scroll', frameLeft: 0, frameTop: 1480, canvasLeft: 0, canvasTop: 1480 });
    const post = vi.spyOn(frame.contentWindow!, 'postMessage') as unknown as ReturnType<typeof vi.fn>;

    fromPreview(frame, { type: 'od:preview-scroll-request' });
    // Layout is still shorter than the page, so the restore lands short of the target.
    fromPreview(frame, { type: 'od:preview-scroll', frameLeft: 0, frameTop: 600, canvasLeft: 0, canvasTop: 600 });
    fromPreview(frame, { type: 'od:preview-scroll-request' });
    expect(restoreMessages(post).map(message => message.frameTop)).toEqual([1480, 1480]);

    now.mockReturnValue(20_000);
    fromPreview(frame, { type: 'od:preview-scroll', frameLeft: 0, frameTop: 320, canvasLeft: 0, canvasTop: 320 });
    fromPreview(frame, { type: 'od:preview-scroll-request' });
    expect(restoreMessages(post).at(-1)).toMatchObject({ frameTop: 320, canvasTop: 320 });
  });
});
