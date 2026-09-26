'use client';

// Development-only harness: opens the Studio editor against an in-memory
// project so the editor can be inspected without Semurai Core. It is loaded
// only from app/semurai-studio-dev in `next dev` and never shipped.
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import type { StudioContext } from '../studio-context';
import { StudioEditor } from '../StudioEditor';
import { SemuraiShareViewer } from '../ShareViewer';
import { setStudioFontProxyOrigin } from '../studio-fonts';
import { DEV_FIRST_PROMPT, DEV_MEDIA, DEV_SESSION_PATH, DEV_SHARE_TOKEN, devComments, devDocument, devShareFetch, devShares, devStudioContext, type DevFixture } from './fixtures';

type Locale = StudioContext['project']['uiLocale'];
interface DevVersion { id: string; version: number; kind: string; created_at: string; document: unknown; summary?: string }
interface DevComment { id: string; text: string; resolved: boolean; revision: number; author: string; created_at: string; target: unknown; replies: { id: string; text: string; author: string; created_at: string }[] }

function installStubs(fixture: DevFixture, sharing: 'on' | 'unavailable') {
  const originalFetch = window.fetch.bind(window);
  const OriginalEventSource = window.EventSource;
  // A long first prompt (with an unbroken URL) keeps the history drawer's clamping visible.
  const versions: DevVersion[] = [{ id: 'dev-v1', version: 1, kind: 'generate', created_at: new Date().toISOString(), document: devDocument(fixture), summary: DEV_FIRST_PROMPT }];
  let comments: DevComment[] = devComments(fixture);
  let shares = devShares();
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
    const versionMatch = /^versions\/([^/]+)(\/restore)?$/.exec(endpoint);
    const record = versionMatch ? versions.find(item => item.id === versionMatch[1]) : undefined;
    if (versionMatch && !record) return json(null, 404);
    if (record && versionMatch?.[2] && method === 'POST') {
      versions.push({ id: 'dev-v' + (latest.version + 1), version: latest.version + 1, kind: 'restore', created_at: new Date().toISOString(), document: record.document });
      return json({ ok: true });
    }
    if (record) return json(record);
    if (endpoint === 'comments' && method === 'POST') {
      const now = new Date().toISOString();
      if (body.action === 'create') comments = [...comments, { id: body.id, text: body.text, target: body.target, resolved: false, revision: 1, author: 'Dev', created_at: now, replies: [] }];
      else comments = comments.map(item => item.id !== body.id ? item : body.action === 'reply'
        ? { ...item, revision: item.revision + 1, replies: [...item.replies, { id: body.reply_id, text: body.text, author: 'Dev', created_at: now }] }
        : { ...item, revision: item.revision + 1, resolved: body.action === 'resolve' });
      return json(comments);
    }
    if (endpoint === 'comments') return json(comments);
    if (endpoint.startsWith('shares') && sharing === 'unavailable') return json(null, 404);
    if (endpoint === 'shares' && method === 'POST') {
      const created = { ...shares[0]!, id: crypto.randomUUID(), permission: body.permission, label: body.label ?? null, status: 'active' as const, created_at: new Date().toISOString(),
        expires_at: body.expires_in_days ? new Date(Date.now() + body.expires_in_days * 86_400_000).toISOString() : null, last_viewed_at: null, view_count: 0, guest_comment_count: 0,
        url: window.location.origin + '/s/' + crypto.randomUUID().replace(/-/g, '').padEnd(43, 'x').slice(0, 43) };
      shares = [created, ...shares];
      return json(created, 201);
    }
    if (endpoint === 'shares') return json(shares);
    const shareMatch = /^shares\/([^/]+)(\/revoke)?$/.exec(endpoint);
    if (shareMatch && method === 'POST') {
      const share = shares.find(item => item.id === shareMatch[1]);
      if (!share) return json(null, 404);
      if (shareMatch[2]) { shares = shares.filter(item => item !== share); return json({ id: share.id, revoked: true }); }
      const updated = { ...share, ...(body.permission ? { permission: body.permission } : {}) };
      shares = shares.map(item => item === share ? updated : item);
      return json(updated);
    }
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
  const [viewer, setViewer] = useState<{ fetcher: typeof fetch } | null>(null);
  const [notice, setNotice] = useState<string | undefined>();
  useEffect(() => {
    // ?locale=pl|en|de, ?fixture=deck for a presentation (default: two-file landing page).
    // ?fontProxy=<origin> serves Google Fonts from a local creative-service (/gf proxy);
    // without it the fonts fall back, since `next dev` has no /gf routes.
    // ?sharing=unavailable answers 404 on the share endpoints; ?notice=1 shows the session cap countdown.
    // ?share=comment|view|gone|limited opens the public share viewer instead (UI locale from the browser).
    const query = new URLSearchParams(window.location.search);
    setStudioFontProxyOrigin(query.get('fontProxy'));
    const fixture: DevFixture = query.get('fixture') === 'deck' ? 'deck' : 'page';
    const share = query.get('share');
    if (share === 'comment' || share === 'view' || share === 'gone' || share === 'limited') {
      setViewer({ fetcher: devShareFetch(fixture, share) });
      return () => { setStudioFontProxyOrigin(null); };
    }
    const restore = installStubs(fixture, query.get('sharing') === 'unavailable' ? 'unavailable' : 'on');
    if (query.get('notice') === '1') setNotice('Sesja wygaśnie za 7 min. Zapisz zmiany.');
    const requested = query.get('locale');
    const locale: Locale = requested === 'en' || requested === 'de' ? requested : 'pl';
    setLocale(locale);
    setContext(devStudioContext(locale, window.location.origin, fixture));
    return () => { restore(); setStudioFontProxyOrigin(null); };
  }, [setLocale]);
  if (viewer) return <SemuraiShareViewer token={DEV_SHARE_TOKEN} fetcher={viewer.fetcher} />;
  return context ? <StudioEditor context={context} sessionPath={DEV_SESSION_PATH} sessionNotice={notice} onClose={() => {}} /> : null;
}
