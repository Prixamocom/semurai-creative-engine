'use client';

// Development-only harness: opens the Studio editor against an in-memory
// project so the editor can be inspected without Semurai Core. It is loaded
// only from app/semurai-studio-dev in `next dev` and never shipped.
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { StudioContext } from '../studio-context';
import { StudioEditor } from '../StudioEditor';
import { DEV_LANDING_HTML, DEV_MEDIA, DEV_SESSION_PATH, devStudioContext } from './fixtures';

type Locale = StudioContext['project']['uiLocale'];
interface DevVersion { id: string; version: number; kind: string; created_at: string; document: unknown }

function installStubs() {
  const originalFetch = window.fetch.bind(window);
  const OriginalEventSource = window.EventSource;
  const versions: DevVersion[] = [{ id: 'dev-v1', version: 1, kind: 'generate', created_at: new Date().toISOString(), document: { version: 1, kind: 'page', name: 'Lumen', html: DEV_LANDING_HTML, notes: [] } }];
  const current = () => versions[versions.length - 1]!;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.href).pathname;
    if (!path.startsWith(DEV_SESSION_PATH)) return originalFetch(input, init);
    const endpoint = path.slice(DEV_SESSION_PATH.length).replace(/^project\//, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const latest = current();
    if (endpoint === 'document' && method === 'PUT') {
      versions.push({ id: 'dev-v' + (latest.version + 1), version: latest.version + 1, kind: 'manual', created_at: new Date().toISOString(), document: body.document });
      return json({ ok: true });
    }
    if (endpoint === 'document') return json({ id: latest.id, version: latest.version, document: latest.document, document_hash: 'dev-hash-' + latest.version });
    if (endpoint === 'versions') return json([...versions].reverse().map(({ document: _document, ...version }) => version));
    if (endpoint === 'media/search') return json(DEV_MEDIA);
    if (endpoint === 'media/upload') return json({ ...DEV_MEDIA[0]!, id: 'dev-upload-' + Date.now(), title: body.title ?? 'upload', dataUrl: body.image_data ?? DEV_MEDIA[0]!.dataUrl });
    if (endpoint === 'jobs' && method === 'POST') return json({ id: 'dev-job', status: 'failed', operation: 'edit', brief: body.brief ?? '', created_at: new Date().toISOString() });
    return json([]);
  };
  // Live chat events need Semurai Core; the harness keeps the stream silent.
  class SilentEventSource extends EventTarget {
    readonly url: string; readyState = 1; onmessage = null; onerror = null; onopen = null;
    constructor(url: string | URL) { super(); this.url = String(url); }
    close() { this.readyState = 2; }
  }
  window.EventSource = function (url: string | URL, options?: EventSourceInit) {
    return new URL(String(url), window.location.href).pathname.startsWith(DEV_SESSION_PATH) ? new SilentEventSource(url) : new OriginalEventSource(url, options);
  } as unknown as typeof EventSource;
  return () => { window.fetch = originalFetch; window.EventSource = OriginalEventSource; };
}

export function StudioDevHarness() {
  const { setLocale } = useI18n();
  const [context, setContext] = useState<StudioContext | null>(null);
  useEffect(() => {
    const restore = installStubs();
    const requested = new URLSearchParams(window.location.search).get('locale');
    const locale: Locale = requested === 'en' || requested === 'de' ? requested : 'pl';
    setLocale(locale);
    setContext(devStudioContext(locale, window.location.origin));
    return restore;
  }, [setLocale]);
  return context ? <StudioEditor context={context} sessionPath={DEV_SESSION_PATH} onClose={() => {}} /> : null;
}
