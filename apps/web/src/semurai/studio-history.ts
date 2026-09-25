import type { StudioChatJob } from './studio-chat';

export interface StudioVersion {
  id: string; version: number; kind: string; created_at: string;
  /** Optional, if Semurai Core ever sends a description of the version. */
  summary?: string; prompt?: string; brief?: string;
}
/** Where a saved version came from, as Semurai Core records `kind`. */
export type StudioVersionSource = 'ai' | 'manual' | 'restore';

export function studioVersionSource(kind: string): StudioVersionSource {
  if (kind === 'manual') return 'manual';
  if (kind === 'restore') return 'restore';
  // generate, edit, ai_conflict and every other job operation.
  return 'ai';
}

const EDIT_PREFIX = /^Edit the file \S+ within this project\. Preserve other files\.\n/;

/**
 * The prompt or summary shown under a version. Core's version list carries no
 * text today, so an AI version borrows the brief of the completed job that
 * started from the version before it (closest in time when there are several).
 */
export function studioVersionSummary(version: StudioVersion, jobs: readonly StudioChatJob[]): string {
  const own = [version.summary, version.prompt, version.brief].find((value): value is string => typeof value === 'string' && !!value.trim());
  if (own) return own.trim();
  if (studioVersionSource(version.kind) !== 'ai') return '';
  const created = Date.parse(version.created_at);
  const job = jobs
    .filter(item => item.status === 'completed' && item.base_version === version.version - 1 && item.brief)
    .sort((a, b) => Math.abs(Date.parse(a.completed_at ?? a.created_at ?? '') - created) - Math.abs(Date.parse(b.completed_at ?? b.created_at ?? '') - created))[0];
  if (!job) return '';
  // Selection briefs carry a JSON target; show only the user's instruction.
  const instruction = job.brief.includes('\nUser instruction:\n') ? job.brief.split('\nUser instruction:\n').pop()! : job.brief;
  return instruction.replace(EDIT_PREFIX, '').trim();
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60]];

/** "5 minut temu", "wczoraj", "teraz". */
export function studioRelativeTime(iso: string, locale: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(seconds) < 45) return format.format(0, 'second');
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size || unit === 'minute') return format.format(Math.round(seconds / size), unit);
  return '';
}
