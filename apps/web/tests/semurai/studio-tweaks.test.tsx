// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { classifyStudioTweak, setStudioTweak, stepStudioTweak, studioTweakError, studioTweakGroups, studioTweaks } from '../../src/semurai/studio-tweaks';

const projectId = '11111111-2222-4333-8444-555555555555';
const sheet = `
  /* Brand tokens; a "<style" in a comment is ignored. */
  :root {
    --brand: #1A74FF;
    --ink:rgb(29, 29, 31);
    --paper: white;
    --font-body: "Inter", system-ui, sans-serif;
    --font-size-lg: 1.25rem;
    --line-height-body: 1.6;
    --font-weight-bold: 700;
    --space-4: 16px;
    --radius-md: 8px !important;
    --max-width: 1200px;
    --link-color: var(--brand);
    --shadow: 0 1px 2px rgba(0, 0, 0, .2);
    --grid: repeat(3, minmax(0, 1fr));
    color: var(--ink);
  }
  @media (prefers-color-scheme: dark) { :root { --paper: #111; } }
  .card { --space-4: 99px; padding: var(--space-4); }
  html, body { --gutter: 24px; }
  :root { --brand: #e33448; }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${sheet}</style>
<script>const fake = "<style>:root{--fake:1px}</style>";</script></head><body><h1 data-od-id="hero" style="color: var(--brand)">Hello</h1></body></html>`;

describe('design variables (Tweaks)', () => {
  it('reads root-scope variables in source order, later declarations winning, and skips other scopes', () => {
    const tweaks = studioTweaks(html);
    expect(tweaks.map(item => [item.name, item.value])).toEqual([
      ['--brand', '#e33448'], ['--ink', 'rgb(29, 29, 31)'], ['--paper', 'white'], ['--font-body', '"Inter", system-ui, sans-serif'], ['--font-size-lg', '1.25rem'],
      ['--line-height-body', '1.6'], ['--font-weight-bold', '700'], ['--space-4', '16px'], ['--radius-md', '8px'], ['--max-width', '1200px'],
      ['--link-color', 'var(--brand)'], ['--shadow', '0 1px 2px rgba(0, 0, 0, .2)'], ['--grid', 'repeat(3, minmax(0, 1fr))'], ['--gutter', '24px'],
    ]);
    // Every remembered range points at exactly the value in the file.
    for (const tweak of tweaks) expect(html.slice(tweak.start, tweak.end)).toBe(tweak.value);
    expect(tweaks.some(item => item.name === '--fake')).toBe(false);
  });

  it('groups colors, typography, spacing and radii, and the rest', () => {
    const groups = studioTweakGroups(studioTweaks(html));
    expect(groups.map(({ group, items }) => [group, items.map(item => item.name + ':' + item.kind)])).toEqual([
      ['color', ['--brand:color', '--ink:color', '--paper:color', '--link-color:text']],
      ['type', ['--font-body:font', '--font-size-lg:length', '--line-height-body:number', '--font-weight-bold:number']],
      ['space', ['--space-4:length', '--radius-md:length', '--gutter:length']],
      ['other', ['--max-width:length', '--shadow:text', '--grid:text']],
    ]);
    expect(classifyStudioTweak('--heading', 'Georgia, serif')).toEqual({ group: 'type', kind: 'font' });
    expect(classifyStudioTweak('--accent', 'oklch(70% 0.1 200)')).toEqual({ group: 'color', kind: 'color' });
  });

  it('rewrites one value and keeps every other byte, including !important', () => {
    const next = setStudioTweak(html, '--radius-md', '12px')!;
    const radius = studioTweaks(html).find(item => item.name === '--radius-md')!;
    expect(next).toBe(html.slice(0, radius.start) + '12px' + html.slice(radius.end));
    expect(next).toContain('--radius-md: 12px !important;');
    expect(next.length - html.length).toBe(1);
    // The later :root wins, so that is the declaration that changes; the first one stays.
    const brand = setStudioTweak(html, '--brand', ' #00aa55 ')!;
    expect(brand).toContain('--brand: #1A74FF;');
    expect(brand).toContain(':root { --brand: #00aa55; }');
    expect(setStudioTweak(html, '--brand', '#e33448')).toBeNull();
    expect(setStudioTweak(html, '--missing', '1px')).toBeNull();
  });

  it('rejects values that would break out of the declaration', () => {
    expect(studioTweakError({ kind: 'length' }, '  ')).toBe('empty');
    expect(studioTweakError({ kind: 'length' }, '4px; } body { display: none')).toBe('unsafe');
    expect(studioTweakError({ kind: 'text' }, 'calc(1px + 2px')).toBe('unsafe');
    expect(studioTweakError({ kind: 'text' }, '"Inter')).toBe('unsafe');
    expect(studioTweakError({ kind: 'text' }, '</style><script>')).toBe('unsafe');
    expect(studioTweakError({ kind: 'color' }, 'not-a-color')).toBe('color');
    expect(studioTweakError({ kind: 'color' }, '#abc')).toBeNull();
    expect(studioTweakError({ kind: 'color' }, 'var(--brand)')).toBeNull();
    expect(studioTweakError({ kind: 'font' }, '"Space Grotesk", sans-serif')).toBeNull();
  });

  it('steps pixels, rem and unitless values, and font weights by a hundred', () => {
    expect(stepStudioTweak('16px', 1, false)).toBe('17px');
    expect(stepStudioTweak('16px', -1, true)).toBe('6px');
    expect(stepStudioTweak('0px', -1, false)).toBe('0px');
    expect(stepStudioTweak('1.25rem', 1, false)).toBe('1.35rem');
    expect(stepStudioTweak('1.6', -1, false)).toBe('1.5');
    expect(stepStudioTweak('700', 1, false)).toBe('800');
    expect(stepStudioTweak('900', 1, true)).toBe('900');
    expect(stepStudioTweak('-2px', -1, false)).toBe('-3px');
    expect(stepStudioTweak('var(--x)', 1, false)).toBeNull();
  });
});

function context(): StudioContext {
  return {
    projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
    project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
  };
}
let source = html;
let puts: { html: string }[] = [];
let posts: string[] = [];
beforeEach(() => {
  localStorage.clear(); puts = []; posts = []; source = html;
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint = String(url).split('/project/')[1]!;
    if (init?.method === 'POST') posts.push(endpoint);
    if (endpoint === 'document' && init?.method === 'PUT') puts.push(JSON.parse(String(init.body)).document);
    const document = puts.at(-1) ?? { version: 1, kind: 'page', name: 'Landing', html: source, notes: [] };
    return new Response(JSON.stringify({ data: endpoint === 'document' ? { id: 'source', version: 1 + puts.length, document_hash: 'hash' + puts.length, document } : [] }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function openTweaks() {
  render(<StudioEditor context={context()} onClose={() => {}} />);
  await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toBeTruthy());
  fireEvent.click(within(screen.getByRole('group', { name: 'Tools' })).getByRole('button', { name: 'Edit' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Tweaks' }));
  return screen.getByTestId('studio-edit-panel');
}
const frameSource = () => document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!.srcdoc;

describe('Tweaks tab in the Edit panel', () => {
  it('edits one variable through the undoable change path and saves the file with only that value changed', async () => {
    const panel = await openTweaks();
    expect(within(panel).getByRole('region', { name: 'Page' })).toBeTruthy();
    expect(within(panel).getByRole('region', { name: 'Colors' })).toBeTruthy();
    expect(within(panel).getByRole('region', { name: 'Spacing and radii' })).toBeTruthy();
    // Design-wide tab: the element layer list is not shown.
    expect(within(panel).queryByRole('button', { name: /Layers/ })).toBeNull();

    const space = within(panel).getByRole('textbox', { name: '--space-4' });
    fireEvent.change(space, { target: { value: '20px' } });
    fireEvent.keyDown(space, { key: 'Enter' });
    await waitFor(() => expect(frameSource()).toContain('--space-4: 20px;'));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();

    // ArrowUp steps and commits right away.
    fireEvent.keyDown(within(panel).getByRole('textbox', { name: '--line-height-body' }), { key: 'ArrowUp' });
    await waitFor(() => expect(frameSource()).toContain('--line-height-body: 1.7;'));

    // An unsafe value is refused inline and nothing changes.
    const brand = within(panel).getByRole('textbox', { name: '--brand' });
    fireEvent.change(brand, { target: { value: 'red; } body { display: none' } });
    fireEvent.keyDown(brand, { key: 'Enter' });
    expect(within(panel).getByRole('alert').textContent).toContain('cannot contain');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(frameSource()).toContain('--line-height-body: 1.6;'));
    expect(frameSource()).toContain('--space-4: 20px;');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const space4 = studioTweaks(html).find(item => item.name === '--space-4')!;
    expect(puts[0]!.html).toBe(html.slice(0, space4.start) + '20px' + html.slice(space4.end));
  });

  it('offers to ask the AI for variables when the file has none, without sending', async () => {
    source = '<!doctype html><html><head><style>body{color:#111}</style></head><body><h1 data-od-id="hero">Hello</h1></body></html>';
    const panel = await openTweaks();
    expect(within(panel).getByText(/no CSS variables on :root/)).toBeTruthy();
    expect(within(panel).getByRole('region', { name: 'Page' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Ask AI for design variables' }));
    const composer = await screen.findByRole('textbox', { name: 'What would you like to change?' });
    expect((composer as HTMLTextAreaElement).value).toMatch(/^Refactor the styles of this file into CSS variables/);
    expect(screen.queryByTestId('studio-edit-panel')).toBeNull();
    expect(posts).not.toContain('jobs');
  });
});
