'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@open-design/components';
import { ChevronDown, Copy, Eye, Link2, MessageSquare, Share2, X } from 'lucide-react';
import { StudioButton, StudioMenu, StudioMenuItem } from './StudioButton';
import { StudioToast } from './StudioFeedback';
import { SHARE_EXPIRY_DAYS, shareCopy, shareCount, shareExpiryLabel, shareSupported, type ShareExpiry, type ShareItem, type ShareLocale, type SharePermission } from './studio-share';
import styles from './StudioShareDialog.module.css';

/** The Studio `api` helper; failures carry the HTTP status and Laravel's message code. */
export type StudioShareApi = (endpoint: string, method?: string, body?: unknown) => Promise<{ data: unknown }>;
interface ApiFailure { status?: number; code?: string }

function failureMessage(error: unknown, locale: ShareLocale): string {
  const c = shareCopy[locale];
  const { status, code } = (error ?? {}) as ApiFailure;
  if (code === 'creative.share_empty') return c.empty;
  if (code === 'creative.share_limit') return c.limit;
  if (code === 'creative.share_unsupported') return c.unsupported;
  return status === 404 || status === 503 ? c.unavailable : c.error;
}

/** Copies the link as text/plain through ClipboardItem, with writeText as the fallback. */
export async function copyShareLink(url: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard) throw new Error('Clipboard unavailable');
  if (typeof ClipboardItem !== 'undefined' && typeof clipboard.write === 'function') {
    try { await clipboard.write([new ClipboardItem({ 'text/plain': new Blob([url], { type: 'text/plain' }) })]); return; }
    catch { /* Some browsers reject text ClipboardItems; writeText below still works there. */ }
  }
  await clipboard.writeText(url);
}

function shortDate(value: string, locale: ShareLocale): string {
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Top bar "Share" button and its dialog: create a link (access, expiry, name),
 * list the project's links with their counts, copy, change access and turn off.
 */
export function StudioShareButton({ locale, artifactType, api, disabled = false }: { locale: ShareLocale; artifactType: string; api: StudioShareApi; disabled?: boolean }) {
  const c = shareCopy[locale];
  const [open, setOpen] = useState(false);
  const supported = shareSupported(artifactType);
  return <>
    <StudioButton variant="secondary" disabled={disabled || !supported} title={supported ? c.title : c.unsupported} aria-label={c.share}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <Share2 size={16} /><span className={styles.triggerLabel}>{c.share}</span>
    </StudioButton>
    {open && <StudioShareDialog locale={locale} api={api} onClose={() => setOpen(false)} />}
  </>;
}

export function StudioShareDialog({ locale, api, onClose }: { locale: ShareLocale; api: StudioShareApi; onClose: () => void }) {
  const c = shareCopy[locale];
  const [links, setLinks] = useState<ShareItem[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [permission, setPermission] = useState<SharePermission>('comment');
  const [expiry, setExpiry] = useState<ShareExpiry>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; tone?: 'error' } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try { setLinks((await api('shares')).data as ShareItem[]); setUnavailable(false); }
    catch (reason) { if ((reason as ApiFailure).status === 404) setUnavailable(true); else setError(failureMessage(reason, locale)); setLinks(previous => previous ?? []); }
  }, [api, locale]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => {
    // Escape closes an open inline confirmation first, then the dialog. An open menu
    // handles (and prevents) its own Escape before this bubble-phase listener runs.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      if (confirming) setConfirming(null); else onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [confirming, onClose]);

  async function run(key: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError('');
    try { await work(); }
    catch (reason) { if ((reason as ApiFailure).status === 404 && key === 'create') setUnavailable(true); setError(failureMessage(reason, locale)); }
    finally { setBusy(null); }
  }
  function create() {
    void run('create', async () => {
      const item = (await api('shares', 'POST', { permission, expires_in_days: expiry, ...(label.trim() ? { label: label.trim().slice(0, 80) } : {}) })).data as ShareItem;
      setLinks(previous => [item, ...(previous ?? []).filter(link => link.id !== item.id)]);
      setLabel(''); setFresh(item.id);
      try { await copyShareLink(item.url); setToast({ id: Date.now(), message: c.copied }); } catch { /* The new link is listed with its own copy button. */ }
    });
  }
  function update(link: ShareItem, next: SharePermission) {
    if (next === link.permission) return;
    void run(link.id, async () => {
      const item = (await api('shares/' + link.id, 'POST', { permission: next })).data as ShareItem;
      setLinks(previous => (previous ?? []).map(entry => entry.id === item.id ? item : entry));
    });
  }
  function revoke(link: ShareItem) {
    void run(link.id, async () => {
      await api('shares/' + link.id + '/revoke', 'POST', {});
      setConfirming(null);
      setLinks(previous => (previous ?? []).filter(entry => entry.id !== link.id));
      setToast({ id: Date.now(), message: c.revoked });
    });
  }
  async function copy(link: ShareItem) {
    try { await copyShareLink(link.url); setToast({ id: Date.now(), message: c.copied }); }
    catch { setToast({ id: Date.now(), message: c.copyFailed, tone: 'error' }); }
  }

  const permissionIcon = (value: SharePermission) => value === 'comment' ? <MessageSquare size={16} /> : <Eye size={16} />;
  return <Dialog ariaLabel={c.title} className={styles.dialog} onClose={busy ? undefined : onClose} data-testid="studio-share-dialog">
    <header className={styles.head}>
      <div><h2>{c.title}</h2><p>{c.intro}</p></div>
      <StudioButton ref={closeRef} icon title={c.close} aria-label={c.close} onClick={onClose}><X size={16} /></StudioButton>
    </header>
    {unavailable ? <p role="alert" className={styles.unavailable}>{c.unavailable}</p> : <>
      <form className={styles.create} onSubmit={event => { event.preventDefault(); create(); }}>
        <div className={styles.fields}>
          <div className={styles.field}><span>{c.permission}</span>
            <StudioMenu label={c.permission} ariaLabel={c.permission + ': ' + c[permission]} variant="secondary" triggerClassName={styles.select}
              trigger={<>{permissionIcon(permission)}<span>{c[permission]}</span><ChevronDown size={16} /></>}>
              {(['view', 'comment'] as const).map(value => <StudioMenuItem key={value} icon={permissionIcon(value)} checked={permission === value} onSelect={() => setPermission(value)}>{c[value]}</StudioMenuItem>)}
            </StudioMenu>
          </div>
          <div className={styles.field}><span>{c.expiry}</span>
            <StudioMenu label={c.expiry} ariaLabel={c.expiry + ': ' + shareExpiryLabel(locale, expiry)} variant="secondary" triggerClassName={styles.select}
              trigger={<><span>{shareExpiryLabel(locale, expiry)}</span><ChevronDown size={16} /></>}>
              {SHARE_EXPIRY_DAYS.map(days => <StudioMenuItem key={String(days)} checked={expiry === days} onSelect={() => setExpiry(days)}>{shareExpiryLabel(locale, days)}</StudioMenuItem>)}
            </StudioMenu>
          </div>
        </div>
        <label className={styles.field}><span>{c.label}</span>
          <input className={styles.input} value={label} maxLength={80} placeholder={c.labelPlaceholder} onChange={event => setLabel(event.target.value)} /></label>
        <div className={styles.createActions}><StudioButton type="submit" variant="primary" disabled={!!busy || links === null}><Link2 size={16} />{c.create}</StudioButton></div>
      </form>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <section className={styles.list} aria-label={c.links}>
        <h3>{c.links}</h3>
        {links === null ? <p className={styles.muted} role="status">{c.loading}</p>
          : !links.length ? <p className={styles.muted}>{c.none}</p>
          : links.map(link => <article key={link.id} className={styles.link} data-fresh={fresh === link.id || undefined} aria-busy={busy === link.id}>
            <div className={styles.linkHead}>
              <strong title={link.label ?? undefined}>{link.label || c.unnamed}</strong>
              <span className={styles.status} data-status={link.status}>{link.status === 'active' ? c.active : c.expired}</span>
              <StudioMenu label={c.permission} ariaLabel={c.permission + ' · ' + (link.label || c.unnamed) + ': ' + c[link.permission]} align="end" disabled={!!busy} triggerClassName={styles.permission}
                trigger={<>{permissionIcon(link.permission)}<span>{c[link.permission]}</span><ChevronDown size={16} /></>}>
                {(['view', 'comment'] as const).map(value => <StudioMenuItem key={value} icon={permissionIcon(value)} checked={link.permission === value} onSelect={() => update(link, value)}>{c[value]}</StudioMenuItem>)}
              </StudioMenu>
            </div>
            <p className={styles.meta}>
              <span>{c.created} {shortDate(link.created_at, locale)}</span>
              <span>{link.expires_at ? (link.status === 'expired' ? c.expired : c.expires) + ' ' + shortDate(link.expires_at, locale) : c.noExpiry}</span>
              <span>{shareCount(locale, 'views', link.view_count)}</span>
              {link.permission === 'comment' || link.guest_comment_count ? <span>{shareCount(locale, 'guestComments', link.guest_comment_count)}</span> : null}
              {link.last_viewed_at && <span>{c.lastViewed} {shortDate(link.last_viewed_at, locale)}</span>}
            </p>
            <div className={styles.urlRow}>
              <input className={styles.url} readOnly value={link.url} aria-label={c.copy} onFocus={event => event.currentTarget.select()} />
              <StudioButton variant="secondary" disabled={link.status !== 'active'} onClick={() => { void copy(link); }}><Copy size={16} />{c.copy}</StudioButton>
            </div>
            {confirming === link.id ? <div className={styles.confirm} role="group" aria-label={c.revokeTitle}>
              <div><strong>{c.revokeTitle}</strong><span>{c.revokeBody}</span></div>
              <StudioButton variant="secondary" disabled={!!busy} onClick={() => setConfirming(null)}>{c.cancel}</StudioButton>
              <StudioButton variant="primary" className={styles.revokeConfirm} disabled={!!busy} onClick={() => revoke(link)}>{c.revoke}</StudioButton>
            </div> : <div className={styles.linkActions}><StudioButton variant="danger" disabled={!!busy} onClick={() => setConfirming(link.id)}>{c.revoke}</StudioButton></div>}
          </article>)}
      </section>
    </>}
    {toast && <StudioToast key={toast.id} message={toast.message} tone={toast.tone} closeLabel={c.close} timeout={3000} onClose={() => setToast(null)} />}
  </Dialog>;
}
