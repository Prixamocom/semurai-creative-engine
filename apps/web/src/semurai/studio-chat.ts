export interface StudioChatMessage { id: string; content: string; status: 'streaming' | 'completed' }
export interface StudioChatJob {
  id: string; run_id?: string; brief: string; status: string; retryable: boolean; base_version: number;
  cancel_requested?: boolean; assistant_message?: string; assistant_messages?: StudioChatMessage[];
  references?: { id: string; title: string; thumbnail?: string }[];
}
export const terminalChatStatuses = new Set(['completed', 'failed', 'cancelled', 'conflicted']);

export function studioChatMessages(job: StudioChatJob, live?: StudioChatMessage[]): StudioChatMessage[] {
  const saved = job.assistant_messages ?? [];
  if (!terminalChatStatuses.has(job.status) && live?.length) return live;
  if (saved.length) return saved;
  if (live?.length) return live;
  return job.assistant_message ? [{ id: 'legacy', content: job.assistant_message, status: 'completed' }] : [];
}
