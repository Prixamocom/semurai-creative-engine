'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageSquare, MousePointer2, PenLine, Scan, Sparkles, X } from 'lucide-react';
import { reviewCopy, type ReviewTarget, type StudioComment } from './studio-review';
import styles from './StudioReview.module.css';
import { StudioCommentThread } from './StudioCommentThread';
import { StudioButton, StudioButtonGroup } from './StudioButton';
import { studioDrawCopy } from './studio-editor-copy';

export type StudioReviewSelectMode = 'element' | 'area' | 'draw';

/**
 * Comments panel shown in the Studio side panel while the Comment tool is
 * active. The Element / Area / Draw toggle picks how the preview is used:
 * select an element, drag an area, or draw marks to send to the chat.
 */
export function StudioReview({ locale, file, version, target, disabled, api, onAsk, onSelect, comments, onCommentsChange, resolved, onResolvedChange, activeCommentId, selectMode = 'element', onSelectMode }: {
  locale: 'pl' | 'en' | 'de'; file: string; version: number; target: ReviewTarget | null; disabled: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<{ data: StudioComment[] }>;
  comments: StudioComment[]; onCommentsChange: (comments: StudioComment[]) => void; resolved: boolean; onResolvedChange: (value: boolean) => void; activeCommentId: string | null;
  onAsk: (target: ReviewTarget, text: string) => void; onSelect: (target: ReviewTarget | null, id?: string) => void; onClose?: () => void;
  selectMode?: StudioReviewSelectMode; onSelectMode?: (mode: StudioReviewSelectMode) => void;
}) {
  const c = reviewCopy[locale];
  const d = studioDrawCopy[locale];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { const card = [...panel.current?.querySelectorAll<HTMLElement>('[data-comment-id]') ?? []].find(item => item.dataset.commentId === activeCommentId); card?.scrollIntoView({ block: 'nearest' }); card?.focus({ preventScroll: true }); }, [activeCommentId]);
  useEffect(() => { requestId.current = null; }, [text, target]);
  async function mutate(body: unknown) {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try { const result = await api('comments', 'POST', body); onCommentsChange(result.data); if ((body as { action: string }).action === 'create') { const created = result.data.find(item => item.id === (body as { id: string }).id); if (created) onSelect(created.target, created.id); } if ((body as { action: string }).action === 'create') { setText(''); requestId.current = null; } }
    catch { setError(c.error); }
    finally { setBusy(false); }
  }
  const selection = target ?? { file, version, label: c.project, selector: 'body', text: '' };
  const numbered = comments.filter(item => item.target.file === file).map((item, index) => ({ ...item, number: index + 1 }));
  const visible = numbered.filter(item => resolved || !item.resolved);
  return <section ref={panel} className={styles.panel} aria-label={c.comments}>
    {onSelectMode && <StudioButtonGroup label={c.selectBy} className={styles.modes}>
      <StudioButton aria-pressed={selectMode === 'element'} title={c.select} onClick={() => onSelectMode('element')}><MousePointer2 size={16} />{c.element}</StudioButton>
      <StudioButton aria-pressed={selectMode === 'area'} title={c.area} onClick={() => onSelectMode('area')}><Scan size={16} />{c.areaShort}</StudioButton>
      <StudioButton aria-pressed={selectMode === 'draw'} title={d.drawTitle} onClick={() => onSelectMode('draw')}><PenLine size={16} />{d.draw}</StudioButton>
    </StudioButtonGroup>}
    <p className={styles.hint}>{selectMode === 'draw' ? d.hint : c.hint}</p>
    <div className={styles.selection}><span>{selection.label}</span><small>{selection.file}{selection.slideIndex === undefined ? '' : ` · ${selection.slideIndex + 1}`}</small>{target && <StudioButton icon className={styles.selectionClear} title={c.remove} aria-label={c.remove} onClick={() => onSelect(null)}><X size={16} /></StudioButton>}</div>
    {selection.version !== version && <p role="status" className={styles.hint}>{c.stale}</p>}
    <textarea className={styles.input} aria-label={c.placeholder} placeholder={c.placeholder} maxLength={4000} value={text} onChange={event => setText(event.target.value)} />
    <div className={styles.actions}>
      <StudioButton variant="secondary" disabled={disabled || busy || !text.trim()} onClick={() => { requestId.current ??= crypto.randomUUID(); void mutate({ action: 'create', id: requestId.current, text: text.trim(), target: selection }); }}><MessageSquare size={16} />{c.add}</StudioButton>
      <StudioButton disabled={disabled || busy || !text.trim()} onClick={() => { onAsk(selection, text); setText(''); }}><Sparkles size={16} />{c.ask}</StudioButton>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <label className={styles.filter}><input type="checkbox" checked={resolved} onChange={event => onResolvedChange(event.target.checked)} />{c.resolved}</label>
    <div className={styles.list}>{!visible.length && <p className={styles.hint}>{c.empty}</p>}{visible.map(item => <article key={item.id} data-comment-id={item.id} tabIndex={-1} className={(item.resolved ? styles.resolved : '') + (item.id === activeCommentId ? ' ' + styles.selected : '')}>
      <button type="button" className={styles.anchor} title={item.target.label} onClick={() => onSelect(item.target, item.id)}><span className={styles.number}>{item.number}</span><span className={styles.anchorLabel}>{item.target.label}</span></button>
      <StudioCommentThread comment={item} locale={locale} disabled={disabled || busy} api={api} onChange={onCommentsChange} onAsk={text => onAsk(item.target, text)} />
    </article>)}</div>
  </section>;
}
