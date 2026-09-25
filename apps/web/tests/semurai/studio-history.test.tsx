// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import type { StudioChatJob } from '../../src/semurai/studio-chat';
import { studioRelativeTime, studioVersionSource, studioVersionSummary } from '../../src/semurai/studio-history';

const projectId = '11111111-2222-4333-8444-555555555555';
const v1 = 'aaaaaaaa-0000-4000-8000-000000000001', v2 = 'aaaaaaaa-0000-4000-8000-000000000002', v3 = 'aaaaaaaa-0000-4000-8000-000000000003';
const html = (heading: string) => `<!doctype html><html><head></head><body><h1 data-od-id="hero">${heading}</h1></body></html>`;
const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
const job = (overrides: Partial<StudioChatJob>): StudioChatJob => ({ id: 'job', brief: '', status: 'completed', retryable: false, base_version: 0, ...overrides });

describe('version labels', () => {
  it('maps Core version kinds to a source', () => {
    expect(['generate', 'edit', 'ai_conflict', 'manual', 'restore'].map(studioVersionSource)).toEqual(['ai', 'ai', 'ai', 'manual', 'restore']);
  });
  it('shows the prompt of the AI job that produced the version, and nothing for manual saves', () => {
    const jobs = [
      job({ id: 'a', base_version: 1, brief: 'Edit the file index.html within this project. Preserve other files.\nMake the hero darker', completed_at: iso(10) }),
      job({ id: 'b', base_version: 1, brief: 'Older attempt', completed_at: iso(300) }),
      job({ id: 'c', base_version: 2, status: 'failed', brief: 'Failed run' }),
      job({ id: 'd', base_version: 2, brief: 'Edit only the requested part of index.html.\nSelection from version 2:\n{"label":"h1"}\nUser instruction:\nShorter heading', completed_at: iso(1) }),
    ];
    expect(studioVersionSummary({ id: v2, version: 2, kind: 'edit', created_at: iso(10) }, jobs)).toBe('Make the hero darker');
    expect(studioVersionSummary({ id: v3, version: 3, kind: 'edit', created_at: iso(1) }, jobs)).toBe('Shorter heading');
    expect(studioVersionSummary({ id: v2, version: 2, kind: 'manual', created_at: iso(10) }, jobs)).toBe('');
    expect(studioVersionSummary({ id: v2, version: 2, kind: 'manual', created_at: iso(10), summary: 'Core summary' }, jobs)).toBe('Core summary');
  });
  it('formats relative times in the interface language', () => {
    expect(studioRelativeTime(iso(0), 'pl', now)).toBe('teraz');
    expect(studioRelativeTime(iso(5), 'pl', now)).toBe('5 minut temu');
    expect(studioRelativeTime(iso(24 * 60), 'pl', now)).toBe('wczoraj');
    expect(studioRelativeTime(iso(3 * 60), 'en', now)).toBe('3 hours ago');
    expect(studioRelativeTime('not a date', 'en', now)).toBe('');
  });
});

let posts: string[] = [];
beforeEach(() => {
  localStorage.clear(); posts = [];
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint = String(url).split('/project/')[1];
    if (init?.method === 'POST') posts.push(endpoint!);
    const data = endpoint === 'document' ? { id: 'source', version: 3, document_hash: 'hash3', document: { version: 1, kind: 'page', name: 'Landing', html: html('Current heading'), notes: [] } }
      : endpoint === 'versions' ? [
        { id: v3, version: 3, kind: 'manual', created_at: iso(2) },
        { id: v2, version: 2, kind: 'restore', created_at: iso(60) },
        { id: v1, version: 1, kind: 'generate', created_at: iso(24 * 60) },
      ]
      : endpoint === 'jobs' ? [job({ id: 'first', base_version: 0, brief: 'Build a coffee landing page', completed_at: iso(24 * 60) })]
      : endpoint === 'versions/' + v1 ? { id: v1, version: 1, kind: 'generate', document: { version: 1, kind: 'page', name: 'Landing', html: html('First heading'), notes: [] } }
      : endpoint === 'versions/' + v1 + '/restore' ? { id: projectId } : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const frame = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!;
async function openHistory() {
  render(<StudioEditor context={{ projectId, workspaceId: 'w', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 3, coreOrigin: 'https://core.test' } }} onClose={() => {}} />);
  await waitFor(() => expect(frame()?.srcdoc).toContain('Current heading'));
  fireEvent.click(screen.getByRole('button', { name: 'History · Version 3' }));
  return screen.getByRole('complementary', { name: 'History' });
}

describe('version history drawer', () => {
  it('lists each version with its number, source, relative time and prompt, and marks the current one', async () => {
    const drawer = await openHistory();
    const rows = await waitFor(() => { const items = within(drawer).getAllByRole('button').filter(item => item.textContent?.startsWith('Version')); expect(items).toHaveLength(3); return items; });
    expect(rows[0]!.textContent).toContain('Version 3');
    expect(rows[0]!.textContent).toContain('Manual edit');
    expect(rows[0]!.textContent).toContain('Current');
    expect(rows[0]!.getAttribute('aria-current')).toBe('true');
    expect(rows[1]!.textContent).toContain('Restored');
    expect(rows[1]!.textContent).toContain('1 hour ago');
    expect(rows[2]!.textContent).toContain('AI');
    expect(rows[2]!.textContent).toContain('yesterday');
    expect(rows[2]!.textContent).toContain('Build a coffee landing page');
    expect(rows[2]!.getAttribute('aria-current')).toBeNull();
  });

  it('previews a version read-only without touching the working document', async () => {
    const drawer = await openHistory();
    const oldest = await waitFor(() => within(drawer).getByRole('button', { name: /^Version 1/ }));
    fireEvent.click(oldest);
    const banner = await screen.findByText('Previewing version 1');
    expect(banner.closest('[role="status"]')!.textContent).toContain('Read only');
    await waitFor(() => expect(frame().srcdoc).toContain('First heading'));
    expect(oldest.getAttribute('aria-pressed')).toBe('true');
    // The working document stays saved and unchanged; editing tools are off.
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Edit' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Source' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByText('Previewing version 1')).toBeNull();
    await waitFor(() => expect(frame().srcdoc).toContain('Current heading'));
    expect(posts).toEqual([]);
  });

  it('asks before restoring, and Escape or Cancel keep everything as it was', async () => {
    const drawer = await openHistory();
    fireEvent.click(await waitFor(() => within(drawer).getByRole('button', { name: /^Version 1/ })));
    await screen.findByText('Previewing version 1');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    let dialog = screen.getByRole('alertdialog', { name: 'Restore version 1?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Previewing version 1')).toBeTruthy();
    expect(posts).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    dialog = screen.getByRole('alertdialog', { name: 'Restore version 1?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore version' }));
    await waitFor(() => expect(posts).toEqual(['versions/' + v1 + '/restore']));
    await waitFor(() => expect(screen.queryByText('Previewing version 1')).toBeNull());
  });

  it('clicking the current version closes a preview', async () => {
    const drawer = await openHistory();
    fireEvent.click(await waitFor(() => within(drawer).getByRole('button', { name: /^Version 1/ })));
    await screen.findByText('Previewing version 1');
    fireEvent.click(within(drawer).getByRole('button', { name: /^Version 3/ }));
    expect(screen.queryByText('Previewing version 1')).toBeNull();
  });
});
