'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Eye, FileCode2, MessageSquare, Monitor, PanelRightClose, Smartphone, Tablet } from 'lucide-react';
import { StudioBadge, StudioButton, StudioMenu, StudioMenuItem } from './StudioButton';
import { ShareComments } from './ShareComments';
import { studioDocumentTitle } from './studio-context';
import { studioPreviewSource, studioSlideCount } from './studio-preview';
import { browserUiLocale, ShareRequestError, shareRequest, shareTokenFromPath, shareViewerCopy, type PublicComment, type ShareLocale, type SharePayload } from './studio-share';
import type { ReviewTarget } from './studio-review';
import type { StudioTheme } from './studio-theme';
import './studio.css';
import tokens from './StudioTokens.module.css';
import styles from './ShareViewer.module.css';

type Failure = 'gone' | 'rateLimited' | 'failed';
type ViewerState = { kind: 'loading' } | { kind: 'ready'; data: SharePayload } | { kind: 'error'; failure: Failure };
const DEVICES = [[0, 'desktop', Monitor], [768, 'tablet', Tablet], [390, 'mobile', Smartphone]] as const;

const DARK = '(prefers-color-scheme: dark)';
function subscribeScheme(listener: () => void) {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK) : null;
  media?.addEventListener?.('change', listener);
  return () => media?.removeEventListener?.('change', listener);
}
/** Guests get the system light/dark scheme; the Studio's stored theme choice is the owner's, not theirs. */
function useSystemTheme(): StudioTheme {
  return useSyncExternalStore(subscribeScheme, () => typeof window.matchMedia === 'function' && window.matchMedia(DARK).matches ? 'dark' : 'light', () => 'light');
}

function failureOf(reason: unknown): Failure {
  return reason instanceof ShareRequestError ? reason.kind : 'failed';
}

/**
 * Public viewer of a share link (/s/<token>). It shows the latest saved
 * version read-only in a script-only sandbox (never same-origin, no modals),
 * with deck navigation, a file switcher and, for comment links, guest comments.
 * Speaker notes are never part of the shared payload or shown.
 */
export function SemuraiShareViewer({ token: tokenProp, fetcher }: { token?: string; fetcher?: typeof fetch } = {}) {
  const theme = useSystemTheme();
  const [locale, setLocale] = useState<ShareLocale | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<ViewerState>({ kind: 'loading' });
  const load = useCallback(async (value: string) => {
    setState({ kind: 'loading' });
    try { setState({ kind: 'ready', data: await shareRequest<SharePayload>(value, 'share', undefined, fetcher) }); }
    catch (reason) { setState({ kind: 'error', failure: failureOf(reason) }); }
  }, [fetcher]);
  useEffect(() => {
    // The static shell is prerendered without a locale; the browser language and the token apply on mount.
    setLocale(browserUiLocale());
    const value = tokenProp ?? shareTokenFromPath(window.location.pathname);
    setToken(value);
    if (value) void load(value); else setState({ kind: 'error', failure: 'gone' });
  }, [tokenProp, load]);
  const title = state.kind === 'ready' ? state.data.project.title : null;
  useEffect(() => { document.title = studioDocumentTitle(title); }, [title]);

  const c = shareViewerCopy[locale ?? 'en'];
  const shell = (content: ReactNode) => <main className={tokens.tokens + ' ' + styles.viewer} data-studio-theme={theme} lang={locale ?? undefined} data-testid="share-viewer">
    <header className={styles.topbar}><Mark /></header>
    <section className={styles.status}>{content}</section>
  </main>;
  if (!locale) return shell(null);
  if (state.kind === 'loading') return shell(<p role="status">{c.loading}</p>);
  if (state.kind === 'error') return shell(<div role="alert">
    <h1>{state.failure === 'gone' ? c.gone : state.failure === 'rateLimited' ? c.rateLimited : c.failed}</h1>
    {state.failure === 'gone' ? <p>{c.goneHelp}</p> : token && <StudioButton variant="secondary" onClick={() => { void load(token); }}>{c.retry}</StudioButton>}
  </div>);
  if (!state.data.document) return shell(<div role="status"><h1>{state.data.project.title}</h1><p>{c.empty}</p></div>);
  return <SharedProject key={token} token={token!} locale={locale} theme={theme} data={state.data} fetcher={fetcher} onGone={() => setState({ kind: 'error', failure: 'gone' })} />;
}

function Mark() {
  return <span className={styles.mark}><span aria-hidden="true">S</span>Semurai Creative</span>;
}

function SharedProject({ token, locale, theme, data, fetcher, onGone }: {
  token: string; locale: ShareLocale; theme: StudioTheme; data: SharePayload; fetcher?: typeof fetch; onGone: () => void;
}) {
  const c = shareViewerCopy[locale];
  const shared = data.document!;
  const commenting = data.share.permission === 'comment';
  const deck = data.project.artifact_type === 'presentation';
  const files = useMemo(() => ['index.html', ...shared.files.map(item => item.path).filter(path => path && path !== 'index.html')], [shared]);
  const [file, setFile] = useState('index.html');
  const html = file === 'index.html' ? shared.html : shared.files.find(item => item.path === file)?.content ?? '';
  const count = useMemo(() => deck ? studioSlideCount(html) : 0, [deck, html]);
  const [slide, setSlide] = useState(0);
  const slideRef = useRef(0); slideRef.current = slide;
  const [device, setDevice] = useState(0);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsError, setCommentsError] = useState<Failure | null>(null);
  const [panel, setPanel] = useState(commenting);
  const [activeId, setActiveId] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const post = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  // Rebuilt only for another file: a new srcdoc would reset the deck runtime and the reader's position.
  const srcdoc = useMemo(() => studioPreviewSource(html, slideRef.current, false, deck, false, commenting), [html, deck, commenting]);

  const readComments = useCallback(async () => {
    if (!commenting) return;
    try { setComments(await shareRequest<PublicComment[]>(token, 'comments', undefined, fetcher)); setCommentsError(null); }
    catch (reason) { const failure = failureOf(reason); if (failure === 'gone') onGone(); else setCommentsError(failure); }
  }, [commenting, token, fetcher, onGone]);
  useEffect(() => {
    void readComments();
    const focus = () => { void readComments(); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [readComments]);

  // Comment pins in the preview: this file's threads (the public API lists open ones only), on decks only those of the slide on screen.
  const markers = useMemo(() => comments.filter(item => (item.target?.file ?? 'index.html') === file)
    .map((item, index) => ({ id: item.id, text: item.text, resolved: false, target: item.target, number: index + 1, label: c.comments }))
    .filter(item => !deck || item.target.slideIndex === undefined || item.target.slideIndex === slide), [comments, file, deck, slide, c.comments]);
  const markerState = useRef({ items: markers, selected: activeId }); markerState.current = { items: markers, selected: activeId };
  const syncMarkers = useCallback(() => {
    if (commenting) post({ type: 'semurai:comment-markers', items: markerState.current.items, enabled: true, selected: markerState.current.selected });
  }, [commenting]);
  useEffect(() => { syncMarkers(); }, [markers, activeId, syncMarkers]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: unknown; active?: unknown; id?: unknown };
      if (message.type === 'od:slide-state' && Number.isInteger(message.active) && Number(message.active) >= 0) setSlide(Number(message.active));
      if (message.type === 'semurai:comment-markers-ready') syncMarkers();
      if (message.type === 'semurai:comment-open' && typeof message.id === 'string') { setPanel(true); setActiveId(message.id); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [syncMarkers]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!deck || (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"],[role="menu"]'))) return;
      const action = ['ArrowRight', 'PageDown'].includes(event.key) ? 'next' : ['ArrowLeft', 'PageUp'].includes(event.key) ? 'prev' : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null;
      if (action) { event.preventDefault(); post({ type: 'od:slide', action }); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [deck]);

  function go(index: number) {
    const next = Math.max(0, Math.min(count - 1, index));
    setSlide(next);
    post({ type: 'od:slide', action: 'go', index: next });
  }
  function select(target: ReviewTarget, id: string) {
    setActiveId(id);
    if (deck && target.slideIndex !== undefined && target.slideIndex !== slide) go(target.slideIndex);
    post({ type: 'semurai:comment-focus', id });
  }
  function selectFile(next: string) { setFile(next); setSlide(0); setActiveId(null); }
  const currentDevice = DEVICES.find(([width]) => width === device) ?? DEVICES[0];
  const DeviceIcon = currentDevice[2];
  const open = comments.filter(item => (item.target?.file ?? 'index.html') === file).length;

  return <main className={tokens.tokens + ' ' + styles.viewer + (commenting && panel ? ' ' + styles.withPanel : '')} data-studio-theme={theme} lang={locale} data-testid="share-viewer">
    <header className={styles.topbar}>
      <Mark />
      <span className={styles.divider} aria-hidden="true" />
      <h1 className={styles.title} title={data.project.title}>{data.project.title}</h1>
      {!commenting && <span className={styles.chip}><Eye size={14} />{c.viewOnly}</span>}
      <div className={styles.barEnd}>
        {files.length > 1 && <StudioMenu label={c.files} title={c.files} ariaLabel={c.files + ': ' + file} align="end" triggerClassName={styles.fileTrigger}
          trigger={<><FileCode2 size={16} /><span className={styles.fileName}>{file}</span><ChevronDown size={16} /></>}>
          {files.map(item => <StudioMenuItem key={item} icon={<FileCode2 size={16} />} checked={item === file} onSelect={() => selectFile(item)}>{item}</StudioMenuItem>)}
        </StudioMenu>}
        {deck && count > 0 && <div className={styles.deckNav} role="group" aria-label={c.slide}>
          <StudioButton icon title={c.previous} aria-label={c.previous} disabled={slide <= 0} onClick={() => go(slide - 1)}><ChevronLeft size={16} /></StudioButton>
          <span className={styles.counter} aria-live="polite">{c.slide} {Math.min(slide, count - 1) + 1} / {count}</span>
          <StudioButton icon title={c.next} aria-label={c.next} disabled={slide >= count - 1} onClick={() => go(slide + 1)}><ChevronRight size={16} /></StudioButton>
        </div>}
        {!deck && <StudioMenu label={c.devices} title={c.devices} ariaLabel={c.devices + ': ' + c[currentDevice[1]]} icon align="end" trigger={<DeviceIcon size={16} />}>
          {DEVICES.map(([width, key, Icon]) => <StudioMenuItem key={key} icon={<Icon size={16} />} checked={device === width} hint={width ? width + ' px' : '100%'} onSelect={() => setDevice(width)}>{c[key]}</StudioMenuItem>)}
        </StudioMenu>}
        {commenting && <StudioButton variant={panel ? 'secondary' : 'ghost'} aria-pressed={panel} title={panel ? c.hideComments : c.showComments} aria-label={panel ? c.hideComments : c.showComments} onClick={() => setPanel(!panel)}>
          <MessageSquare size={16} /><span className={styles.label}>{c.comments}</span>{open > 0 && <StudioBadge>{open}</StudioBadge>}
        </StudioButton>}
      </div>
    </header>
    <div className={styles.body}>
      <div className={styles.stage}>
        <div className={styles.frame} data-deck={deck || undefined} style={device && !deck ? { width: device, maxWidth: '100%' } : undefined}>
          <iframe ref={frame} title={c.preview} sandbox="allow-scripts" srcDoc={srcdoc} onLoad={syncMarkers} />
        </div>
      </div>
      {commenting && panel && <aside className={styles.panel} aria-label={c.comments}>
        <ShareComments token={token} locale={locale} comments={comments} onComments={setComments} file={file} version={shared.version} slide={slide} deck={deck}
          activeId={activeId} onSelect={select} onGone={onGone} fetcher={fetcher}
          header={<header className={styles.panelHead}><strong>{c.comments}</strong>
            <StudioButton icon title={c.hideComments} aria-label={c.hideComments} onClick={() => setPanel(false)}><PanelRightClose size={16} /></StudioButton>
            {commentsError && <p role="alert" className={styles.panelError}>{commentsError === 'rateLimited' ? c.rateLimited : c.failed}
              <StudioButton onClick={() => { void readComments(); }}>{c.retry}</StudioButton></p>}</header>} />
      </aside>}
    </div>
  </main>;
}
