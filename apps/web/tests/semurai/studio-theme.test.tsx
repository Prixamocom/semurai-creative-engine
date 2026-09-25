// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import type { StudioContext } from '../../src/semurai/studio-context';
import { readStudioThemePreference, resolveStudioTheme, STUDIO_THEME_KEY, writeStudioThemePreference } from '../../src/semurai/studio-theme';

const projectId = '11111111-2222-4333-8444-555555555555';
const context: StudioContext = {
  projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
  project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
};
function stubDarkSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = { matches: dark, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return { flip(value: boolean) { media.matches = value; listeners.forEach(listener => listener()); } };
}

beforeEach(() => {
  localStorage.clear(); writeStudioThemePreference('system'); localStorage.clear();
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const endpoint = String(url).split('/project/')[1];
    const data = endpoint === 'document' ? { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html: '<!doctype html><html><head></head><body><h1>Hi</h1></body></html>', notes: [] } } : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Studio theme preference', () => {
  it('defaults to the system theme and persists an explicit choice', () => {
    expect(readStudioThemePreference()).toBe('system');
    writeStudioThemePreference('dark');
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('dark');
    expect(readStudioThemePreference()).toBe('dark');
    writeStudioThemePreference('system');
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBeNull();
    expect([resolveStudioTheme('system', true), resolveStudioTheme('system', false), resolveStudioTheme('light', true), resolveStudioTheme('dark', false)]).toEqual(['dark', 'light', 'light', 'dark']);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStudioThemePreference()).toBe('system');
    expect(() => writeStudioThemePreference('dark')).not.toThrow();
  });
});

describe('Studio theme on the editor root', () => {
  const root = () => screen.getByTestId('semurai-studio-editor');
  async function open() {
    render(<StudioEditor context={context} onClose={() => {}} />);
    await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toBeTruthy());
  }

  it('follows the system theme by default and reacts when it changes', async () => {
    const system = stubDarkSystem(true);
    await open();
    expect(root().getAttribute('data-studio-theme')).toBe('dark');
    system.flip(false);
    await waitFor(() => expect(root().getAttribute('data-studio-theme')).toBe('light'));
  });

  it('switches from the overflow menu, persists the choice and never touches <html>', async () => {
    stubDarkSystem(false);
    document.documentElement.setAttribute('data-theme', 'light');
    await open();
    expect(root().getAttribute('data-studio-theme')).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    const group = within(screen.getByRole('menu')).getByRole('group', { name: 'Theme' });
    expect(within(group).getAllByRole('menuitemradio').map(item => [item.textContent, item.getAttribute('aria-checked')])).toEqual([['Light', 'false'], ['Dark', 'false'], ['System', 'true']]);
    fireEvent.click(within(group).getByRole('menuitemradio', { name: 'Dark' }));
    expect(root().getAttribute('data-studio-theme')).toBe('dark');
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Light' }));
    expect(root().getAttribute('data-studio-theme')).toBe('light');
    expect(localStorage.getItem(STUDIO_THEME_KEY)).toBe('light');
  });

  it('restores a stored choice on the next open', async () => {
    stubDarkSystem(false);
    localStorage.setItem(STUDIO_THEME_KEY, 'dark');
    await open();
    expect(root().getAttribute('data-studio-theme')).toBe('dark');
  });
});
