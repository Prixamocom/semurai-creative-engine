import type { ReviewTarget, StudioAuthorKind } from './studio-review';

/**
 * Share-by-link: the owner's link list in the Studio (proxied `shares`
 * endpoints) and the public viewer at /s/<token> (creative-service proxies its
 * /s/<token>/api/* calls to Semurai with the token in a header only).
 */
export type ShareLocale = 'pl' | 'en' | 'de';
export type SharePermission = 'view' | 'comment';
export type ShareExpiry = 1 | 7 | 30 | 90 | null;
export const SHARE_EXPIRY_DAYS: ShareExpiry[] = [null, 1, 7, 30, 90];

export interface ShareItem {
  id: string;
  permission: SharePermission;
  label: string | null;
  status: 'active' | 'expired';
  url: string;
  created_at: string;
  expires_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  guest_comment_count: number;
}

export interface SharedDocument { version: number; document_hash: string; name: string; html: string; files: { path: string; content: string }[] }
export interface SharePayload {
  share: { permission: SharePermission; expires_at: string | null };
  project: { title: string; artifact_type: string; locale: string; direction: 'ltr' | 'rtl' };
  document: SharedDocument | null;
}
/** Member names never reach the public API: `author` is null for member entries, a guest's own name otherwise. */
export interface PublicReply { id: string; text: string; author: string | null; author_kind: StudioAuthorKind; created_at: string | null }
/** An open thread of the public comments API; resolved threads are never listed there. */
export interface PublicComment {
  id: string; text: string; target: ReviewTarget; resolved: boolean; revision: number; created_at: string | null;
  author: string | null; author_kind: StudioAuthorKind; replies: PublicReply[];
}

const TOKEN_PATH = /^\/s\/([A-Za-z0-9_-]{43})\/?$/;
/** The share token of a viewer URL (/s/<43 base64url characters>), or null. */
export function shareTokenFromPath(pathname: string): string | null {
  return TOKEN_PATH.exec(pathname)?.[1] ?? null;
}

/** Share links cover HTML projects only; canvas graphics and videos cannot be shared yet. */
export function shareSupported(artifactType: string): boolean {
  return artifactType !== 'video' && artifactType !== 'canvas';
}

/** Viewer UI language from the browser: Polish, German, otherwise English. */
export function shareUiLocale(languages: readonly string[] | undefined): ShareLocale {
  for (const language of languages ?? []) {
    const code = language.toLowerCase().split('-')[0];
    if (code === 'pl' || code === 'de' || code === 'en') return code;
  }
  return 'en';
}

/**
 * UI language before any project context exists (share viewer, Studio loading
 * and expired screens): the browser's preferred languages through shareUiLocale.
 */
export function browserUiLocale(): ShareLocale {
  if (typeof navigator === 'undefined') return 'en';
  return shareUiLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function polish(count: number, one: string, few: string, many: string): string {
  const tens = count % 100, units = count % 10;
  return count === 1 ? one : units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}
/** "12 wyświetleń", "3 komentarze gości" with the right plural form. */
export function shareCount(locale: ShareLocale, kind: 'views' | 'guestComments', count: number): string {
  if (locale === 'pl') return count + ' ' + (kind === 'views' ? polish(count, 'wyświetlenie', 'wyświetlenia', 'wyświetleń') : polish(count, 'komentarz gościa', 'komentarze gości', 'komentarzy gości'));
  if (locale === 'de') return count + ' ' + (kind === 'views' ? (count === 1 ? 'Aufruf' : 'Aufrufe') : (count === 1 ? 'Gastkommentar' : 'Gastkommentare'));
  return count + ' ' + (kind === 'views' ? (count === 1 ? 'view' : 'views') : (count === 1 ? 'guest comment' : 'guest comments'));
}

/** Label of an expiry choice in the create form. */
export function shareExpiryLabel(locale: ShareLocale, days: ShareExpiry): string {
  const c = shareCopy[locale];
  return days === null ? c.never : days === 1 ? c.expiresOne : c.expiresDays.replace('{n}', String(days));
}

/** Guest comments anchor to the file (and slide) on screen; the whole page is the selection. */
export function shareGuestTarget(file: string, version: number, label: string, slideIndex?: number): ReviewTarget {
  return { file, version, label, selector: 'body', text: '', ...(slideIndex === undefined ? {} : { slideIndex }) };
}

const GUEST_NAME_KEY = 'semurai-share-guest-name';
export function readGuestName(): string {
  try { return (localStorage.getItem(GUEST_NAME_KEY) ?? '').slice(0, 60); } catch { return ''; }
}
export function writeGuestName(name: string): void {
  try { localStorage.setItem(GUEST_NAME_KEY, name.slice(0, 60)); } catch { /* Storage can be disabled; the name then lasts for this page only. */ }
}

/** A failed viewer request: the link is gone (404), too many requests (429) or anything else. */
export class ShareRequestError extends Error {
  /** `code` is Laravel's 422 reason, e.g. creative.reply_limit. */
  constructor(readonly status: number, readonly code?: string) { super('share request failed: ' + status); }
  get kind(): 'gone' | 'rateLimited' | 'failed' { return this.status === 404 ? 'gone' : this.status === 429 ? 'rateLimited' : 'failed'; }
}

/** Viewer calls, relative to the share page. The token is part of the path of this origin only. */
export async function shareRequest<T>(token: string, endpoint: 'share' | 'comments', body?: unknown, fetcher: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher('/s/' + token + '/api/' + endpoint, body === undefined
      ? { credentials: 'omit', cache: 'no-store' }
      : { method: 'POST', credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Creative-Action': 'share-comment' }, body: JSON.stringify(body) });
  } catch { throw new ShareRequestError(0); }
  if (!response.ok) {
    const detail = response.status === 422 ? await response.json().catch(() => null) as { message?: unknown } | null : null;
    throw new ShareRequestError(response.status, typeof detail?.message === 'string' ? detail.message : undefined);
  }
  const value = await response.json().catch(() => null) as { data?: T } | null;
  if (!value || value.data === undefined) throw new ShareRequestError(0);
  return value.data;
}

export const shareCopy = {
  pl: {
    share: 'Udostępnij', title: 'Udostępnij projekt', intro: 'Osoby z linkiem zobaczą ostatnią zapisaną wersję projektu bez logowania.',
    permission: 'Dostęp', view: 'Tylko podgląd', comment: 'Podgląd i komentarze', expiry: 'Ważność', never: 'Bez wygaśnięcia',
    expiresOne: 'Wygasa po 1 dniu', expiresDays: 'Wygasa po {n} dniach', label: 'Nazwa linku (opcjonalnie)', labelPlaceholder: 'np. Dla klienta',
    create: 'Utwórz link', links: 'Linki do projektu', none: 'Nie ma jeszcze linków do tego projektu.', copy: 'Kopiuj link', copied: 'Skopiowano link',
    copyFailed: 'Nie udało się skopiować linku. Zaznacz go i skopiuj ręcznie.', revoke: 'Wyłącz link', revokeTitle: 'Wyłączyć ten link?',
    revokeBody: 'Osoby, które go mają, stracą dostęp do projektu. Tego nie można cofnąć.', cancel: 'Anuluj', revoked: 'Link został wyłączony.',
    active: 'Aktywny', expired: 'Wygasł', created: 'Utworzono', expires: 'Wygasa', noExpiry: 'Bez wygaśnięcia', lastViewed: 'Ostatnio otwarty',
    unavailable: 'Udostępnianie jest chwilowo niedostępne', unsupported: 'Udostępnianie linkiem nie obejmuje jeszcze grafik i filmów.',
    error: 'Nie udało się zapisać zmian. Spróbuj ponownie.', empty: 'Zapisz pierwszą wersję projektu, aby go udostępnić.',
    limit: 'Osiągnięto limit aktywnych linków. Wyłącz nieużywany link i spróbuj ponownie.', close: 'Zamknij', loading: 'Wczytywanie linków…',
    linkOptions: 'Ustawienia linku', unnamed: 'Link bez nazwy',
  },
  en: {
    share: 'Share', title: 'Share project', intro: 'Anyone with the link sees the latest saved version of the project without signing in.',
    permission: 'Access', view: 'View only', comment: 'View and comment', expiry: 'Expiry', never: 'No expiry',
    expiresOne: 'Expires after 1 day', expiresDays: 'Expires after {n} days', label: 'Link name (optional)', labelPlaceholder: 'e.g. For the client',
    create: 'Create link', links: 'Project links', none: 'There are no links to this project yet.', copy: 'Copy link', copied: 'Link copied',
    copyFailed: 'The link could not be copied. Select it and copy it by hand.', revoke: 'Turn off link', revokeTitle: 'Turn off this link?',
    revokeBody: 'People who have it lose access to the project. This cannot be undone.', cancel: 'Cancel', revoked: 'The link was turned off.',
    active: 'Active', expired: 'Expired', created: 'Created', expires: 'Expires', noExpiry: 'No expiry', lastViewed: 'Last opened',
    unavailable: 'Sharing is temporarily unavailable', unsupported: 'Link sharing does not cover graphics and videos yet.',
    error: 'Your change could not be saved. Please try again.', empty: 'Save a first version of the project to share it.',
    limit: 'The limit of active links is reached. Turn off a link you no longer use and try again.', close: 'Close', loading: 'Loading links…',
    linkOptions: 'Link settings', unnamed: 'Untitled link',
  },
  de: {
    share: 'Teilen', title: 'Projekt teilen', intro: 'Alle mit dem Link sehen die zuletzt gespeicherte Version des Projekts ohne Anmeldung.',
    permission: 'Zugriff', view: 'Nur ansehen', comment: 'Ansehen und kommentieren', expiry: 'Gültigkeit', never: 'Unbegrenzt',
    expiresOne: 'Läuft nach 1 Tag ab', expiresDays: 'Läuft nach {n} Tagen ab', label: 'Linkname (optional)', labelPlaceholder: 'z. B. Für den Kunden',
    create: 'Link erstellen', links: 'Projektlinks', none: 'Für dieses Projekt gibt es noch keine Links.', copy: 'Link kopieren', copied: 'Link kopiert',
    copyFailed: 'Der Link konnte nicht kopiert werden. Markiere und kopiere ihn manuell.', revoke: 'Link deaktivieren', revokeTitle: 'Diesen Link deaktivieren?',
    revokeBody: 'Alle, die ihn haben, verlieren den Zugriff auf das Projekt. Das kann nicht rückgängig gemacht werden.', cancel: 'Abbrechen', revoked: 'Der Link wurde deaktiviert.',
    active: 'Aktiv', expired: 'Abgelaufen', created: 'Erstellt', expires: 'Läuft ab', noExpiry: 'Unbegrenzt', lastViewed: 'Zuletzt geöffnet',
    unavailable: 'Teilen ist vorübergehend nicht verfügbar', unsupported: 'Das Teilen per Link umfasst noch keine Grafiken und Videos.',
    error: 'Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.', empty: 'Speichere eine erste Version des Projekts, um es zu teilen.',
    limit: 'Die Höchstzahl aktiver Links ist erreicht. Deaktiviere einen ungenutzten Link und versuche es erneut.', close: 'Schließen', loading: 'Links werden geladen…',
    linkOptions: 'Linkeinstellungen', unnamed: 'Link ohne Namen',
  },
};

export const shareViewerCopy = {
  pl: {
    loading: 'Wczytywanie projektu…', gone: 'Link wygasł lub został wyłączony.', goneHelp: 'Poproś autora projektu o nowy link.',
    failed: 'Nie udało się wczytać projektu.', retry: 'Spróbuj ponownie', rateLimited: 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.',
    empty: 'Ten projekt nie ma jeszcze zapisanej wersji.', viewOnly: 'Tylko podgląd', files: 'Pliki projektu', preview: 'Podgląd projektu',
    previous: 'Poprzedni slajd', next: 'Następny slajd', slide: 'Slajd', devices: 'Urządzenie', desktop: 'Komputer', tablet: 'Tablet', mobile: 'Telefon',
    comments: 'Komentarze', showComments: 'Pokaż komentarze', hideComments: 'Ukryj komentarze', name: 'Twoje imię', guest: 'Gość',
    placeholder: 'Napisz komentarz…', send: 'Wyślij komentarz', reply: 'Odpowiedz', noComments: 'Brak komentarzy do tego pliku. Dodaj pierwszy.',
    commentOn: 'Komentarz do: {target}', wholePage: 'Cała strona', commentError: 'Nie udało się wysłać komentarza. Spróbuj ponownie.',
    nameRequired: 'Podaj swoje imię.', limit: 'Ten projekt ma już najwięcej komentarzy, jakie można dodać.', nameInvalid: 'Imię zawiera niedozwolone znaki.', member: 'Autor projektu', close: 'Zamknij', website: 'Strona internetowa',
  },
  en: {
    loading: 'Loading the project…', gone: 'This link has expired or was turned off.', goneHelp: 'Ask the project owner for a new link.',
    failed: 'The project could not be loaded.', retry: 'Try again', rateLimited: 'Too many requests. Please try again in a moment.',
    empty: 'This project has no saved version yet.', viewOnly: 'View only', files: 'Project files', preview: 'Project preview',
    previous: 'Previous slide', next: 'Next slide', slide: 'Slide', devices: 'Device', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile',
    comments: 'Comments', showComments: 'Show comments', hideComments: 'Hide comments', name: 'Your name', guest: 'Guest',
    placeholder: 'Write a comment…', send: 'Send comment', reply: 'Reply', noComments: 'No comments on this file yet. Add the first one.',
    commentOn: 'Comment on: {target}', wholePage: 'Whole page', commentError: 'The comment could not be sent. Please try again.',
    nameRequired: 'Enter your name.', limit: 'This project already has the most comments that can be added.', nameInvalid: 'The name contains characters that are not allowed.', member: 'Project author', close: 'Close', website: 'Website',
  },
  de: {
    loading: 'Projekt wird geladen…', gone: 'Dieser Link ist abgelaufen oder wurde deaktiviert.', goneHelp: 'Bitte den Projektinhaber um einen neuen Link.',
    failed: 'Das Projekt konnte nicht geladen werden.', retry: 'Erneut versuchen', rateLimited: 'Zu viele Anfragen. Bitte gleich erneut versuchen.',
    empty: 'Dieses Projekt hat noch keine gespeicherte Version.', viewOnly: 'Nur ansehen', files: 'Projektdateien', preview: 'Projektvorschau',
    previous: 'Vorherige Folie', next: 'Nächste Folie', slide: 'Folie', devices: 'Gerät', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Smartphone',
    comments: 'Kommentare', showComments: 'Kommentare anzeigen', hideComments: 'Kommentare ausblenden', name: 'Dein Name', guest: 'Gast',
    placeholder: 'Kommentar schreiben…', send: 'Kommentar senden', reply: 'Antworten', noComments: 'Noch keine Kommentare zu dieser Datei. Schreib den ersten.',
    commentOn: 'Kommentar zu: {target}', wholePage: 'Ganze Seite', commentError: 'Der Kommentar konnte nicht gesendet werden. Bitte erneut versuchen.',
    nameRequired: 'Gib deinen Namen ein.', limit: 'Dieses Projekt hat bereits die maximale Anzahl an Kommentaren.', nameInvalid: 'Der Name enthält unzulässige Zeichen.', member: 'Projektautor', close: 'Schließen', website: 'Webseite',
  },
};
