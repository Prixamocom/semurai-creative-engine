import { useEffect, useState } from 'react';
import { Check, Circle, Crosshair, Loader2, Sparkles, Eye, Pencil, Search, Terminal, Users, ListChecks, AlertCircle } from 'lucide-react';
import { renderMarkdown } from '../runtime/markdown';
import { splitOnQuestionForms, stripTrailingOpenQuestionForm } from '../artifacts/question-form';
import { QuestionFormView } from '../components/QuestionForm';
import { studioChatMessages, studioDisplayStatus, terminalChatStatuses, type StudioChatJob, type StudioLiveRun } from './studio-chat';
import { studioEditorCopy } from './studio-editor-copy';
import { studioBriefParts } from './studio-brief';
import styles from './StudioEditor.module.css';
import execution from './StudioExecution.module.css';
import { StudioButton } from './StudioButton';

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
  const request = studioBriefParts(job.brief);
  const target = request.target;
  const messages = studioChatMessages(job, live?.messages);
  const lastPlan = messages.filter(item => item.todos?.length).at(-1)?.id;
  const blocks: typeof messages[] = [];
  for (const message of messages) {
    if (message.tool === 'plan' && message.id !== lastPlan) continue;
    if (message.kind === 'activity' && blocks.at(-1)?.[0]?.kind === 'activity') blocks.at(-1)!.push(message);
    else blocks.push([message]);
  }
  return <div className={styles.turn}>
    {target && <p className={styles.userTarget} aria-label={c.chatTarget} title={target.text}>
      <Crosshair size={16} aria-hidden="true" /><span>{[target.label, target.file, target.slideIndex === undefined ? '' : `${c.chatTargetSlide} ${target.slideIndex + 1}`].filter(Boolean).join(' · ')}</span>
    </p>}
    {request.instruction && <p className={styles.userMessage}>{request.instruction}</p>}
    <div className={styles.references}>{job.references?.map(image => image.thumbnail && <img key={image.id} src={image.thumbnail} alt={image.title} title={image.title} />)}</div>
    <div className={styles.answer}><span className={styles.spark}><Sparkles size={16} /></span><div>
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
              {running ? <Loader2 size={16} className={execution.spin} /> : item.status === 'failed' ? <AlertCircle size={16} className={execution.error} /> : item.status === 'completed' ? <Check size={16} /> : <Circle size={16} />}
              <Icon size={16} /><span>{c[tool]}{item.content ? ` · ${item.content}` : ''}</span>{seconds !== null && <time>{seconds}s</time>}
            </div>
            {item.todos?.length ? <ol className={execution.plan} aria-label={c.plan}>{item.todos.map((todo, index) => <li key={index} data-state={todo.status}>
              {todo.status === 'completed' ? <Check size={16} /> : todo.status === 'in_progress' && active && !stopping ? <Loader2 size={16} className={execution.spin} /> : <span>{index + 1}.</span>}<span>{todo.content}</span>
            </li>)}</ol> : null}
          </div>;
        })}
      </details> : <div key={block[0]!.id} data-message-id={block[0]!.id} className={styles.assistantText}>
        {splitOnQuestionForms(stripTrailingOpenQuestionForm(block[0]!.content.replace(/<od-done\b[^>]*\/?>/gi, '')).text).map((segment, index) => segment.kind === 'text'
          ? <div key={index}>{renderMarkdown(segment.text, { syntaxHighlight: false })}</div>
          : <QuestionFormView key={index} form={segment.form} interactive={needsInput && !!onAnswer && !busy} onSubmit={onAnswer} />)}
      </div>)}
      <div className={styles.chatStatus} role="status">{active ? <Loader2 size={16} className={styles.spinning} /> : status === 'completed' ? <Check size={16} /> : null}<span>{label}</span></div>
      {job.error_code === 'design_harness_blocked' && <p className={styles.turnNote}>{c.harnessBlocked}</p>}
      {job.error_code === 'design_harness_unavailable' && <p className={styles.turnNote}>{c.harnessUnavailable}</p>}
      {(active || job.retryable) && <div className={styles.turnActions}>
        {active && <StudioButton variant="secondary" disabled={Boolean(stopping || busy)} aria-busy={Boolean(stopping)} onClick={onCancel}>{stopping && <Loader2 size={16} className={styles.spinning} />}{stopping ? c.cancelling : c.cancel}</StudioButton>}
        {job.retryable && <StudioButton variant="secondary" disabled={busy} onClick={onRetry}>{c.retry}</StudioButton>}
      </div>}
    </div></div>
  </div>;
}
