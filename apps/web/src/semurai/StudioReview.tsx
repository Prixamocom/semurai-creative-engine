'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { Check, MessageSquare, Sparkles, X } from 'lucide-react';
import { reviewCopy, type ReviewTarget, type StudioComment } from './studio-review';
import styles from './StudioReview.module.css';

export function StudioReview({ locale, file, version, target, disabled, api, onAsk, onSelect, onClose, comments, onCommentsChange, resolved, onResolvedChange, activeCommentId }: {
  locale: 'pl' | 'en' | 'de'; file: string; version: number; target: ReviewTarget | null; disabled: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<{ data: StudioComment[] }>;
  comments: StudioComment[]; onCommentsChange: (comments: StudioComment[]) => void; resolved: boolean; onResolvedChange: (value: boolean) => void; activeCommentId: string | null;
  onAsk: (target: ReviewTarget, text: string) => void; onSelect: (target: ReviewTarget | null, id?: string) => void; onClose: () => void;
}) {
  const c = reviewCopy[locale];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { const card = [...panel.current?.querySelectorAll<HTMLElement>('[data-comment-id]') ?? []].find(item => item.dataset.commentId === activeCommentId); card?.scrollIntoView({ block: 'nearest' }); card?.focus({ preventScroll: true }); }, [activeCommentId]);
  useEffect(() => { requestId.current = null; }, [text, target]);
  async function mutate(body: unknown) {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try { const result = await api('comments', 'POST', body); onCommentsChange(result.data); if ((body as { action: string }).action === 'create') { setText(''); requestId.current = null; } }
    catch { setError(c.error); }
    finally { setBusy(false); }
  }
  const selection = target ?? { file, version, label: c.project, selector: 'body', text: '' };
  const numbered = comments.filter(item => item.target.file === file).map((item, index) => ({ ...item, number: index + 1 }));
  const visible = numbered.filter(item => resolved || !item.resolved);
  return <aside ref={panel} className={styles.panel} aria-label={c.comments}>
    <header><h3><MessageSquare size={16} />{c.comments} <small>({numbered.length})</small></h3><Button title={c.close} onClick={onClose}><X size={16} /></Button></header>
    <p className={styles.hint}>{c.hint}</p>
    <div className={styles.selection}><span>{selection.label}</span><small>{selection.file}{selection.slideIndex === undefined ? '' : ` · ${selection.slideIndex + 1}`}</small>{target && <Button title={c.remove} onClick={() => onSelect(null)}><X size={14} /></Button>}</div>
    {selection.version !== version && <p role="status" className={styles.hint}>{c.stale}</p>}
    <textarea aria-label={c.placeholder} placeholder={c.placeholder} maxLength={4000} value={text} onChange={event => setText(event.target.value)} />
    <div className={styles.actions}><Button disabled={disabled || busy || !text.trim()} onClick={() => { requestId.current ??= crypto.randomUUID(); void mutate({ action: 'create', id: requestId.current, text: text.trim(), target: selection }); }}><MessageSquare size={14} />{c.add}</Button><Button disabled={disabled || busy || !text.trim()} onClick={() => { onAsk(selection, text); setText(''); }}><Sparkles size={14} />{c.ask}</Button></div>
    {error && <p role="alert">{error}</p>}
    <label className={styles.filter}><input type="checkbox" checked={resolved} onChange={event => onResolvedChange(event.target.checked)} />{c.resolved}</label>
    <div className={styles.list}>{!visible.length && <p className={styles.hint}>{c.empty}</p>}{visible.map(item => <article key={item.id} data-comment-id={item.id} tabIndex={-1} className={(item.resolved ? styles.resolved : '') + (item.id === activeCommentId ? ' ' + styles.selected : '')}>
      <Button className={styles.anchor} title={item.target.label} onClick={() => onSelect(item.target, item.id)}><span>{item.number}</span>{item.target.label}</Button>
      <p>{item.text}</p><small>{item.author} · {new Date(item.created_at).toLocaleString(locale)}</small>
      {item.target.version !== version && <small>{c.stale}</small>}
      <div className={styles.actions}><Button disabled={disabled || busy} onClick={() => onAsk(item.target, item.text)}><Sparkles size={14} />{c.ask}</Button><Button disabled={disabled || busy} onClick={() => { void mutate({ action: item.resolved ? 'reopen' : 'resolve', id: item.id, revision: item.revision }); }}><Check size={14} />{item.resolved ? c.reopen : c.resolve}</Button></div>
    </article>)}</div>
  </aside>;
}
