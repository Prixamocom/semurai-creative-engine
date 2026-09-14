import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import { Check, Circle, Loader2, Sparkles, Eye, Pencil, Search, Terminal, Users, ListChecks, AlertCircle } from 'lucide-react';
import { renderMarkdown } from '../runtime/markdown';
import { splitOnQuestionForms, stripTrailingOpenQuestionForm } from '../artifacts/question-form';
import { QuestionFormView } from '../components/QuestionForm';
import { studioChatMessages, studioDisplayStatus, terminalChatStatuses, type StudioChatJob, type StudioLiveRun } from './studio-chat';
import { studioEditorCopy } from './studio-editor-copy';
import styles from './StudioEditor.module.css';
import execution from './StudioExecution.module.css';

export function StudioChatTurn({ job, live, cancelling, busy, copy: c, onCancel, onRetry, onAnswer }: {
  job: StudioChatJob; live?: StudioLiveRun; cancelling: boolean; busy: boolean;
  copy: typeof studioEditorCopy.en; onCancel: () => void; onRetry: () => void; onAnswer?: (text: string) => void;
}) {
  const status = studioDisplayStatus(job, live);
  const active = !terminalChatStatuses.has(status);
  const stopping = active && (cancelling || job.cancel_requested || status === 'cancelling');
  const needsInput = status === 'awaiting_input' || job.error_code === 'design_harness_needs_input';
  const label = stopping ? c.cancelling : needsInput ? c.needsInput : status === 'completed' ? c.completed : status === 'failed' ? c.failed
    : status === 'cancelled' ? c.cancelled : status === 'conflicted' ? c.conflict : status === 'generating_assets' ? c.generatingImage
      : ['queued', 'submitting'].includes(status) ? c.queued : status === 'planning' ? c.planning
        : ['building_layout', 'rendering'].includes(status) ? c.checking : status === 'awaiting_storage' ? c.saving : c.working;
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const messages = studioChatMessages(job, live?.messages);
  const lastPlan = messages.filter(item => item.todos?.length).at(-1)?.id;
  const blocks: typeof messages[] = [];
  for (const message of messages) {
    if (message.tool === 'plan' && message.id !== lastPlan) continue;
    if (message.kind === 'activity' && blocks.at(-1)?.[0]?.kind === 'activity') blocks.at(-1)!.push(message);
    else blocks.push([message]);
  }
  return <div className={styles.turn}>
    <p className={styles.userMessage}>{job.brief}</p>
    <div className={styles.references}>{job.references?.map(image => image.thumbnail && <img key={image.id} src={image.thumbnail} alt={image.title} title={image.title} />)}</div>
    <div className={styles.answer}><span className={styles.spark}><Sparkles size={15} /></span><div>
      {blocks.map(block => block[0]!.kind === 'activity' ? <details key={block[0]!.id} className={execution.record} open={active}>
        <summary>{c.execution} · {block.length}</summary>
        {block.map(item => {
          const tool = item.tool ?? 'execute';
          const Icon = { read: Eye, write: Pencil, search: Search, execute: Terminal, delegate: Users, plan: ListChecks }[tool];
          const running = active && !stopping && item.status === 'streaming';
          const start = Date.parse(item.started_at ?? '');
          const end = item.completed_at ? Date.parse(item.completed_at) : active ? now : Date.parse(job.completed_at ?? '');
          const seconds = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : null;
          return <div key={item.id} data-message-id={item.id}>
            <div className={execution.row}>
              {running ? <Loader2 size={14} className={execution.spin} /> : item.status === 'failed' ? <AlertCircle size={14} className={execution.error} /> : item.status === 'completed' ? <Check size={14} /> : <Circle size={12} />}
              <Icon size={14} /><span>{c[tool]}{item.content ? ` · ${item.content}` : ''}</span>{seconds !== null && <time>{seconds}s</time>}
            </div>
            {item.todos?.length ? <ol className={execution.plan} aria-label={c.plan}>{item.todos.map((todo, index) => <li key={index} data-state={todo.status}>
              {todo.status === 'completed' ? <Check size={13} /> : todo.status === 'in_progress' && active && !stopping ? <Loader2 size={13} className={execution.spin} /> : <span>{index + 1}.</span>}<span>{todo.content}</span>
            </li>)}</ol> : null}
          </div>;
        })}
      </details> : <div key={block[0]!.id} data-message-id={block[0]!.id} className={styles.assistantText}>
        {splitOnQuestionForms(stripTrailingOpenQuestionForm(block[0]!.content.replace(/<od-done\b[^>]*\/?>/gi, '')).text).map((segment, index) => segment.kind === 'text'
          ? <div key={index}>{renderMarkdown(segment.text, { syntaxHighlight: false })}</div>
          : <QuestionFormView key={index} form={segment.form} interactive={needsInput && !!onAnswer && !busy} onSubmit={onAnswer} />)}
      </div>)}
      <div className={styles.chatStatus} role="status">{active ? <Loader2 size={14} className={styles.spinning} /> : status === 'completed' ? <Check size={14} /> : null}<span>{label}</span></div>
      {job.error_code === 'design_harness_blocked' && <p>{c.harnessBlocked}</p>}
      {job.error_code === 'design_harness_unavailable' && <p>{c.harnessUnavailable}</p>}
      {active && <Button disabled={Boolean(stopping || busy)} aria-busy={Boolean(stopping)} onClick={onCancel}>{stopping && <Loader2 size={14} className={styles.spinning} />}{stopping ? c.cancelling : c.cancel}</Button>}
      {job.retryable && <Button disabled={busy} onClick={onRetry}>{c.retry}</Button>}
    </div></div>
  </div>;
}
