'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { safeStudioReturn, studioDocumentTitle, studioSessionPath, type StudioContext } from './studio-context';
import './studio.css';
import { StudioEditor } from './StudioEditor';
import { useStudioTheme } from './studio-theme';

const copy = {
  en: { loading: 'Opening your project…', connected: 'Connected to Semurai', project: 'Your project',
    subtitle: 'Presentations, pages and documents in your Semurai workspace.',
    back: 'Return to project', signOut: 'Close Studio session', expired: 'This Studio session has expired.',
    expiredHelp: 'Open Creative Studio again from your project in Semurai.', version: 'Saved version',
    language: 'Design language', sourceLanguage: 'Source language', workspace: 'Workspace',
    empty: 'Your project is ready for its first version.', saved: 'Your saved work belongs to this Semurai project.',
    presentation: 'Presentation', landing: 'Landing page', document: 'Document', report: 'Report', email: 'Email' },
  pl: { loading: 'Otwieranie projektu…', connected: 'Połączono z Semurai', project: 'Twój projekt',
    subtitle: 'Prezentacje, strony i dokumenty w Twoim workspace Semurai.',
    back: 'Wróć do projektu', signOut: 'Zamknij sesję Studio', expired: 'Ta sesja Studio wygasła.',
    expiredHelp: 'Otwórz Creative Studio ponownie z poziomu projektu w Semurai.', version: 'Zapisana wersja',
    language: 'Język projektu', sourceLanguage: 'Język materiału', workspace: 'Workspace',
    empty: 'Projekt jest gotowy na pierwszą wersję.', saved: 'Zapisana praca należy do tego projektu Semurai.',
    presentation: 'Prezentacja', landing: 'Landing page', document: 'Dokument', report: 'Raport', email: 'E-mail' },
  de: { loading: 'Projekt wird geöffnet…', connected: 'Mit Semurai verbunden', project: 'Dein Projekt',
    subtitle: 'Präsentationen, Seiten und Dokumente in deinem Semurai-Arbeitsbereich.',
    back: 'Zurück zum Projekt', signOut: 'Studio-Sitzung schließen', expired: 'Diese Studio-Sitzung ist abgelaufen.',
    expiredHelp: 'Öffne Creative Studio erneut über dein Projekt in Semurai.', version: 'Gespeicherte Version',
    language: 'Projektsprache', sourceLanguage: 'Ausgangssprache', workspace: 'Arbeitsbereich',
    empty: 'Dein Projekt ist bereit für seine erste Version.', saved: 'Deine gespeicherte Arbeit gehört zu diesem Semurai-Projekt.',
    presentation: 'Präsentation', landing: 'Landingpage', document: 'Dokument', report: 'Bericht', email: 'E-Mail' },
};

export function SemuraiStudio() {
  const [context, setContext] = useState<StudioContext | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const { setLocale } = useI18n();
  const { theme } = useStudioTheme();
  const c = copy[context?.project.uiLocale ?? 'en'];
  useEffect(() => {
    const controller = new AbortController();
    const path = studioSessionPath(window.location.pathname);
    let expiry: ReturnType<typeof setTimeout> | undefined;
    if (!path) { setUnavailable(true); return; }
    void fetch(path + 'context', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Session unavailable');
        const value = await response.json() as StudioContext;
        if (!safeStudioReturn(value) || value.expiresAt <= Date.now()) throw new Error('Session unavailable');
        if (controller.signal.aborted) return;
        setContext(value);
        setLocale(value.project.uiLocale);
        expiry = setTimeout(() => setUnavailable(true), Math.max(0, value.expiresAt - Date.now()));
      })
      .catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => { controller.abort(); clearTimeout(expiry); };
  }, [setLocale]);
  const projectTitle = context?.project.title;
  useEffect(() => { document.title = studioDocumentTitle(projectTitle); }, [projectTitle]);
  async function closeSession() {
    const path = studioSessionPath(window.location.pathname);
    if (!path) return;
    try {
      const response = await fetch(path + 'logout', { method: 'POST', credentials: 'same-origin',
        headers: { 'X-Creative-Action': 'logout' } });
      if (response.ok && context) window.location.assign(safeStudioReturn(context)!);
      else setUnavailable(true);
    } catch { setUnavailable(true); }
  }
  // An expired grant must not discard a dirty document. Keep the editor mounted
  // so the user can retain/export their work while reconnecting to Semurai.
  if (context) return <StudioEditor context={context} expired={unavailable} onClose={() => { void closeSession(); }} />;
  return <main className="semurai-studio-shell" data-testid="semurai-studio" data-studio-theme={theme}>
    <header className="semurai-studio-header">
      <div className="semurai-studio-wordmark"><span aria-hidden="true">S</span>Semurai Creative <small>Studio</small></div>
    </header>
    <section className="semurai-studio-content">
      {unavailable ? <div role="alert"><h1>{c.expired}</h1><p>{c.expiredHelp}</p>
        <a className="semurai-studio-primary" href="https://semur.ai/app/chat/creative">{c.back}</a></div>
        : <p role="status">{c.loading}</p>}
    </section>
  </main>;
}
