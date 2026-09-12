'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Code2, Copy, Download, Eye, History, Layers, Maximize2, MessageSquare, Pencil, RotateCcw, RotateCw, Sparkles, Trash2, X } from 'lucide-react';
import { DeckThumbnailRail } from '../components/DeckThumbnailRail';
import { ManualEditPanel, emptyManualEditDraft, type ManualEditDraft } from '../components/ManualEditPanel';
import { applyManualEditPatch } from '../edit-mode/source-patches';
import type { ManualEditPatch, ManualEditTarget } from '../edit-mode/types';
import { safeStudioReturn, studioSessionPath, type StudioContext } from './studio-context';
import { studioPreviewSource, studioSlideCount } from './studio-preview';
import { studioEditorCopy } from './studio-editor-copy';
import { changeSlide, replaceStyleBlock, styleBlocks, type SlideOperation } from './studio-source';
import { downloadStudioFile, exportStudioDocument } from './studio-export';
import { renderMarkdown } from '../runtime/markdown';
import { StudioMedia, type StudioImage } from './StudioMedia';
import styles from './StudioEditor.module.css';

interface StudioDocument { version: 1; kind: string; name: string; html: string; notes: (string | null)[]; brandContextHash?: string }
interface SavedSource { id: string; version: number; document: StudioDocument; document_hash: string }
interface Job { assistant_message?: string; references?: { id: string; title: string; thumbnail?: string }[]; id: string; brief: string; status: string; retryable: boolean; base_version: number }
interface Version { id: string; version: number; kind: string; created_at: string }
interface ProjectExport { id: string; format: 'html' | 'pptx'; version: number; title: string; created_at: string; mime_type: string; size: number; sha256: string }
const terminal = new Set(['completed', 'failed', 'cancelled', 'conflicted']);

export function StudioEditor({ context, expired = false, onClose }: { context: StudioContext; expired?: boolean; onClose: () => void }) {
  const c = studioEditorCopy[context.project.uiLocale];
  const path = studioSessionPath(window.location.pathname)!;
  const deck = context.project.artifactType === 'presentation';
  const frame = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const latest = useRef<StudioDocument | null>(null);
  const baseline = useRef<SavedSource | null>(null);
  const [document, setDocument] = useState<StudioDocument | null>(null);
  const [saved, setSaved] = useState<SavedSource | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [exports, setExports] = useState<ProjectExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<StudioImage[]>([]);
  const [useLibrary, setUseLibrary] = useState(true);
  const [mediaBusy, setMediaBusy] = useState(false);
  const chatLog = useRef<HTMLDivElement>(null);
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
  const count = useMemo(() => document && deck ? studioSlideCount(document.html) : 0, [document?.html, deck]);
  const sheets = useMemo(() => document ? styleBlocks(document.html) : [], [document?.html]);

  const api = useCallback(async (endpoint: string, method = 'GET', body?: unknown) => {
    const response = await fetch(path + 'project/' + endpoint, { method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Creative-Action': 'project' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 401 ? c.expired : response.status === 409 ? c.conflict : c.error);
    return response.json();
  }, [path, c]);

  function adopt(value: SavedSource | null) {
    baseline.current = value; latest.current = value?.document ?? null;
    setSaved(value); setDocument(value?.document ?? null); setUndo([]); setRedo([]); setSelected(null);
  }
  const refresh = useCallback(async (initial = false) => {
    const [source, jobList, history, files] = await Promise.all([api('document'), api('jobs'), api('versions'), api('exports')]);
    setJobs(jobList.data); setVersions(history.data);
    setExports(files.data);
    const next = source.data as SavedSource | null;
    if (initial || JSON.stringify(latest.current) === JSON.stringify(baseline.current?.document ?? null)) adopt(next);
    else if (next?.version !== baseline.current?.version) setError(c.conflict);
  }, [api, c]);
  useEffect(() => { let live = true; void refresh(true).catch(() => { if (live) setError(c.error); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [refresh, c]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const tick = async () => { try { await refresh(); } catch { if (!cancelled) setError(c.error); } finally { if (!cancelled) timer = setTimeout(() => { void tick(); }, 2500); } };
    timer = setTimeout(() => { void tick(); }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active?.id, refresh, c]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  useEffect(() => { const element = chatLog.current; if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 300) element.scrollTop = element.scrollHeight; }, [jobs]);

  function change(next: StudioDocument) {
    const previous = latest.current;
    if (previous) setUndo(items => [...items.slice(-49), previous]);
    latest.current = next; setDocument(next); setRedo([]); setError('');
  }
  function patch(value: ManualEditPatch) {
    if (!latest.current) return;
    const result = applyManualEditPatch(latest.current.html, value);
    if (!result.ok) { setError(c.error); return; }
    if (result.source !== latest.current.html) change({ ...latest.current, html: result.source });
  }
  function pick(target: ManualEditTarget) {
    setSelected(target); setDraft({ ...emptyManualEditDraft(latest.current?.html), ...target.fields,
      text: target.fields.text ?? target.text, href: target.fields.href ?? '', src: target.fields.src ?? '', alt: target.fields.alt ?? '',
      styles: target.styles, outerHtml: target.outerHtml, attributesText: JSON.stringify(target.attributes, null, 2) });
    frame.current?.contentWindow?.postMessage({ type: 'od-edit-selected-target', id: target.id }, '*');
  }
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const data = event.data;
      if (data.type === 'od-edit-targets' && Array.isArray(data.targets)) setTargets(data.targets.slice(0, 1000));
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
  const srcdoc = useMemo(() => document ? studioPreviewSource(document.html, slide, mode === 'edit', deck) : '', [document?.html, mode, deck]);
  function navigateSlide(index: number) {
    setSlide(index);
    frame.current?.contentWindow?.postMessage({ type: 'od:slide', action: 'go', index }, '*');
  }
  const thumbnail = useCallback((index: number) => studioPreviewSource(document?.html ?? '', index, false, true), [document?.html]);
  async function saveCurrent(): Promise<SavedSource | null> {
    const current = latest.current;
    if (!current || JSON.stringify(current) === JSON.stringify(baseline.current?.document)) return baseline.current;
    await api('document', 'PUT', { base_version: baseline.current?.version ?? 0, base_revision: baseline.current?.document_hash ?? null, document: current });
    const value = (await api('document')).data as SavedSource;
    baseline.current = value; setSaved(value);
    if (latest.current === current) { latest.current = value.document; setDocument(value.document); }
    setVersions((await api('versions')).data);
    return value;
  }
  async function action(work: () => Promise<void>) { setBusy(true); setError(''); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : c.error); } finally { setBusy(false); } }
  async function send() {
    if (!prompt.trim() || active || busy || mediaBusy) return;
    await action(async () => {
      const current = await saveCurrent(); requestKey.current ??= crypto.randomUUID();
      await api('jobs', 'POST', { operation: current ? 'edit' : 'generate', edit_mode: 'patch', quality: 'standard',
        brief: prompt.trim(), reference_ids: images.map(item => item.id), use_media_library: useLibrary, base_version: current?.version ?? 0, base_revision: current?.document_hash ?? null, idempotency_key: requestKey.current });
      requestKey.current = null; setPrompt(''); setImages([]); await refresh();
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
    const result = changeSlide(latest.current.html, latest.current.notes, slide, operation);
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
      downloadStudioFile(latest.current.html, 'text/html;charset=utf-8', context.project.title, '.html');
      return;
    }
    await action(async () => {
      const snapshot = await saveCurrent();
      if (!snapshot) return;
      const b64 = format === 'pptx' ? await exportStudioDocument(snapshot.document.html, true, 'pptx', path, context.project.title) : undefined;
      if (format === 'pptx' && !b64) throw new Error(c.error);
      const content = b64 ? Uint8Array.from(atob(b64), character => character.charCodeAt(0)) : snapshot.document.html;
      const mime = format === 'html' ? 'text/html;charset=utf-8' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      try {
        await api('exports', 'POST', { format, base_version: snapshot.version, base_revision: snapshot.document_hash, ...(b64 ? { file_base64: b64 } : {}) });
        setExports((await api('exports')).data);
      } catch {
        downloadStudioFile(content, mime, context.project.title, '.' + format);
        throw new Error(c.exportSaveFailed);
      }
      downloadStudioFile(content, mime, context.project.title, '.' + format);
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
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_000_000) { setError(c.error); return null; }
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(null); reader.readAsDataURL(file); });
  }

  return <main className={styles.editor} data-testid="semurai-studio-editor">
    <aside className={styles.chat + (showChat ? ' ' + styles.chatVisible : '')}>
      <header className={styles.chatHeader}><a href={safeStudioReturn(context)!} title={c.back}><ArrowLeft size={17} /></a><strong>{context.project.title}</strong><button className={styles.mobileChatToggle} onClick={() => setShowChat(false)} title={c.close}><X size={16} /></button><button onClick={onClose} title={c.close}><X size={16} /></button></header>
      <div className={styles.conversation} ref={chatLog} role="log"><div className={styles.brand}><Sparkles size={20} /><span>{c.newProject}</span></div>
        {!jobs.length && <div className={styles.welcome}><h2>{c.empty}</h2><p>{c.emptyHelp}</p></div>}
        {[...jobs].reverse().map(job => <div key={job.id} className={styles.turn}><p className={styles.userMessage}>{job.brief}</p><div className={styles.references}>{job.references?.map(image => image.thumbnail && <img key={image.id} src={image.thumbnail} alt={image.title} title={image.title} />)}</div><div className={styles.answer}><span className={styles.spark}><Sparkles size={15} /></span><div>{job.assistant_message && <div className={styles.assistantText}>{renderMarkdown(job.assistant_message, { syntaxHighlight: false })}</div>}<strong>{job.status === 'completed' ? c.completed : job.status === 'failed' ? c.failed : job.status === 'cancelled' ? c.cancelled : job.status === 'conflicted' ? c.conflict : c.working}</strong>{!terminal.has(job.status) && <button onClick={() => { void action(async () => { await api('jobs/' + job.id + '/cancel', 'POST', {}); await refresh(); }); }}>{c.cancel}</button>}{job.retryable && <button onClick={() => { void action(async () => { await api('jobs/' + job.id + '/retry', 'POST', {}); await refresh(); }); }}>{c.retry}</button>}</div></div></div>)}
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send(); }}><StudioMedia images={images} onChange={value => { setImages(value); requestKey.current = null; }} useLibrary={useLibrary} onLibrary={value => { setUseLibrary(value); requestKey.current = null; }} api={api} locale={context.project.uiLocale} disabled={busy || !!active} onBusy={setMediaBusy} /><textarea aria-label={c.ask} placeholder={c.ask} value={prompt} onChange={event => { setPrompt(event.target.value); requestKey.current = null; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><div className={styles.composerFooter}><span>{c.chat}</span><Button type="submit" title={c.send} disabled={busy || mediaBusy || !!active || !prompt.trim()}><ArrowUp size={18} /></Button></div></form><p className={styles.chatHint}>{c.allChanges}</p>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.header}><Button className={styles.mobileChatToggle} title={c.chat} onClick={() => setShowChat(true)}><MessageSquare size={16} /></Button><div className={styles.fileTab}><Code2 size={15} /><span>{context.project.title}</span></div><span className={styles.saveState}>{dirty ? c.unsaved : <><Check size={13} />{c.saved}</>}</span><button title={c.history} onClick={() => setShowHistory(!showHistory)}><History size={17} /></button><Button disabled={!dirty || busy} onClick={() => { void action(async () => { await saveCurrent(); }); }}>{c.save}</Button><details className={styles.exportMenu}><summary><Download size={15} />{c.export}</summary><div><Button disabled={!document || busy} onClick={() => { void exportFile('html'); }}>{c.downloadHtml}</Button>{deck && <Button disabled={!document || busy} onClick={() => { void exportFile('pptx'); }}>{c.downloadPptx}</Button>}<Button disabled={!document || busy} onClick={() => { if (document) void action(async () => { await exportStudioDocument(document.html, deck, 'print', path, context.project.title); }); }}>{c.print}</Button><Button onClick={() => { setShowExports(!showExports); setShowHistory(false); }}>{c.exportHistory}</Button></div></details></header>
      <div className={styles.toolbar}><div className={styles.segment}><button className={mode !== 'source' ? styles.active : ''} onClick={() => setMode('preview')}><Eye size={15} />{c.preview}</button><button className={mode === 'source' ? styles.active : ''} onClick={() => setMode('source')}><Code2 size={15} />{c.source}</button></div><select value={device} onChange={event => setDevice(Number(event.target.value))} aria-label={c.desktop}><option value={0}>{c.desktop}</option><option value={768}>{c.tablet}</option><option value={390}>{c.mobile}</option></select><div className={styles.spacer} /><button disabled={!undo.length} title={c.undo} onClick={() => travel('undo')}><RotateCcw size={16} /></button><button disabled={!redo.length} title={c.redo} onClick={() => travel('redo')}><RotateCw size={16} /></button><button className={showLayers ? styles.active : ''} title={c.layers} onClick={() => { setShowLayers(!showLayers); setMode('edit'); }}><Layers size={16} /></button><button className={mode === 'edit' ? styles.active : ''} onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}><Pencil size={15} />{c.edit}</button><button title={deck ? c.present : c.fullscreen} onClick={() => { void viewport.current?.requestFullscreen(); }}><Maximize2 size={16} /></button><select value={zoom} aria-label={c.zoom} onChange={event => setZoom(Number(event.target.value))}>{[50, 75, 100, 125, 150].map(value => <option key={value} value={value}>{value}%</option>)}</select></div>
      {expired && <div className={styles.error} role="alert">{c.expired}<a href={safeStudioReturn(context)!} target="_blank" rel="noopener noreferrer">{c.back}</a></div>}
      {error && <div className={styles.error} role="alert">{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
      <div className={styles.body}>
        {deck && count > 0 && mode !== 'source' && <aside className={styles.slides}><div className={styles.slideTools}><Button title={c.duplicateSlide} disabled={count >= 60} onClick={() => slideAction('duplicate')}><Copy size={14} /></Button><Button title={c.removeSlide} disabled={count <= 1} onClick={() => slideAction('remove')}><Trash2 size={14} /></Button><Button title={c.moveUp} disabled={slide === 0} onClick={() => slideAction('before')}><ChevronUp size={14} /></Button><Button title={c.moveDown} disabled={slide >= count - 1} onClick={() => slideAction('after')}><ChevronDown size={14} /></Button></div><DeckThumbnailRail count={count} activeIndex={Math.min(slide, count - 1)} labelTotal={count} buildThumbSrcDoc={thumbnail} onSelect={navigateSlide} previewViewport={{ width: 1920, height: 1080 }} /></aside>}
        {showLayers && mode === 'edit' && <aside className={styles.layers}>{targets.map(target => <button key={target.id} className={selected?.id === target.id ? styles.active : ''} onClick={() => pick(target)}><span>{target.tagName}</span>{target.label || target.text.slice(0, 45)}</button>)}</aside>}
        <div className={styles.stage}>
          {loading ? <div className={styles.empty}>{c.loading}</div> : !document ? <div className={styles.empty}><Sparkles size={32} /><h2>{c.empty}</h2><p>{c.emptyHelp}</p></div> : mode === 'source' ? <div className={styles.sourceEditor}><div className={styles.sourceTabs}><Button onClick={() => setSourceTab('html')} aria-pressed={sourceTab === 'html'}>{c.html}</Button><Button onClick={() => setSourceTab('css')} aria-pressed={sourceTab === 'css'}>{c.css}</Button>{sourceTab === 'css' && sheets.length > 1 && <select aria-label={c.css} value={Math.min(sheet, sheets.length - 1)} onChange={event => setSheet(Number(event.target.value))}>{sheets.map((_, index) => <option key={index} value={index}>CSS {index + 1}</option>)}</select>}</div><textarea className={styles.code} aria-label={sourceTab === 'html' ? c.savedSource : c.css} spellCheck={false} value={sourceTab === 'html' ? document.html : sheets[Math.min(sheet, Math.max(0, sheets.length - 1))] ?? ''} onKeyDown={event => { if (event.key !== 'Tab') return; event.preventDefault(); const input = event.currentTarget; const start = input.selectionStart; const end = input.selectionEnd; const value = input.value.slice(0, start) + '  ' + input.value.slice(end); change({ ...document, html: sourceTab === 'html' ? value : replaceStyleBlock(document.html, Math.min(sheet, Math.max(0, sheets.length - 1)), value) }); requestAnimationFrame(() => { input.selectionStart = input.selectionEnd = start + 2; }); }} onChange={event => change({ ...document, html: sourceTab === 'html' ? event.target.value : replaceStyleBlock(document.html, Math.min(sheet, Math.max(0, sheets.length - 1)), event.target.value) })} /></div> : <div ref={viewport} className={styles.viewport} style={{ maxWidth: device || undefined, zoom: zoom / 100 }}><iframe ref={frame} title={c.preview} sandbox="allow-scripts allow-modals" srcDoc={srcdoc} onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'od-edit-mode', enabled: mode === 'edit' }, '*')} /></div>}
          {deck && document && mode !== 'source' && <label className={styles.notes}><span>{c.notes} · {slide + 1}/{count}</span><textarea value={document.notes?.[slide] ?? ''} placeholder={c.notes} onChange={event => { const notes = Array.from({ length: count }, (_, index) => document.notes?.[index] ?? ''); notes[slide] = event.target.value; change({ ...document, notes }); }} /></label>}
        </div>
        {mode === 'edit' && <div className={styles.inspector}><ManualEditPanel targets={targets} selectedTarget={selected} draft={draft} history={[]} error={null} canUndo={!!undo.length} canRedo={!!redo.length} busy={busy} onSelectTarget={pick} onDraftChange={setDraft} onStyleChange={(id, values) => patch({ kind: 'set-style', id, styles: values })} onApplyPatch={patch} onPickImage={pickImage} onError={setError} onClearSelection={() => setSelected(null)} onCancelDraft={() => selected && pick(selected)} onSaveDraft={() => { void saveDraft(); }} onResetDraft={() => selected && pick(selected)} onUndo={() => travel('undo')} onRedo={() => travel('redo')} onExit={() => setMode('preview')} /></div>}
        {showHistory && <aside className={styles.history}><h3>{c.history}</h3>{versions.map(version => <div key={version.id}><strong>{c.version} {version.version}</strong><small>{new Date(version.created_at).toLocaleString(context.project.uiLocale)}</small><Button disabled={busy || version.version === saved?.version || dirty} onClick={() => { void action(async () => { await api('versions/' + version.id + '/restore', 'POST', { base_version: saved?.version, base_revision: saved?.document_hash }); await refresh(true); }); }}>{c.restore}</Button></div>)}</aside>}
        {showExports && <aside className={styles.history}><h3>{c.exportHistory}</h3>{!exports.length && <p>{c.noExports}</p>}{exports.map(file => <div key={file.id}><strong>{file.format.toUpperCase()} · {c.version} {file.version}</strong><small>{new Date(file.created_at).toLocaleString(context.project.uiLocale)} · {Math.max(1, Math.round(file.size / 1024))} KB</small><Button disabled={busy} onClick={() => { void downloadExport(file); }}><Download size={14} />{c.downloadAgain}</Button></div>)}</aside>}
      </div>
      <footer className={styles.footer}><span>{context.project.locale.toUpperCase()} · {context.project.artifactType}</span><span>{saved ? c.version + ' ' + saved.version : 'Semurai Creative'}</span></footer>
    </section>
  </main>;
}
