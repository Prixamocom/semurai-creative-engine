export interface ReviewTarget {
  file: string;
  version: number;
  label: string;
  selector: string;
  text: string;
  elementId?: string;
  slideIndex?: number;
  position?: { x: number; y: number; width: number; height: number };
}
/** 'guest' marks entries written through a share link by someone outside the workspace. */
export type StudioAuthorKind = 'member' | 'guest';
export interface StudioReply { id: string; text: string; author: string; author_kind?: StudioAuthorKind; created_at: string }
export interface StudioComment { id: string; text: string; target: ReviewTarget; resolved: boolean; revision: number; created_at: string; author: string; author_kind?: StudioAuthorKind; replies?: StudioReply[] }

/**
 * The thread as chat context. Guest entries (share links) are labelled as such,
 * so the AI and the user can tell outside feedback from the team's own notes.
 */
export function threadBrief(comment: StudioComment, locale: 'pl' | 'en' | 'de' = 'en'): string {
  const guest = (entry: { author: string; text: string }) => `${reviewCopy[locale].guestComment} (${entry.author}): ${entry.text}`;
  return [comment.author_kind === 'guest' ? guest(comment) : comment.text,
    ...(comment.replies ?? []).map(reply => reply.author_kind === 'guest' ? guest(reply) : `${reply.author}: ${reply.text}`)].join('\n\n');
}

/** Keep the selected source identity in the request, including index.html. */
export function reviewBrief(target: ReviewTarget, instruction: string): string {
  return `Edit only the requested part of ${target.file}. Preserve other files and unrelated content.\nSelection from version ${target.version}${target.slideIndex === undefined ? '' : `, slide ${target.slideIndex + 1}`}:\n${JSON.stringify(target)}\nUser instruction:\n${instruction.trim()}`;
}

export function readReviewTarget(value: unknown, file: string, version: number): ReviewTarget | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.selector !== 'string' || typeof data.label !== 'string') return null;
  const target: ReviewTarget = { file, version, selector: data.selector.slice(0, 1000), label: data.label.slice(0, 240), text: typeof data.text === 'string' ? data.text.slice(0, 500) : '' };
  if (typeof data.elementId === 'string') target.elementId = data.elementId.slice(0, 240);
  if (Number.isInteger(data.slideIndex) && Number(data.slideIndex) >= 0 && Number(data.slideIndex) < 60) target.slideIndex = Number(data.slideIndex);
  const box = data.position as ReviewTarget['position'];
  if (box && [box.x, box.y, box.width, box.height].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000)) target.position = { x: box.x, y: box.y, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  return target;
}

export const reviewCopy = {
  pl: { select: 'Zaznacz element', area: 'Zaznacz obszar', comments: 'Komentarze', hint: 'Kliknij element projektu lub zaznacz obszar. Dodaj komentarz albo polecenie dla AI.', add: 'Zapisz komentarz', ask: 'Dodaj do czatu AI', placeholder: 'Opisz zmianę lub dodaj komentarz…', resolve: 'Rozwiąż', reopen: 'Otwórz ponownie', empty: 'Brak komentarzy dla tego pliku.', resolved: 'Pokaż rozwiązane', selected: 'Zaznaczenie', remove: 'Usuń zaznaczenie', resize: 'Zmień szerokość czatu', stale: 'Zaznaczenie pochodzi ze starszej wersji. Sprawdź je przed wysłaniem.', error: 'Nie udało się zapisać komentarza. Spróbuj ponownie.', loadError: 'Nie udało się wczytać komentarzy. Odśwież stronę, aby spróbować ponownie.', close: 'Zamknij', tools: 'Załączniki i media', fit: 'Dopasuj', project: 'Cały projekt', element: 'Element', areaShort: 'Obszar', selectBy: 'Sposób zaznaczania', reply: 'Odpowiedz', guest: 'Gość', guestComment: 'Komentarz gościa' },
  en: { select: 'Select element', area: 'Select area', comments: 'Comments', hint: 'Click an element or select an area. Add a comment or an AI instruction.', add: 'Save comment', ask: 'Add to AI chat', placeholder: 'Describe a change or add a comment…', resolve: 'Resolve', reopen: 'Reopen', empty: 'No comments for this file.', resolved: 'Show resolved', selected: 'Selection', remove: 'Remove selection', resize: 'Resize chat', stale: 'This selection is from an older version. Check it before sending.', error: 'Could not save the comment. Please try again.', loadError: 'Could not load comments. Refresh the page to try again.', close: 'Close', tools: 'Attachments and media', fit: 'Fit', project: 'Whole project', element: 'Element', areaShort: 'Area', selectBy: 'Selection method', reply: 'Reply', guest: 'Guest', guestComment: 'Guest comment' },
  de: { select: 'Element auswählen', area: 'Bereich markieren', comments: 'Kommentare', hint: 'Klicke auf ein Element oder markiere einen Bereich. Füge einen Kommentar oder eine KI-Anweisung hinzu.', add: 'Kommentar speichern', ask: 'Zum KI-Chat hinzufügen', placeholder: 'Änderung beschreiben oder kommentieren…', resolve: 'Erledigen', reopen: 'Erneut öffnen', empty: 'Keine Kommentare für diese Datei.', resolved: 'Erledigte anzeigen', selected: 'Auswahl', remove: 'Auswahl entfernen', resize: 'Chatbreite ändern', stale: 'Diese Auswahl stammt aus einer älteren Version. Vor dem Senden prüfen.', error: 'Kommentar konnte nicht gespeichert werden. Bitte erneut versuchen.', loadError: 'Kommentare konnten nicht geladen werden. Lade die Seite neu, um es erneut zu versuchen.', close: 'Schließen', tools: 'Anhänge und Medien', fit: 'Einpassen', project: 'Gesamtes Projekt', element: 'Element', areaShort: 'Bereich', selectBy: 'Auswahlmethode', reply: 'Antworten', guest: 'Gast', guestComment: 'Gastkommentar' },
};
