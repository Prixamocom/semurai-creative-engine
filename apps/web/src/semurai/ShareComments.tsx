'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MessageSquare, Send, UserRound } from 'lucide-react';
import { StudioButton } from './StudioButton';
import { readGuestName, shareGuestTarget, ShareRequestError, shareRequest, shareViewerCopy, writeGuestName, type PublicComment, type ShareLocale } from './studio-share';
import type { ReviewTarget } from './studio-review';
import styles from './ShareViewer.module.css';

type Copy = typeof shareViewerCopy['pl'];

function when(value: string | null, locale: ShareLocale): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * One entry of a thread (plain React text, never HTML). Guest entries show the
 * guest's name and the "Guest" badge; workspace members stay anonymous behind
 * the "Project author" label, as the public API never sends their names.
 */
function Message({ author, guest, createdAt, text, c, locale }: { author: string | null; guest: boolean; createdAt: string | null; text: string; c: Copy; locale: ShareLocale }) {
  const name = guest ? author || c.guest : c.member;
  return <div className={styles.message} data-author-kind={guest ? 'guest' : 'member'}>
    <div><span className={styles.avatar} aria-hidden="true">{guest ? name.slice(0, 1).toUpperCase() : <UserRound size={12} />}</span><strong>{name}</strong>
      {guest && <span className={styles.guest}>{c.guest}</span>}{createdAt && <time dateTime={createdAt}>{when(createdAt, locale)}</time>}</div>
    <p>{text}</p>
  </div>;
}

/** The guest's name (remembered in this browser) and the hidden honeypot bots fill in. */
function Identity({ name, onName, website, onWebsite, c }: { name: string; onName: (value: string) => void; website: string; onWebsite: (value: string) => void; c: Copy }) {
  return <>
    <label className={styles.field}><span>{c.name}</span>
      <input className={styles.input} value={name} maxLength={60} autoComplete="name" onChange={event => onName(event.target.value)} /></label>
    <div className={styles.honeypot} aria-hidden="true">
      <label>{c.website}<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => onWebsite(event.target.value)} /></label>
    </div>
  </>;
}

/**
 * Guest comments of a "view and comment" link: new comments on the file (and
 * slide) on screen, and replies to existing threads. Guests cannot resolve
 * threads or send anything to the AI.
 */
export function ShareComments({ token, locale, comments, onComments, file, version, slide, deck, activeId, onSelect, onGone, fetcher, header }: {
  token: string; locale: ShareLocale; comments: PublicComment[]; onComments: (comments: PublicComment[]) => void;
  file: string; version: number; slide: number; deck: boolean; activeId: string | null;
  onSelect: (target: ReviewTarget, id: string) => void; onGone: () => void; fetcher?: typeof fetch; header?: ReactNode;
}) {
  const c = shareViewerCopy[locale];
  const [name, setName] = useState(readGuestName);
  const [website, setWebsite] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { requestId.current = null; }, [text, file, slide]);
  useEffect(() => {
    const card = [...list.current?.querySelectorAll<HTMLElement>('[data-comment-id]') ?? []].find(item => item.dataset.commentId === activeId);
    card?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);
  const targetLabel = deck ? c.slide + ' ' + (slide + 1) : c.wholePage;

  /** Posts one guest action; the same id is reused on retry so a lost answer never duplicates a comment. */
  async function post(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    const guestName = name.trim().replace(/\s+/g, ' ');
    if (!guestName) { setError(c.nameRequired); return false; }
    setBusy(true); setError('');
    try {
      onComments(await shareRequest<PublicComment[]>(token, 'comments', { ...body, guest_name: guestName, website }, fetcher));
      writeGuestName(guestName);
      return true;
    } catch (reason) {
      const kind = reason instanceof ShareRequestError ? reason.kind : 'failed';
      const code = reason instanceof ShareRequestError ? reason.code ?? '' : '';
      if (kind === 'gone') onGone();
      else setError(kind === 'rateLimited' ? c.rateLimited : code.endsWith('_limit') ? c.limit : code.startsWith('creative.guest_name') ? c.nameInvalid : c.commentError);
      return false;
    } finally { setBusy(false); }
  }
  async function create() {
    if (!text.trim()) return;
    requestId.current ??= crypto.randomUUID();
    const id = requestId.current;
    if (await post({ action: 'create', id, text: text.trim(), target: shareGuestTarget(file, version, targetLabel, deck ? slide : undefined) })) {
      setText(''); requestId.current = null;
    }
  }

  const threads = comments.filter(item => (item.target?.file ?? 'index.html') === file).map((item, index) => ({ ...item, number: index + 1 }));
  return <section className={styles.comments} aria-label={c.comments}>
    {header}
    <form className={styles.compose} onSubmit={event => { event.preventDefault(); void create(); }}>
      <Identity name={name} onName={setName} website={website} onWebsite={setWebsite} c={c} />
      <p className={styles.targetHint}>{c.commentOn.replace('{target}', file + ' · ' + targetLabel)}</p>
      <textarea className={styles.input} aria-label={c.placeholder} placeholder={c.placeholder} maxLength={2000} rows={3} value={text} onChange={event => setText(event.target.value)} />
      <div className={styles.composeActions}><StudioButton type="submit" variant="primary" disabled={busy || !text.trim()}><MessageSquare size={16} />{c.send}</StudioButton></div>
      {error && <p role="alert" className={styles.formError}>{error}</p>}
    </form>
    <div ref={list} className={styles.threads}>
      {!threads.length && <p className={styles.muted}>{c.noComments}</p>}
      {threads.map(thread => <article key={thread.id} data-comment-id={thread.id} className={styles.thread} data-active={thread.id === activeId || undefined}>
        <button type="button" className={styles.anchor} onClick={() => onSelect(thread.target, thread.id)}>
          <span className={styles.number}>{thread.number}</span><span className={styles.anchorLabel}>{thread.target?.label}</span>
        </button>
        <Message author={thread.author} guest={thread.author_kind === 'guest'} createdAt={thread.created_at} text={thread.text} c={c} locale={locale} />
        {(thread.replies ?? []).map(reply => <Message key={reply.id} author={reply.author} guest={reply.author_kind === 'guest'} createdAt={reply.created_at} text={reply.text} c={c} locale={locale} />)}
        <Reply thread={thread} busy={busy} c={c} onSend={(replyId, value) => post({ action: 'reply', id: thread.id, reply_id: replyId, text: value })} />
      </article>)}
    </div>
  </section>;
}

function Reply({ thread, busy, c, onSend }: { thread: PublicComment; busy: boolean; c: Copy; onSend: (replyId: string, text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const key = useRef<string | null>(null);
  return <form className={styles.reply} onSubmit={event => {
    event.preventDefault();
    if (!text.trim()) return;
    key.current ??= crypto.randomUUID();
    void onSend(key.current, text.trim()).then(sent => { if (sent) { setText(''); key.current = null; } });
  }}>
    <textarea className={styles.input} aria-label={c.reply + ': ' + thread.target?.label} placeholder={c.reply + '…'} rows={2} maxLength={2000} value={text}
      onChange={event => { setText(event.target.value); key.current = null; }} />
    <StudioButton type="submit" variant="secondary" disabled={busy || !text.trim()}><Send size={16} />{c.reply}</StudioButton>
  </form>;
}
