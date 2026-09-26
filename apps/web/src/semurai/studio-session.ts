/**
 * Sliding renewal of a Studio session. creative-service keeps the session for
 * one grant lifetime (15 min) and renews it through POST <session>/session/refresh
 * while the user keeps working, up to an absolute cap (sessionExpiresAt, 12 h)
 * and until two hours without activity. The browser never sees the grant.
 */
export interface StudioSessionState { expiresAt: number; sessionExpiresAt: number }

/** Renew this long before the session ends. */
export const STUDIO_REFRESH_LEAD_MS = 3 * 60_000;
/** On focus or when the tab becomes visible, renew right away when the end is this close. */
export const STUDIO_REFRESH_ON_RETURN_MS = 5 * 60_000;
/** A failed renewal (network, 5xx, 429) is retried after this delay while the session still runs. */
export const STUDIO_REFRESH_RETRY_MS = 30_000;
/** Show "save your changes" once the absolute cap is this close. */
export const STUDIO_CAP_NOTICE_MS = 10 * 60_000;

export interface StudioSessionRenewalOptions {
  /** The session base path, e.g. /studio/<id>/. */
  path: string;
  initial: StudioSessionState;
  onChange: (state: StudioSessionState) => void;
  /** The session ended: renewal refused (401), or its end passed without a successful renewal. */
  onExpired: () => void;
  fetcher?: typeof fetch;
  now?: () => number;
  target?: Window;
}

function readState(value: unknown): StudioSessionState | null {
  const data = value as Partial<StudioSessionState> | null;
  return data && Number.isFinite(data.expiresAt) && Number.isFinite(data.sessionExpiresAt)
    ? { expiresAt: Number(data.expiresAt), sessionExpiresAt: Number(data.sessionExpiresAt) } : null;
}

/**
 * Keeps a Studio session alive: renews STUDIO_REFRESH_LEAD_MS before it ends,
 * again on focus or return to the tab when the end is near, and reports user
 * input (pointer, keyboard) since the last renewal as `active`, so idle tabs
 * lapse. Returns a stop function.
 */
export function startStudioSessionRenewal(options: StudioSessionRenewalOptions): () => void {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const now = options.now ?? Date.now;
  const target = options.target ?? window;
  let state = options.initial;
  let active = false;
  let stopped = false;
  let inflight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expire = () => { if (stopped) return; stop(); options.onExpired(); };
  function schedule(delay?: number) {
    clearTimeout(timer);
    if (stopped) return;
    const left = state.expiresAt - now();
    if (left <= 0) { expire(); return; }
    // Nothing is left to renew once the session ends at its absolute cap.
    if (state.expiresAt >= state.sessionExpiresAt) { timer = setTimeout(expire, left); return; }
    timer = setTimeout(() => { void refresh(); }, Math.min(left, Math.max(0, delay ?? left - STUDIO_REFRESH_LEAD_MS)));
  }
  async function refresh() {
    if (stopped || inflight) return;
    if (state.expiresAt <= now()) { expire(); return; }
    inflight = true;
    const wasActive = active;
    active = false;
    let status = 0, next: StudioSessionState | null = null;
    try {
      const response = await fetcher(options.path + 'session/refresh', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Creative-Action': 'session' }, body: JSON.stringify({ active: wasActive }),
      });
      status = response.status;
      if (response.ok) next = readState(await response.json().catch(() => null));
    } catch { status = 0; }
    inflight = false;
    if (stopped) return;
    if (status === 401 || status === 403) { expire(); return; }
    if (!next) {
      // Keep the activity for the next attempt; retry while the session still runs.
      active = active || wasActive;
      schedule(STUDIO_REFRESH_RETRY_MS);
      return;
    }
    state = next;
    options.onChange(state);
    schedule();
  }
  const input = () => { active = true; };
  const returned = () => {
    if (stopped || (target.document?.visibilityState === 'hidden')) return;
    if (state.expiresAt - now() <= STUDIO_REFRESH_ON_RETURN_MS) void refresh();
  };
  function stop() {
    stopped = true;
    clearTimeout(timer);
    target.removeEventListener('pointerdown', input, true);
    target.removeEventListener('keydown', input, true);
    target.removeEventListener('focus', returned);
    target.document?.removeEventListener('visibilitychange', returned);
  }
  target.addEventListener('pointerdown', input, true);
  target.addEventListener('keydown', input, true);
  target.addEventListener('focus', returned);
  target.document?.addEventListener('visibilitychange', returned);
  schedule();
  return stop;
}

/** Whole minutes until the absolute cap when it is within STUDIO_CAP_NOTICE_MS, otherwise null. */
export function studioCapMinutes(state: StudioSessionState, at: number): number | null {
  const left = state.sessionExpiresAt - at;
  return left > 0 && left <= STUDIO_CAP_NOTICE_MS ? Math.max(1, Math.ceil(left / 60_000)) : null;
}

export const studioSessionCopy = {
  pl: { capNotice: 'Sesja wygaśnie za {n} min. Zapisz zmiany.' },
  en: { capNotice: 'This session ends in {n} min. Save your changes.' },
  de: { capNotice: 'Die Sitzung endet in {n} Min. Speichere deine Änderungen.' },
};
