/**
 * Chat briefs sent to the engine carry English instructions and, for a
 * selection, the JSON target. The user only ever sees their own instruction
 * (chat bubble, version history) plus a short chip naming the selection.
 * Jobs already stored with these briefs are parsed the same way, so nothing
 * depends on extra job fields.
 */
export interface StudioBriefTarget { file: string; version: number; label?: string; text?: string; slideIndex?: number }
export interface StudioBriefParts { instruction: string; target?: StudioBriefTarget }

const INSTRUCTION = '\nUser instruction:\n';
const EDIT_PREFIX = /^Edit the file \S+ within this project\. Preserve other files\.\n/;
const SELECTION = /^Edit only the requested part of (\S+?)\.(?: [^\n]*)?\nSelection from version (\d+)(?:, slide (\d+))?:\n([^\n]*)\nUser instruction:\n([\s\S]*)$/;

/** The brief for a whole-file chat request (no selection). */
export function studioEditBrief(file: string, instruction: string): string {
  return `Edit the file ${file} within this project. Preserve other files.\n` + instruction.trim();
}

function selectionTarget(file: string, version: string, slide: string | undefined, json: string): StudioBriefTarget {
  const target: StudioBriefTarget = { file, version: Number(version) };
  if (slide !== undefined && Number(slide) >= 1) target.slideIndex = Number(slide) - 1;
  let data: unknown = null;
  try { data = JSON.parse(json); } catch { /* A damaged selection still names the file, version and slide. */ }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const value = data as Record<string, unknown>;
    if (typeof value.label === 'string' && value.label.trim()) target.label = value.label.trim().slice(0, 240);
    if (typeof value.text === 'string' && value.text.trim()) target.text = value.text.trim().slice(0, 500);
    if (target.slideIndex === undefined && Number.isInteger(value.slideIndex) && Number(value.slideIndex) >= 0) target.slideIndex = Number(value.slideIndex);
  }
  return target;
}

export function studioBriefParts(brief: string): StudioBriefParts {
  const text = typeof brief === 'string' ? brief : '';
  const selection = SELECTION.exec(text);
  if (selection) return { instruction: selection[5]!.trim(), target: selectionTarget(selection[1]!, selection[2]!, selection[3], selection[4]!) };
  // An unexpected selection layout: keep only what the user typed.
  const marker = text.indexOf(INSTRUCTION);
  if (marker >= 0) return { instruction: text.slice(marker + INSTRUCTION.length).trim() };
  return { instruction: text.replace(EDIT_PREFIX, '').trim() };
}
