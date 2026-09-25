'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Studio UI theme: light, dark or following the system. The choice is kept per
 * browser (localStorage) and applied as data-studio-theme="light|dark" on the
 * Studio root elements, never on <html>: app/layout.tsx pins data-theme="light"
 * there for the upstream app, and the Studio tokens are scoped to its own root.
 */
export type StudioThemePreference = 'light' | 'dark' | 'system';
export type StudioTheme = 'light' | 'dark';
export const STUDIO_THEME_KEY = 'semurai-studio-theme';
const QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

export function readStudioThemePreference(): StudioThemePreference {
  try {
    const value = localStorage.getItem(STUDIO_THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch { return 'system'; }
}

export function writeStudioThemePreference(value: StudioThemePreference): void {
  try {
    if (value === 'system') localStorage.removeItem(STUDIO_THEME_KEY); else localStorage.setItem(STUDIO_THEME_KEY, value);
  } catch { /* Storage can be disabled; the choice then lasts for this page only. */ }
  memory = value;
  listeners.forEach(listener => listener());
}

// Keeps the choice when storage is unavailable (private mode, blocked site data).
let memory: StudioThemePreference | null = null;
function preferenceSnapshot(): StudioThemePreference {
  const stored = readStudioThemePreference();
  return stored === 'system' && memory ? memory : stored;
}
function systemSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === STUDIO_THEME_KEY) { memory = null; listener(); } };
  window.addEventListener('storage', storage);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
  media?.addEventListener?.('change', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage); media?.removeEventListener?.('change', listener); };
}

export function resolveStudioTheme(preference: StudioThemePreference, systemDark: boolean): StudioTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

/** The preference, the theme it resolves to right now, and a setter that persists it. */
export function useStudioTheme(): { preference: StudioThemePreference; theme: StudioTheme; setPreference: (value: StudioThemePreference) => void } {
  // The static export prerenders in light; the stored choice applies on hydration.
  const preference = useSyncExternalStore(subscribe, preferenceSnapshot, () => 'system' as const);
  const systemDark = useSyncExternalStore(subscribe, systemSnapshot, () => false);
  const setPreference = useCallback((value: StudioThemePreference) => writeStudioThemePreference(value), []);
  return { preference, theme: resolveStudioTheme(preference, systemDark), setPreference };
}
