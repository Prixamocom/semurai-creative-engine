import { useRef, useState } from 'react';
import { Check, Send, Sparkles } from 'lucide-react';
import { reviewCopy, threadBrief, type StudioComment } from './studio-review';
import styles from './StudioReview.module.css';
import { StudioButton } from './StudioButton';

export function StudioCommentThread({ comment, locale, disabled, api, onChange, onAsk }: {
  comment: StudioComment; locale: 'pl' | 'en' | 'de'; disabled: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<{ data: StudioComment[] }>;
  onChange: (comments: StudioComment[]) => void; onAsk: (text: string) => void;
}) {
  const c = reviewCopy[locale];
  const replyLabel = c.reply;
  const [reply, setReply] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const key = useRef<string | null>(null);
  async function mutate(action: 'reply' | 'resolve' | 'reopen') {
    if (disabled || busy) return;
    setBusy(true); setError('');
    if (action === 'reply') key.current ??= crypto.randomUUID();
    try {
      const result = await api('comments', 'POST', { action, id: comment.id, revision: comment.revision,
        ...(action === 'reply' ? { reply_id: key.current, text: reply.trim() } : {}) });
      onChange(result.data); if (action === 'reply') { setReply(''); key.current = null; }
    } catch {
      setError(c.error);
      // Refresh revisions so a second attempt can recover a concurrent reply.
      try { onChange((await api('comments')).data); } catch { /* Keep the local draft. */ }
    } finally { setBusy(false); }
  }
  return <div className={styles.thread}>
    {[comment, ...(comment.replies ?? [])].map(message => <div key={message.id} className={styles.message}>
      <div><span className={styles.avatar}>{message.author.slice(0, 1).toUpperCase()}</span><strong>{message.author}</strong><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
      <p>{message.text}</p>
    </div>)}
    <form onSubmit={event => { event.preventDefault(); if (reply.trim()) void mutate('reply'); }}>
      <textarea className={styles.input} aria-label={replyLabel} placeholder={replyLabel + '…'} value={reply} maxLength={4000} rows={2} onChange={event => { setReply(event.target.value); key.current = null; }} />
      <StudioButton type="submit" variant="secondary" disabled={disabled || busy || !reply.trim()}><Send size={16} />{replyLabel}</StudioButton>
    </form>
    <div className={styles.actions}><StudioButton disabled={disabled || busy} onClick={() => { void mutate(comment.resolved ? 'reopen' : 'resolve'); }}><Check size={16} />{comment.resolved ? c.reopen : c.resolve}</StudioButton><StudioButton disabled={disabled || busy} onClick={() => onAsk(threadBrief(comment))}><Sparkles size={16} />{c.ask}</StudioButton></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
