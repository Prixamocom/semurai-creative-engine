import { Button } from '@open-design/components';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { renderMarkdown } from '../runtime/markdown';
import { studioChatMessages, terminalChatStatuses, type StudioChatJob, type StudioChatMessage } from './studio-chat';
import { studioEditorCopy } from './studio-editor-copy';
import styles from './StudioEditor.module.css';

export function StudioChatTurn({ job, live, cancelling, busy, copy: c, onCancel, onRetry }: {
  job: StudioChatJob; live?: StudioChatMessage[]; cancelling: boolean; busy: boolean;
  copy: typeof studioEditorCopy.en; onCancel: () => void; onRetry: () => void;
}) {
  const active = !terminalChatStatuses.has(job.status);
  const stopping = active && (cancelling || job.cancel_requested || job.status === 'cancelling');
  const label = stopping ? c.cancelling : job.status === 'completed' ? c.completed : job.status === 'failed' ? c.failed
    : job.status === 'cancelled' ? c.cancelled : job.status === 'conflicted' ? c.conflict : job.status === 'generating_assets' ? c.generatingImage : c.working;
  return <div className={styles.turn}>
    <p className={styles.userMessage}>{job.brief}</p>
    <div className={styles.references}>{job.references?.map(image => image.thumbnail && <img key={image.id} src={image.thumbnail} alt={image.title} title={image.title} />)}</div>
    <div className={styles.answer}><span className={styles.spark}><Sparkles size={15} /></span><div>
      {studioChatMessages(job, live).map(message => <div key={message.id} data-message-id={message.id} className={styles.assistantText}>
        {renderMarkdown(message.content.replace(/<od-done\b[^>]*\/?>/gi, ''), { syntaxHighlight: false })}
      </div>)}
      <div className={styles.chatStatus} role="status">{active ? <Loader2 size={14} className={styles.spinning} /> : job.status === 'completed' ? <Check size={14} /> : null}<span>{label}</span></div>
      {active && <Button disabled={Boolean(stopping || busy)} aria-busy={Boolean(stopping)} onClick={onCancel}>{stopping && <Loader2 size={14} className={styles.spinning} />}{stopping ? c.cancelling : c.cancel}</Button>}
      {job.retryable && <Button disabled={busy} onClick={onRetry}>{c.retry}</Button>}
    </div></div>
  </div>;
}
