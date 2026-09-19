'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@open-design/components';
import { ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Code2, Copy, Download, Eye, History, Layers, Maximize2, MessageSquare, Monitor, Smartphone, Tablet, MousePointer2, Scan, PanelLeftClose, PanelLeftOpen, Pencil, RotateCcw, RotateCw, Sparkles, Trash2, X } from 'lucide-react';
import { DeckThumbnailRail } from '../components/DeckThumbnailRail';
import { ManualEditPanel, emptyManualEditDraft, type ManualEditDraft } from '../components/ManualEditPanel';
import { applyManualEditPatch } from '../edit-mode/source-patches';
import type { ManualEditPatch, ManualEditTarget } from '../edit-mode/types';
import { safeStudioReturn, studioSessionPath, type StudioContext } from './studio-context';
import { studioPreviewSource, studioSlideCount } from './studio-preview';
import { studioEditorCopy } from './studio-editor-copy';
import { changeSlide, replaceStyleBlock, styleBlocks, studioFileSource, replaceStudioFile, type SlideOperation } from './studio-source';
import { downloadStudioFile, exportStudioDocument } from './studio-export';
import { StudioChatTurn } from './StudioChatTurn';
import { terminalChatStatuses as terminal, type StudioChatJob, type StudioLiveRun } from './studio-chat';
import { StudioMedia, type StudioImage } from './StudioMedia';
import { StudioPresenter } from './StudioPresenter';
import { StudioImagePicker } from './StudioImagePicker';
import { StudioImageMenu } from './StudioImageMenu';
import { placeStudioImage } from './studio-images';
import styles from './StudioEditor.module.css';
import { StudioReview } from './StudioReview';
import { StudioInspector } from './StudioInspector';
import { StudioCommentThread } from './StudioCommentThread';
import { readReviewTarget, reviewBrief, reviewCopy, type ReviewTarget, type StudioComment } from './studio-review';

interface StudioDocument { version: 1; kind: string; name: string; html: string; files?: { path: string; content: string }[]; notes: (string | null)[]; brandContextHash?: string }
interface SavedSource { id: string; version: number; document: StudioDocument; document_hash: string }
type Job = StudioChatJob;
interface Version { id: string; version: number; kind: string; created_at: string }
interface ProjectExport { id: string; format: 'html' | 'pptx'; version: number; title: string; created_at: string; mime_type: string; size: number; sha256: string }

export function StudioEditor({ context, expired = false, onClose }: { context: StudioContext; expired?: boolean; onClose: () => void }) {
  const c = studioEditorCopy[context.project.uiLocale];
  const r = reviewCopy[context.project.uiLocale];
  const [chatWidth, setChatWidth] = useState(() => { try { return Math.max(280, Math.min(640, Number(localStorage.getItem('semurai-studio-chat-width')) || 390)); } catch { return 390; } });
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ x: 0, width: 390 });
  const [inspectorMode, setInspectorMode] = useState<'simple' | 'pro' | 'code'>(() => { try { const value = localStorage.getItem('semurai-studio-inspector'); return value === 'pro' || value === 'code' ? value : 'simple'; } catch { return 'simple'; } });
  const [commentPoint, setCommentPoint] = useState<{ x: number; y: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const [review, setReview] = useState<'element' | 'area' | null>(null);
  const [comments, setComments] = useState<StudioComment[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [aiTarget, setAiTarget] = useState<ReviewTarget | null>(null);
  const reviewTargets = useRef<ReviewTarget[]>([]);
  const [areaBox, setAreaBox] = useState<ReviewTarget['position']>();
  const areaStart = useRef<{ x: number; y: number } | null>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const path = studioSessionPath(window.location.pathname)!;
  const deck = context.project.artifactType === 'presentation';
  const video = context.project.artifactType === 'video';
  const [videoRuntime, setVideoRuntime] = useState('');
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoTimeRef = useRef(0);
  const renderSave = useRef(false);
  const renderKey = useRef<{ source: string; key: string } | null>(null);
  const v = context.project.uiLocale === 'pl' ? { play: 'Odtwórz', pause: 'Pauza', time: 'Pozycja filmu', save: 'Zapisz i renderuj', rendering: 'Renderuję nową wersję filmu…' }
    : context.project.uiLocale === 'de' ? { play: 'Abspielen', pause: 'Pause', time: 'Videoposition', save: 'Speichern und rendern', rendering: 'Neue Videoversion wird gerendert…' }
    : { play: 'Play', pause: 'Pause', time: 'Video position', save: 'Save and render', rendering: 'Rendering the new video version…' };
  const frame = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const latest = useRef<StudioDocument | null>(null);
  const baseline = useRef<SavedSource | null>(null);
  const [activeFile, setActiveFile] = useState('index.html');
  const activeFileRef = useRef('index.html');
  const [document, setDocument] = useState<StudioDocument | null>(null);
  const [presentation, setPresentation] = useState<{ document: StudioDocument; slide: number } | null>(null);
  const [saved, setSaved] = useState<SavedSource | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef(jobs); jobsRef.current = jobs;
  const liveRefreshAt = useRef(0);
  const [versions, setVersions] = useState<Version[]>([]);
  const [exports, setExports] = useState<ProjectExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<Record<string, StudioLiveRun>>({});
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<StudioImage[]>([]);
  const [useLibrary, setUseLibrary] = useState(true);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [imagePicker, setImagePicker] = useState<{ source: string; target: ManualEditTarget | null; initialSource: 'attach' | 'library' } | null>(null);
  const chatLog = useRef<HTMLDivElement>(null);
  const followChat = useRef(true);
  const [mode, setMode] = useState<'preview' | 'edit' | 'source'>('preview');
  const [device, setDevice] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [slide, setSlide] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [sourceTab, setSourceTab] = useState<'html' | 'css'>('html');
  const [sheet, setSheet] = useState(0);
  const [targets, setTargets] = useState<ManualEditTarget[]>([]);
  const [selected, setSelected] = useState<ManualEditTarget | null>(null);
  const [draft, setDraft] = useState<ManualEditDraft>(emptyManualEditDraft());
  const [undo, setUndo] = useState<StudioDocument[]>([]);
  const [redo, setRedo] = useState<StudioDocument[]>([]);
  const requestKey = useRef<string | null>(null);
  const active = jobs.find(job => !terminal.has(job.status));
  const dirty = Boolean(document && JSON.stringify(document) !== JSON.stringify(saved?.document));
  const visibleHtml = document ? studioFileSource(document, activeFile) : '';
  const count = useMemo(() => document && deck ? studioSlideCount(visibleHtml) : 0, [visibleHtml, deck]);
  const sheets = useMemo(() => document ? styleBlocks(visibleHtml) : [], [visibleHtml]);

  useEffect(() => { try { localStorage.setItem('semurai-studio-chat-width', String(chatWidth)); } catch { /* Storage can be disabled. */ } }, [chatWidth]);
  useEffect(() => { if (mode !== 'preview') { setReview(null); setReviewTarget(null); } }, [mode]);
  useEffect(() => { setReviewTarget(null); setAreaBox(undefined); reviewTargets.current = []; }, [activeFile, device, slide]);
  const reviewState = useRef({ review, version: 0 });
  reviewState.current = { review, version: saved?.version ?? 0 };
  function selectReview(target: ReviewTarget | null, id?: string) {
    setActiveCommentId(id ?? null);
    if (id) frame.current?.contentWindow?.postMessage({ type: 'semurai:comment-focus', id }, '*');
    setReviewTarget(target);
    if (target?.slideIndex !== undefined) navigateSlide(target.slideIndex);
    frame.current?.contentWindow?.postMessage({ type: 'od:comment-active-target', elementId: target?.elementId, selector: target?.selector }, '*');
  }
  function askSelection(target: ReviewTarget, text: string) {
    setReview(null); setMode('preview'); setActiveCommentId(null);
    setAiTarget(target); setPrompt(previous => [previous.trim(), text.trim()].filter(Boolean).join('\n')); requestKey.current = null;
    setChatCollapsed(false); setShowChat(true); requestAnimationFrame(() => promptInput.current?.focus());
  }
  function selectFile(file: string) {
    activeFileRef.current = file; setActiveFile(file); setSelected(null); setTargets([]); setSheet(0); setSlide(0);
  }
  const api = useCallback(async (endpoint: string, method = 'GET', body?: unknown) => {
    const response = await fetch(path + 'project/' + endpoint, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Creative-Action': 'project' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 401 ? c.expired : response.status === 409 ? c.conflict : c.error);
    return response.json();
  }, [path, c]);

  useEffect(() => {
    let live = true;
    const read = () => { void api('comments').then(result => { if (live) setComments(result.data); }).catch(() => { if (live) setError(r.error); }); };
    read(); window.addEventListener('focus', read);
    return () => { live = false; window.removeEventListener('focus', read); };
  }, [api, r.error]);
  const fileComments = comments.filter(item => item.target.file === activeFile);
  const markerItems = fileComments.map((item, index) => ({ ...item, number: index + 1, label: r.comments })).filter(item => showResolved || !item.resolved);
  const markersState = useRef({ items: markerItems, enabled: true, selected: activeCommentId });
  markersState.current = { items: markerItems, enabled: mode === 'preview', selected: activeCommentId };
  function syncMarkers() {
    frame.current?.contentWindow?.postMessage({ type: 'semurai:comment-markers', ...markersState.current }, '*');
  }
  useEffect(() => { try { localStorage.setItem('semurai-studio-inspector', inspectorMode); } catch {} }, [inspectorMode]);
  useEffect(() => { if (review || mode === 'edit') { setChatCollapsed(false); setShowChat(true); } }, [review, mode]);
  const focusedComment = comments.find(item => item.id === activeCommentId && (showResolved || !item.resolved));
  useEffect(() => { syncMarkers(); }, [zoom, device, chatWidth, chatCollapsed]);
  const commentsRef = useRef(comments); commentsRef.current = comments;
  useEffect(() => {
    syncMarkers();
    frame.current?.contentWindow?.postMessage({ type: 'od:comment-mode', enabled: !!review && mode === 'preview' }, '*');
  }, [comments, activeFile, showResolved, activeCommentId, mode, review, frameReady]);
  useEffect(() => { setActiveCommentId(null); }, [activeFile]);

  function adopt(value: SavedSource | null) {
    if (activeFileRef.current !== 'index.html' && !value?.document.files?.some(file => file.path === activeFileRef.current)) { activeFileRef.current = 'index.html'; setActiveFile('index.html'); }
    baseline.current = value; latest.current = value?.document ?? null;
    setSaved(value); setDocument(value?.document ?? null); setUndo([]); setRedo([]); setSelected(null);
  }
  const refresh = useCallback(async (initial = false) => {
    if (renderSave.current && !initial) return;
    const [source, jobList, history, files] = await Promise.all([api('document'), api('jobs'), api('versions'), api('exports')]);
    setJobs(jobList.data); setVersions(history.data);
    setExports(files.data);
    const next = source.data as SavedSource | null;
    const changed = next?.version !== baseline.current?.version || next?.document_hash !== baseline.current?.document_hash;
    if (renderSave.current) return;
    if (initial || (changed && JSON.stringify(latest.current) === JSON.stringify(baseline.current?.document ?? null))) adopt(next);
    else if (changed) setError(c.conflict);
  }, [api, c]);
  useEffect(() => {
    if (!video) return;
    const controller = new AbortController();
    void fetch(path + 'export/gsap.min.js', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(c.error); return response.text(); })
      .then(setVideoRuntime).catch(() => { if (!controller.signal.aborted) setError(c.error); });
    return () => controller.abort();
  }, [video, path, c]);
  useEffect(() => {
    if (!video) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === 'semurai:video-error') setError(c.error);
      if (data?.type !== 'semurai:video-state' || !Number.isFinite(data.time) || !Number.isFinite(data.duration)) return;
      setVideoTime(data.time); setVideoDuration(Math.max(0, Math.min(60, data.duration))); setVideoPlaying(data.playing === true); if (data.playing) videoTimeRef.current = data.time;
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [video, c]);
  useEffect(() => { let live = true; void refresh(true).catch(() => { if (live) setError(c.error); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [refresh, c]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const tick = async () => { try { await refresh(); } catch { if (!cancelled) setError(c.error); } finally { if (!cancelled) timer = setTimeout(() => { void tick(); }, 2500); } };
    timer = setTimeout(() => { void tick(); }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active?.id, refresh, c]);
  useEffect(() => { const focused = () => { void refresh().catch(() => {}); }; window.addEventListener('focus', focused); return () => window.removeEventListener('focus', focused); }, [refresh]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  useEffect(() => { const element = chatLog.current; if (element && followChat.current) element.scrollTop = element.scrollHeight; }, [jobs, liveMessages]);
  useEffect(() => {
    if (expired || typeof EventSource === 'undefined') return;
    const events = new EventSource(path + 'chat/events');
    events.addEventListener('chat', event => {
      try {
        const runs = JSON.parse((event as MessageEvent).data);
        if (!Array.isArray(runs)) return;
        if (runs.some(run => typeof run.runId === 'string' && !jobsRef.current.some(job => job.run_id === run.runId)) && Date.now() - liveRefreshAt.current > 2500) {
          liveRefreshAt.current = Date.now(); void refresh().catch(() => {});
        }
        setLiveMessages(previous => {
          const next = { ...previous };
          for (const run of runs) if (typeof run.runId === 'string' && typeof run.status === 'string' && Array.isArray(run.messages)) next[run.runId] = run;
          return next;
        });
      } catch { /* Durable project polling remains available during a reconnect. */ }
    });
    return () => events.close();
  }, [expired, path, refresh]);

  async function cancelJob(job: Job) {
    if (cancelling || job.cancel_requested || busy) return;
    setCancelling(job.id);
    try {
      const result = await api('jobs/' + job.id + '/cancel', 'POST', {});
      setJobs(previous => previous.map(item => item.id === job.id ? result.data : item));
    } catch { setError(c.error); }
    finally { setCancelling(null); }
  }

  function change(next: StudioDocument) {
    const previous = latest.current;
    if (previous && activeFileRef.current !== 'index.html') next = replaceStudioFile({ ...next, html: previous.html }, activeFileRef.current, next.html);
    if (previous) setUndo(items => [...items.slice(-49), previous]);
    latest.current = next; setDocument(next); setRedo([]); setError('');
  }
  function patch(value: ManualEditPatch) {
    if (!latest.current) return;
    const result = applyManualEditPatch(studioFileSource(latest.current, activeFileRef.current), value);
    if (!result.ok) { setError(c.error); return; }
    if (result.source !== studioFileSource(latest.current, activeFileRef.current)) change({ ...latest.current, html: result.source });
  }
  function pick(target: ManualEditTarget) {
    setSelected(target); setDraft({ ...emptyManualEditDraft(latest.current ? studioFileSource(latest.current, activeFileRef.current) : undefined), ...target.fields,
      text: target.fields.text ?? target.text, href: target.fields.href ?? '', src: target.fields.src ?? '', alt: target.fields.alt ?? '',
      styles: target.styles, outerHtml: target.outerHtml, attributesText: JSON.stringify(target.attributes, null, 2) });
    frame.current?.contentWindow?.postMessage({ type: 'od-edit-selected-target', id: target.id }, '*');
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const data = event.data;
      if (data.type === 'semurai:comment-position' && data.id === markersState.current.selected) {
        const bounds = body.current?.getBoundingClientRect(); const rect = frame.current?.getBoundingClientRect();
        if (bounds && rect && Number.isFinite(data.x) && Number.isFinite(data.y)) {
          const scale = rect.width / (frame.current?.clientWidth || rect.width);
          setCommentPoint(data.visible ? { x: Math.max(8, Math.min(bounds.width - Math.min(360, bounds.width - 16) - 8, rect.left - bounds.left + data.x * scale + 18)), y: Math.max(8, Math.min(bounds.height - 220, rect.top - bounds.top + data.y * scale + 24)) } : null);
        }
      }
      if (data.type === 'semurai:comment-markers-ready') syncMarkers();
      if (data.type === 'semurai:comment-open' && typeof data.id === 'string') {
        const item = commentsRef.current.find(comment => comment.id === data.id && comment.target.file === activeFileRef.current);
        if (item) { setMode('preview'); setReview('element'); setShowHistory(false); setShowExports(false); selectReview(item.target, item.id); }
      }
      if (reviewState.current.review && (data.type === 'od:comment-target' || data.type === 'od:comment-active-target-update')) {
        if (data.type === 'od:comment-target') setActiveCommentId(null);
        const target = readReviewTarget(data, activeFileRef.current, reviewState.current.version);
        if (target) { setReviewTarget(previous => data.type === 'od:comment-active-target-update' && previous ? { ...previous, position: target.position } : target); if (data.type === 'od:comment-target') frame.current?.contentWindow?.postMessage({ type: 'od:comment-active-target', elementId: target.elementId, selector: target.selector }, '*'); }
      }
      if (data.type === 'od:comment-targets' && Array.isArray(data.targets)) reviewTargets.current = data.targets.slice(0, 1000).map((value: unknown) => readReviewTarget(value, activeFileRef.current, reviewState.current.version)).filter((value: ReviewTarget | null): value is ReviewTarget => !!value);
      if (data.type === 'od-edit-targets'  && Array.isArray(data.targets)) setTargets(data.targets.slice(0, 1000));
      if (data.type === 'od-edit-select' && data.target && typeof data.target.id === 'string') pick(data.target);
      if (data.type === 'od-edit-background') setSelected(null);
      if (data.type === 'od-edit-text-commit' && typeof data.id === 'string' && typeof data.value === 'string') patch({ kind: 'set-text', id: data.id, value: data.value });
      if (data.type === 'od-edit-drag-commit' && typeof data.id === 'string' && typeof data.transform === 'string') patch({ kind: 'set-style', id: data.id, styles: { transform: data.transform, ...(data.display ? { display: data.display } : {}) } });
      if (data.type === 'od:slide-state' && Number.isInteger(data.active) && data.active >= 0 && data.active < count) setSlide(data.active);
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [count]);
  // Deck navigation uses the upstream message protocol; rebuilding srcdoc on
  // every reported slide would reset the runtime and undo the user's navigation.
  const srcdoc = useMemo(() => document && (!video || videoRuntime) ? studioPreviewSource(visibleHtml, slide, mode === 'edit', deck, false, true, video ? videoRuntime : undefined) : '', [visibleHtml, mode, deck, video, videoRuntime]);
  function seekVideo(time: number) {
    videoTimeRef.current = time; setVideoTime(time);
    frame.current?.contentWindow?.postMessage({ type: 'semurai:video', time }, '*');
  }
  function navigateSlide(index: number) {
    setSlide(index);
    frame.current?.contentWindow?.postMessage({ type: 'od:slide', action: 'go', index }, '*');
  }
  const thumbnail = useCallback((index: number) => studioPreviewSource(visibleHtml || '', index, false, true), [visibleHtml]);
  async function saveCurrent(): Promise<SavedSource | null> {
    const current = latest.current;
    if (!current || JSON.stringify(current) === JSON.stringify(baseline.current?.document)) return baseline.current;
    renderSave.current = video;
    try {
      if (video) {
        const source = JSON.stringify(current);
        if (renderKey.current?.source !== source) renderKey.current = { source, key: crypto.randomUUID() };
        const result = await api('jobs', 'POST', { operation: 'render', document: current, brief: v.save, quality: 'standard',
          use_media_library: false, base_version: baseline.current?.version ?? 0, base_revision: baseline.current?.document_hash ?? null, idempotency_key: renderKey.current.key });
        setJobs(previous => [result.data, ...previous.filter(job => job.id !== result.data.id)]);
        let job = result.data as Job;
        while (!terminal.has(job.status)) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          job = (await api('jobs/' + job.id)).data;
          setJobs(previous => previous.map(item => item.id === job.id ? job : item));
        }
        if (job.status !== 'completed') { renderKey.current = null; throw new Error(job.status === 'conflicted' ? c.conflict : c.error); }
        renderKey.current = null;
      } else await api('document', 'PUT', { base_version: baseline.current?.version ?? 0, base_revision: baseline.current?.document_hash ?? null, document: current });
      const value = (await api('document')).data as SavedSource;
      baseline.current = value; setSaved(value);
      if (latest.current === current) { latest.current = value.document; setDocument(value.document); }
      setVersions((await api('versions')).data);
      return value;
    } finally { renderSave.current = false; }
  }
  async function action(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : c.error); } finally { setBusy(false); } }
  async function send() {
    if (!prompt.trim() || active || busy || mediaBusy) return;
    await action(async () => {
      const current = await saveCurrent(); requestKey.current ??= crypto.randomUUID();
      await api('jobs', 'POST', { operation: current ? 'edit' : 'generate', edit_mode: 'patch', quality: 'standard',
        brief: aiTarget ? reviewBrief(aiTarget, prompt) : `Edit the file ${activeFileRef.current} within this project. Preserve other files.\n` + prompt.trim(), reference_ids: images.map(item => item.id), use_media_library: useLibrary, base_version: current?.version ?? 0, base_revision: current?.document_hash ?? null, idempotency_key: requestKey.current });
      requestKey.current = null; setPrompt(''); setAiTarget(null); setImages([]); await refresh();
    });
  }
  function travel(direction: 'undo' | 'redo') {
    const items = direction === 'undo' ? undo : redo; const next = items.at(-1); if (!next || !latest.current) return;
    const previous = latest.current;
    if (direction === 'undo') { setUndo(items.slice(0, -1)); setRedo(values => [...values, previous]); }
    else { setRedo(items.slice(0, -1)); setUndo(values => [...values, previous]); }
    latest.current = next; setDocument(next); setSelected(null);
  }
  function slideAction(operation: SlideOperation) {
    if (!latest.current) return;
    const result = changeSlide(studioFileSource(latest.current, activeFileRef.current), latest.current.notes, slide, operation);
    if (result) { change({ ...latest.current, html: result.html, notes: result.notes }); setSlide(result.active); setSelected(null); }
  }
  async function saveDraft() {
    if (!selected) { await action(async () => { await saveCurrent(); }); return; }
    if (selected.kind === 'text') patch({ kind: 'set-text', id: selected.id, value: draft.text });
    if (selected.kind === 'link') patch({ kind: 'set-link', id: selected.id, text: draft.text, href: draft.href });
    if (selected.kind === 'image') patch({ kind: 'set-image', id: selected.id, src: draft.src, alt: draft.alt });
    patch({ kind: 'set-style', id: selected.id, styles: draft.styles });
    await action(async () => { await saveCurrent(); });
  }
  async function exportFile(format: 'html' | 'pptx') {
    if (format === 'html' && expired && latest.current) {
      downloadStudioFile(studioFileSource(latest.current, activeFileRef.current), 'text/html;charset=utf-8', context.project.title, '.html');
      return;
    }
    await action(async () => {
      const snapshot = await saveCurrent();
      if (!snapshot) return;
      const b64 = format === 'pptx' ? await exportStudioDocument(studioFileSource(snapshot.document, activeFileRef.current), true, 'pptx', path, context.project.title, snapshot.document.notes) : undefined;
      if (format === 'pptx' && !b64) throw new Error(c.error);
      const content = b64 ? Uint8Array.from(atob(b64), character => character.charCodeAt(0)) : studioFileSource(snapshot.document, activeFileRef.current);
      const mime = format === 'html' ? 'text/html;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      try {
        await api('exports', 'POST', { format, source_file: activeFileRef.current, base_version: snapshot.version, base_revision: snapshot.document_hash, ...(b64 ? { file_base64: b64 } : {}) });
        setExports((await api('exports')).data);
      } catch {
        downloadStudioFile(content, mime, context.project.title, '.' + format);
        throw new Error(c.exportSaveFailed);
      }
      downloadStudioFile(content, mime, context.project.title, '.' + format);
    });
  }
  async function downloadVideo() {
    await action(async () => {
      const snapshot = await saveCurrent();
      if (!snapshot) return;
      const result = (await api('video')).data;
      if (result.version !== snapshot.version) throw new Error(c.conflict);
      const bytes = Uint8Array.from(atob(result.file_base64), character => character.charCodeAt(0));
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== result.sha256) throw new Error(c.error);
      downloadStudioFile(bytes, 'video/mp4', context.project.title, '.mp4');
    });
  }
  async function downloadExport(file: ProjectExport) {
    await action(async () => {
      const result = (await api('exports/' + file.id + '/download')).data;
      const bytes = Uint8Array.from(atob(result.file_base64), character => character.charCodeAt(0));
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== file.sha256) throw new Error(c.error);
      downloadStudioFile(bytes, file.mime_type, file.title + '-v' + file.version, '.' + file.format);
    });
  }
  async function pickImage(file: File): Promise<string | null> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6_000_000) { setError(c.error); return null; }
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      return ((await api('media/upload', 'POST', { image_data: data, title: file.name })).data as StudioImage).dataUrl;
    } catch { setError(c.error); return null; }
  }

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const input = event.target instanceof HTMLElement && !!event.target.closest('input,textarea,select,[contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (!busy && !expired) void action(async () => { await saveCurrent(); }); }
      if (!input && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (!busy) travel(event.shiftKey ? 'redo' : 'undo'); }
      if (event.key === 'Escape' && !input) { setReview(null); setReviewTarget(null); setShowLayers(false); setShowHistory(false); setShowExports(false); setMode('preview'); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [busy, expired, undo, redo]);

  return <main style={{ '--chat-width': `${chatWidth}px` } as CSSProperties} className={styles.editor + (chatCollapsed ? ' ' + styles.chatCollapsed : '') + (resizing ? ' ' + styles.resizing : '')} data-testid="semurai-studio-editor">
    {imagePicker && <StudioImagePicker initialSource={imagePicker.initialSource} target={imagePicker.target} locale={context.project.uiLocale} api={api} onClose={() => setImagePicker(null)} onApply={(image, alt, placement) => {
      if (!latest.current || studioFileSource(latest.current, activeFileRef.current) !== imagePicker.source) return false;
      const html = placeStudioImage(studioFileSource(latest.current, activeFileRef.current), { dataUrl: image.dataUrl, alt }, placement, context.project.artifactType === 'email', imagePicker.target?.id);
      if (!html) return false;
      change({ ...latest.current, html }); setSelected(null); setImagePicker(null); return true;
    }} />}
    {presentation && <StudioPresenter source={presentation.document.html} notes={presentation.document.notes} initialSlide={presentation.slide} locale={context.project.uiLocale} onClose={index => { setPresentation(null); navigateSlide(Math.min(index, Math.max(0, count - 1))); }} />}
    <aside id="studio-chat" className={styles.chat + (showChat ? ' ' + styles.chatVisible : '')}>
      <header className={styles.chatHeader}><a href={safeStudioReturn(context)!} title={c.back}><ArrowLeft size={17} /></a><strong>{context.project.title}</strong><button className={styles.mobileChatToggle} onClick={() => setShowChat(false)} title={c.close}><X size={16} /></button><Button className={styles.collapseChat} title={c.chat} onClick={() => setChatCollapsed(true)}><PanelLeftClose size={16} /></Button><button disabled={busy} onClick={() => { if (dirty) void action(async () => { await saveCurrent(); onClose(); }); else onClose(); }} title={c.close}><X size={16} /></button></header>
      <nav className={styles.panelTabs} aria-label="Studio tools">
        <button aria-pressed={!review && mode !== 'edit'} onClick={() => { setReview(null); setMode('preview'); setActiveCommentId(null); }}><Sparkles size={15} />AI {c.chat}</button>
        <button aria-pressed={!!review} onClick={() => { setMode('preview'); setReview('element'); }}><MessageSquare size={15} />{r.comments}<span>{fileComments.filter(item => !item.resolved).length}</span></button>
        <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}><Pencil size={15} />{c.edit}</button>
      </nav>
      {!review && mode !== 'edit' && <><div className={styles.conversation} ref={chatLog} role="log" onScroll={event => { const element = event.currentTarget; followChat.current = element.scrollHeight - element.scrollTop - element.clientHeight < 160; }}><div className={styles.brand}><Sparkles size={20} /><span>{c.newProject}</span></div>
        {!jobs.length && <div className={styles.welcome}><h2>{c.empty}</h2><p>{c.emptyHelp}</p></div>}
        {[...jobs].reverse().map(job => <StudioChatTurn key={job.id} job={job} live={job.run_id ? liveMessages[job.run_id] : undefined} cancelling={cancelling === job.id} busy={busy} copy={c} onAnswer={job.id === jobs[0]?.id && !active ? text => { setPrompt(text); } : undefined} onCancel={() => { void cancelJob(job); }} onRetry={() => { void action(async () => { await api('jobs/' + job.id + '/retry', 'POST', {}); await refresh(); }); }} />)}
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}><StudioMedia images={images} onChange={value => { setImages(value); requestKey.current = null; }} useLibrary={useLibrary} onLibrary={value => { setUseLibrary(value); requestKey.current = null; }} api={api} locale={context.project.uiLocale} disabled={busy || !!active} onBusy={setMediaBusy} compact /><textarea ref={promptInput} aria-label={c.ask} placeholder={c.ask} value={prompt} onChange={event => { setPrompt(event.target.value); requestKey.current = null; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />{aiTarget && <div className={styles.aiTarget}><MousePointer2 size={14} /><span title={aiTarget.text}>{aiTarget.file} · {aiTarget.label}</span><Button title={r.remove} onClick={() => { setAiTarget(null); requestKey.current = null; }}><X size={13} /></Button></div>}<div className={styles.composerFooter}><span>{c.chat}</span><Button type="submit" title={c.send} disabled={busy || mediaBusy || !!active || !prompt.trim()}><ArrowUp size={18} /></Button></div></form><p className={styles.chatHint}>{c.allChanges}</p></>}
        {review && <StudioReview comments={comments} onCommentsChange={setComments} resolved={showResolved} onResolvedChange={setShowResolved} activeCommentId={activeCommentId} locale={context.project.uiLocale} file={activeFile} version={saved?.version ?? 0} target={reviewTarget} disabled={busy || expired} api={api} onAsk={askSelection} onSelect={selectReview} onClose={() => { setReview(null); setReviewTarget(null); }} />}
        {showLayers && mode === 'edit' && <aside className={styles.layers}>{targets.map(target => <button key={target.id} className={selected?.id === target.id ? styles.active : ''} onClick={() => pick(target)}><span>{target.tagName}</span>{target.label || target.text.slice(0, 45)}</button>)}</aside>}
        {mode === 'edit' && <div className={styles.inspector}><div className={styles.inspectorModes} role="group" aria-label="Inspector modes">{(['simple', 'pro', 'code'] as const).map(value => <button key={value} aria-pressed={inspectorMode === value} onClick={() => setInspectorMode(value)}>{value === 'simple' ? 'Simple' : value === 'pro' ? 'Pro' : 'Code'}</button>)}</div>{inspectorMode === 'pro' ? <ManualEditPanel targets={targets} selectedTarget={selected} draft={draft} history={[]} error={null} canUndo={!!undo.length} canRedo={!!redo.length} busy={busy} onSelectTarget={pick} onDraftChange={setDraft} onStyleChange={(id, values) => patch({ kind: 'set-style', id, styles: values })} onApplyPatch={patch} onPickImage={pickImage} onError={setError} onClearSelection={() => setSelected(null)} onCancelDraft={() => selected && pick(selected)} onSaveDraft={() => { void saveDraft(); }} onResetDraft={() => selected && pick(selected)} onUndo={() => travel('undo')} onRedo={() => travel('redo')} onExit={() => setMode('preview')} /> : <StudioInspector mode={inspectorMode} selected={selected} draft={draft} onDraft={setDraft} patch={patch} locale={context.project.uiLocale} disabled={busy || expired} />}</div>}
    </aside>
    <div className={styles.resizeHandle} role="separator" aria-orientation="vertical" aria-label={r.resize} aria-controls="studio-chat" aria-valuemin={280} aria-valuemax={640} aria-valuenow={Math.round(chatWidth)} tabIndex={0}
      onDoubleClick={() => setChatWidth(390)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setChatWidth(value => Math.max(280, Math.min(640, value + (event.key === 'ArrowLeft' ? -20 : 20)))); } }}
      onPointerDown={event => { if (event.button !== 0) return; resizeStart.current = { x: event.clientX, width: chatWidth }; setResizing(true); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setChatWidth(Math.max(280, Math.min(640, window.innerWidth - 480, resizeStart.current.width + event.clientX - resizeStart.current.x))); }}
      onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false); }} onLostPointerCapture={() => setResizing(false)} />
    <section className={styles.workspace}>
      <header className={styles.header}>{chatCollapsed && <Button title={c.chat} onClick={() => setChatCollapsed(false)}><PanelLeftOpen size={16} /></Button>}<Button className={styles.mobileChatToggle} title={c.chat} onClick={() => setShowChat(true)}><MessageSquare size={16} /></Button><details className={styles.fileMenu}><summary><Code2 size={15} /><span>{activeFile}<small>{1 + (document?.files?.length ?? 0)} {c.files}</small></span><ChevronDown size={13} /></summary><nav aria-label={c.files}>{['index.html', ...(document?.files ?? []).map(file => file.path)].map(file => <button key={file} aria-current={activeFile === file ? 'page' : undefined} onClick={event => { selectFile(file); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Code2 size={16} /><span>{file}</span>{file === activeFile && <Check size={14} />}</button>)}</nav></details><span className={styles.saveState}>{dirty ? c.unsaved : <><Check size={13} />{c.saved}</>}</span><button title={c.history} onClick={() => { setShowHistory(!showHistory); setShowExports(false); setReview(null); }}><History size={17} /></button><Button disabled={!dirty || busy || expired || !!active} onClick={() => { void action(async () => { await saveCurrent(); }); }}>{video ? v.save : c.save}</Button><details className={styles.exportMenu}><summary><Download size={15} />{c.export}</summary><div>{video && <Button disabled={!document || busy || expired || !!active} onClick={() => { void downloadVideo(); }}>MP4</Button>}<Button disabled={!document || busy} onClick={() => { void exportFile('html'); }}>{c.downloadHtml}</Button>{deck && <Button disabled={!document || busy} onClick={() => { void exportFile('pptx'); }}>{c.downloadPptx}</Button>}<Button disabled={!document || busy} onClick={() => { if (document) void action(async () => { await exportStudioDocument(visibleHtml, deck, 'print', path, context.project.title); }); }}>{c.print}</Button><Button onClick={() => { setShowExports(!showExports); setShowHistory(false); setReview(null); }}>{c.exportHistory}</Button></div></details></header>
      <div className={styles.toolbar}><div className={styles.segment}><button className={mode !== 'source' ? styles.active : ''} onClick={() => setMode('preview')}><Eye size={15} />{c.preview}</button><button className={mode === 'source' ? styles.active : ''} onClick={() => setMode('source')}><Code2 size={15} />{c.source}</button></div><div className={styles.devices} role="group" aria-label={c.preview}>{[[0, c.desktop, Monitor], [768, c.tablet, Tablet], [390, c.mobile, Smartphone]].map(([width, label, DeviceIcon]) => { const Icon = DeviceIcon as typeof Monitor; return <Button key={String(width)} title={String(label)} aria-label={String(label)} aria-pressed={device === width} onClick={() => setDevice(Number(width))}><Icon size={16} /><span>{String(label)}</span></Button>; })}</div><div className={styles.spacer} />{!deck && <StudioImageMenu locale={context.project.uiLocale} disabled={!document || busy || expired} onSelect={initialSource => { if (document) setImagePicker({ source: visibleHtml, target: mode === 'edit' ? selected : null, initialSource }); }} />}<button disabled={!undo.length} title={c.undo} onClick={() => travel('undo')}><RotateCcw size={16} /></button><button disabled={!redo.length} title={c.redo} onClick={() => travel('redo')}><RotateCw size={16} /></button><Button aria-pressed={review === 'element'} title={r.select} disabled={!document || mode === 'source'} onClick={() => { setMode('preview'); setReview(review === 'element' ? null : 'element'); setShowHistory(false); setShowExports(false); }}><MousePointer2 size={16} /></Button><Button aria-pressed={review === 'area'} title={r.area} disabled={!document || mode === 'source'} onClick={() => { setMode('preview'); setReview(review === 'area' ? null : 'area'); setShowHistory(false); setShowExports(false); }}><Scan size={16} /></Button><Button aria-pressed={!!review} title={r.comments} aria-label={`${r.comments} (${fileComments.length})`} disabled={!document} onClick={() => { setMode('preview'); setReview(review ? null : 'element'); setShowHistory(false); setShowExports(false); }}><MessageSquare size={16} /><span className={styles.commentCount} aria-hidden="true">{fileComments.length}</span></Button><button className={showLayers ? styles.active : ''} title={c.layers} onClick={() => { setShowLayers(!showLayers); setMode('edit'); }}><Layers size={16} /></button><button className={mode === 'edit' ? styles.active : ''} onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}><Pencil size={15} />{c.edit}</button><button title={deck ? c.present : c.fullscreen} disabled={!document || (deck && count === 0)} onClick={() => { if (deck && document) setPresentation({ document, slide }); else void viewport.current?.requestFullscreen(); }}><Maximize2 size={16} /></button><select value={zoom} aria-label={c.zoom} onChange={event => setZoom(Number(event.target.value))}>{[50, 75, 100, 125, 150].map(value => <option key={value} value={value}>{value}%</option>)}</select></div>

      {video && document && mode !== 'source' && <div className={styles.videoControls}>
        <Button disabled={!videoRuntime || mode === 'edit'} onClick={() => { videoTimeRef.current = videoTime; frame.current?.contentWindow?.postMessage({ type: 'semurai:video', play: !videoPlaying }, '*'); }}>{videoPlaying ? v.pause : v.play}</Button>
        <input type="range" aria-label={v.time} min={0} max={videoDuration || 60} step={1 / 30} value={videoTime} onChange={event => seekVideo(Number(event.target.value))} />
        <output>{videoTime.toFixed(1)} / {videoDuration.toFixed(1)} s</output>
        {busy && renderSave.current && <span role="status">{v.rendering}</span>}
      </div>}
      {expired && <div className={styles.error} role="alert">{c.expired}<a href={safeStudioReturn(context)!} target="_blank" rel="noopener noreferrer">{c.back}</a></div>}
      {error && <div className={styles.error} role="alert">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
      <div ref={body} className={styles.body}>
        {deck && count > 0 && mode !== 'source' && <aside className={styles.slides}><div className={styles.slideTools}><Button title={c.duplicateSlide} disabled={count >= 60} onClick={() => slideAction('duplicate')}><Copy size={14} /></Button><Button title={c.removeSlide} disabled={count <= 1} onClick={() => slideAction('remove')}><Trash2 size={14} /></Button><Button title={c.moveUp} disabled={slide === 0} onClick={() => slideAction('before')}><ChevronUp size={14} /></Button><Button title={c.moveDown} disabled={slide >= count - 1} onClick={() => slideAction('after')}><ChevronDown size={14} /></Button></div><DeckThumbnailRail count={count} activeIndex={Math.min(slide, count - 1)} labelTotal={count} buildThumbSrcDoc={thumbnail} onSelect={navigateSlide} previewViewport={{ width: 1920, height: 1080 }} /></aside>}

        <div className={styles.stage} onScroll={syncMarkers}>
          {loading ? <div className={styles.empty}>{c.loading}</div> : !document ? <div className={styles.empty}><Sparkles size={32} /><h2>{c.empty}</h2><p>{c.emptyHelp}</p></div> : mode === 'source' ? <div className={styles.sourceEditor}><div className={styles.sourceTabs}><Button onClick={() => setSourceTab('html')} aria-pressed={sourceTab === 'html'}>{activeFile}</Button><Button onClick={() => setSourceTab('css')} aria-pressed={sourceTab === 'css'}>{c.css}</Button>{sourceTab === 'css' && sheets.length > 1 && <select aria-label={c.css} value={Math.min(sheet, sheets.length - 1)} onChange={event => setSheet(Number(event.target.value))}>{sheets.map((_, index) => <option key={index} value={index}>CSS {index + 1}</option>)}</select>}</div><textarea className={styles.code} aria-label={sourceTab === 'html' ? c.savedSource : c.css} spellCheck={false} value={sourceTab === 'html' ? visibleHtml : sheets[Math.min(sheet, Math.max(0, sheets.length - 1))] ?? ''} onKeyDown={event => { if (event.key !== 'Tab') return; event.preventDefault(); const input = event.currentTarget; const start = input.selectionStart; const end = input.selectionEnd; const value = input.value.slice(0, start) + '  ' + input.value.slice(end); change({ ...document, html: sourceTab === 'html' ? value : replaceStyleBlock(visibleHtml, Math.min(sheet, Math.max(0, sheets.length - 1)), value) }); requestAnimationFrame(() => { input.selectionStart = input.selectionEnd = start + 2; }); }} onChange={event => change({ ...document, html: sourceTab === 'html' ? event.target.value : replaceStyleBlock(visibleHtml, Math.min(sheet, Math.max(0, sheets.length - 1)), event.target.value) })} /></div> : <div ref={viewport} className={styles.viewport} style={{ width: device || '100%', minWidth: device || undefined, zoom: zoom / 100 }}>{review && reviewTarget?.position && !areaBox && <div className={styles.selectionBox} style={{ left: reviewTarget.position.x, top: reviewTarget.position.y, width: reviewTarget.position.width, height: reviewTarget.position.height }} />}
            {review === 'area' && <div className={styles.areaOverlay} aria-label={r.area} onPointerDown={event => { if (event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); const x = (event.clientX - rect.left) / (zoom / 100); const y = (event.clientY - rect.top) / (zoom / 100); areaStart.current = { x, y }; setAreaBox({ x, y, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!areaStart.current) return; const rect = event.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left)) / (zoom / 100); const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top)) / (zoom / 100); setAreaBox({ x: Math.min(x, areaStart.current.x), y: Math.min(y, areaStart.current.y), width: Math.abs(x - areaStart.current.x), height: Math.abs(y - areaStart.current.y) }); }} onPointerUp={event => {
              areaStart.current = null; event.currentTarget.releasePointerCapture(event.pointerId);
              if (areaBox && areaBox.width > 5 && areaBox.height > 5) {
                const hits = reviewTargets.current.filter(target => { const p = target.position; return p && p.x < areaBox.x + areaBox.width && p.y < areaBox.y + areaBox.height && p.x + p.width > areaBox.x && p.y + p.height > areaBox.y; }).sort((a, b) => a.position!.width * a.position!.height - b.position!.width * b.position!.height).slice(0, 8);
                setReviewTarget({ file: activeFile, version: saved?.version ?? 0, label: r.area, selector: hits.map(target => target.selector).join(', ').slice(0, 1000) || 'body', text: hits.map(target => target.text).join(' · ').slice(0, 500), position: areaBox, ...(deck ? { slideIndex: slide } : {}) });
              }
              setAreaBox(undefined);
            }} onPointerCancel={() => { areaStart.current = null; setAreaBox(undefined); }}>{areaBox && <div className={styles.selectionBox} style={{ left: areaBox.x, top: areaBox.y, width: areaBox.width, height: areaBox.height }} />}</div>}
            <iframe ref={frame} title={c.preview} sandbox="allow-scripts allow-modals" srcDoc={srcdoc} onLoad={() => { frame.current?.contentWindow?.postMessage({ type: 'od-edit-mode', enabled: mode === 'edit' }, '*'); if (video) seekVideo(videoTimeRef.current); setFrameReady(value => value + 1); }} /></div>}
          {deck && document && mode !== 'source' && <label className={styles.notes}><span>{c.notes} · {slide + 1}/{count}</span><textarea value={document.notes?.[slide] ?? ''} placeholder={c.notes} onChange={event => { const notes = Array.from({ length: count }, (_, index) => document.notes?.[index] ?? ''); notes[slide] = event.target.value; change({ ...document, notes }); }} /></label>}
        </div>
        {review && focusedComment && commentPoint && <section className={styles.commentPopover} data-testid="studio-comment-popover" aria-label={r.comments} style={{ left: commentPoint.x, top: commentPoint.y, maxHeight: `min(520px, 55vh, calc(100% - ${commentPoint.y + 8}px))` }}>
          <header><strong>{focusedComment.target.label}</strong><Button title={c.close} onClick={() => { setActiveCommentId(null); setCommentPoint(null); }}><X size={15} /></Button></header>
          <StudioCommentThread key={focusedComment.id} comment={focusedComment} locale={context.project.uiLocale} disabled={busy || expired} api={api} onChange={setComments} onAsk={text => askSelection(focusedComment.target, text)} />
        </section>}
        {showHistory && <aside className={styles.history}><h3>{c.history}</h3>{versions.map(version => <div key={version.id}><strong>{c.version} {version.version}</strong><small>{new Date(version.created_at).toLocaleString(context.project.uiLocale)}</small><Button disabled={busy || version.version === saved?.version || dirty} onClick={() => { void action(async () => { await api('versions/' + version.id + '/restore', 'POST', { base_version: saved?.version, base_revision: saved?.document_hash }); await refresh(true); }); }}>{c.restore}</Button></div>)}</aside>}
        {showExports && <aside className={styles.history}><h3>{c.exportHistory}</h3>{!exports.length && <p>{c.noExports}</p>}{exports.map(file => <div key={file.id}><strong>{file.format.toUpperCase()} · {c.version} {file.version}</strong><small>{new Date(file.created_at).toLocaleString(context.project.uiLocale)} · {Math.max(1, Math.round(file.size / 1024))} KB</small><Button disabled={busy} onClick={() => { void downloadExport(file); }}><Download size={14} />{c.downloadAgain}</Button></div>)}</aside>}
      </div>
      <footer className={styles.footer}><span>{context.project.locale.toUpperCase()} · {context.project.artifactType}</span><span>{saved ? c.version + ' ' + saved.version : 'Semurai Creative'}</span></footer>
    </section>
  </main>;
}
