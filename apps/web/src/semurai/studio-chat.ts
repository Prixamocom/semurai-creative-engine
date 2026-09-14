export interface StudioChatMessage {
  id: string; content: string; status: 'streaming' | 'completed' | 'failed' | 'interrupted';
  kind?: 'text' | 'activity'; tool?: 'read' | 'write' | 'search' | 'execute' | 'delegate' | 'plan';
  started_at?: string; completed_at?: string; todos?: { content: string; status: string }[];
}
export interface StudioLiveRun { runId: string; status: string; messages: StudioChatMessage[] }
export interface StudioChatJob {
  id: string; run_id?: string; brief: string; status: string; retryable: boolean; base_version: number;
  cancel_requested?: boolean; assistant_message?: string; assistant_messages?: StudioChatMessage[]; error_code?: string;
  created_at?: string; completed_at?: string;
  references?: { id: string; title: string; thumbnail?: string }[];
}
export const terminalChatStatuses = new Set(['completed', 'failed', 'cancelled', 'awaiting_input', 'conflicted']);

export function studioChatMessages(job: StudioChatJob, live?: StudioChatMessage[]): StudioChatMessage[] {
  const saved = job.assistant_messages ?? [];
  if (saved.length || live?.length) {
    const merged = new Map(saved.map(item => [item.id, item]));
    for (const item of live ?? []) {
      const previous = merged.get(item.id);
      if (!previous || item.content.length > previous.content.length || (!terminalChatStatuses.has(job.status) && previous.status === 'streaming')) merged.set(item.id, item);
    }
    return [...merged.values()];
  }
  return job.assistant_message ? [{ id: 'legacy', content: job.assistant_message, status: 'completed' }] : [];
}

export function studioDisplayStatus(job: StudioChatJob, live?: StudioLiveRun): string {
  if (terminalChatStatuses.has(job.status) || job.cancel_requested || job.status === 'cancelling') return job.status;
  // Engine completion only means source is ready. Core owns successful storage.
  if (live?.status === 'completed') return 'awaiting_storage';
  return live?.status ?? job.status;
}
