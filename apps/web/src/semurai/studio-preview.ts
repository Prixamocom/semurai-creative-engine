import DOMPurify from 'dompurify';
import { STUDIO_COMMENT_BRIDGE, STUDIO_PREVIEW_ACCENT as ACCENT } from './studio-comment-bridge';
import { DECK_SKELETON_HTML } from '@open-design/contracts';
import { findRealTagEnd, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { annotateManualEditSourcePaths, annotateMissingOdIds, buildSrcdoc } from '../runtime/srcdoc';
import { STUDIO_VIDEO_BRIDGE } from './studio-video';
import { STUDIO_CAPTURE_BRIDGE } from './studio-capture-bridge';

export const STUDIO_ARTIFACT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

/** Prepare an opaque preview; never persist this derivative as the user's source. */
export function studioPreviewSource(source: string, slide = 0, edit = false, deck = true, annotate = false, markers = false, videoRuntime?: string): string {
  // Map identities before removing unsafe author nodes so a manual edit still
  // resolves the same element in the original, unsanitized canonical source.
  const mapped = annotateManualEditSourcePaths(annotateMissingOdIds(source));
  const previewDocument = new DOMParser().parseFromString(mapped, 'text/html');
  for (const style of previewDocument.querySelectorAll('style')) {
    // CSS comments and strings can contain HTML examples. Escape their text
    // so DOMPurify's XML/mutation checks do not discard the entire stylesheet.
    // Whitespace after a range comparator preserves its CSS meaning too.
    style.textContent = (style.textContent ?? '').replace(
      /(\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|<(?=\d)/g,
      (match, literal: string | undefined) => literal ? literal.replace(/</g, '\\3c ') : '< ',
    );
  }
  const safe = DOMPurify.sanitize(previewDocument.documentElement.outerHTML, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form'],
    FORBID_ATTR: ['srcset', 'ping', 'action', 'formaction', 'autofocus'],
  });
  const parsed = new DOMParser().parseFromString(safe, 'text/html');
  if (videoRuntime) {
    const scripts = [...new DOMParser().parseFromString(source, 'text/html').querySelectorAll('script:not([src])')]
      .filter(script => !script.getAttribute('type') || script.getAttribute('type') === 'text/javascript')
      .map(script => script.textContent ?? '');
    for (const code of [videoRuntime, ...scripts, STUDIO_VIDEO_BRIDGE]) {
      const script = parsed.createElement('script');
      script.textContent = code.replace(/<\/script/gi, '<\\/script'); parsed.body.appendChild(script);
    }
  }
  for (const element of parsed.querySelectorAll('[href], [xlink\\:href]')) {
    for (const name of ['href', 'xlink:href']) {
      const value = element.getAttribute(name);
      if (value && !value.startsWith('#')) element.removeAttribute(name);
    }
  }
  if (deck) {
    const stage = parsed.querySelector<HTMLElement>('.deck-stage');
    if (stage) {
      stage.id = 'deck-stage';
      Object.assign(stage.style, { position: 'absolute', left: '0', top: '0', width: '1920px', height: '1080px', transformOrigin: 'top left' });
      // Sanitization removes the author's copy of the framework too. Restore
      // only the pinned upstream runtime for fitting/navigation, never author JS.
      const framework = new DOMParser().parseFromString(DECK_SKELETON_HTML, 'text/html').querySelector('script')?.textContent;
      if (!framework) throw new Error('Deck runtime unavailable');
      const runtime = parsed.createElement('script');
      runtime.textContent = framework.replace('if (e.defaultPrevented) return;', `if (${edit} || e.defaultPrevented) return;`);
      parsed.body.appendChild(runtime);
    }
  }
  if (markers) {
    const chrome = parsed.createElement('style');
    // Edit guides in the Studio accent, matching the host selection and markers.
    chrome.textContent = `[data-od-edit-guides-layer]{--selected:${ACCENT};--accent:${ACCENT};--amber:${ACCENT};--accent-contrast:#fff}[data-od-edit-guides-layer] .od-edit-guide-measure{color:#fff;background:${ACCENT}}[data-od-edit-guides-layer] .od-edit-guide-box{border-color:${ACCENT}!important}[data-od-edit-guides-layer] .od-edit-guide-handle{border-color:${ACCENT}!important;background:#fff}`;
    parsed.head.appendChild(chrome);
  }
  // The live preview also carries the PNG capture bridge (studio-capture-bridge.ts).
  if (markers) for (const code of [STUDIO_COMMENT_BRIDGE, STUDIO_CAPTURE_BRIDGE]) { const bridge = parsed.createElement('script'); bridge.textContent = code; parsed.body.appendChild(bridge); }
  const prepared = buildSrcdoc('<!doctype html>\n' + parsed.documentElement.outerHTML, {
    deck, initialSlideIndex: slide, hideDeckChrome: true, editBridge: edit, commentBridge: annotate, selectionBridge: markers, freezeMotion: deck && !edit,
  });
  // First in the head, before any of the trusted preview bridges execute.
  const headEnd = findRealTagEnd(prepared, HTML_TAG_PATTERNS.headOpen);
  if (headEnd < 0) throw new Error('Invalid preview document');
  return prepared.slice(0, headEnd) + '<meta http-equiv="Content-Security-Policy" content="' + STUDIO_ARTIFACT_CSP + '">' + prepared.slice(headEnd);
}

export interface StudioPreviewScroll { frameLeft: number; frameTop: number; canvasLeft: number; canvasTop: number }
export const emptyStudioPreviewScroll: StudioPreviewScroll = { frameLeft: 0, frameTop: 0, canvasLeft: 0, canvasTop: 0 };
/** How long after a restore request the reloaded preview may still report a clamped offset. */
export const STUDIO_PREVIEW_SCROLL_SETTLE_MS = 1200;
/** How long a rebuilt srcdoc may take to load and ask for its restore. */
export const STUDIO_PREVIEW_RELOAD_WAIT_MS = 10_000;

/**
 * Every edit rebuilds the preview srcdoc, so the iframe reloads at the top and
 * its selection bridge asks the host (`od:preview-scroll-request`) where to go.
 * The kept offset must stay the user's last scroll position: while a reloaded
 * document is still settling, a report below the kept offset on any axis is a
 * restore clamped by a shorter layout (or the initial zero), not the user.
 */
export function nextStudioPreviewScroll(kept: StudioPreviewScroll, report: Partial<Record<keyof StudioPreviewScroll, unknown>>, settling: boolean): StudioPreviewScroll {
  const read = (value: unknown) => { const number = Number(value || 0); return Number.isFinite(number) ? Math.max(0, number) : 0; };
  const next = { frameLeft: read(report.frameLeft), frameTop: read(report.frameTop), canvasLeft: read(report.canvasLeft), canvasTop: read(report.canvasTop) };
  return settling && (Object.keys(next) as (keyof StudioPreviewScroll)[]).some(axis => next[axis] < kept[axis]) ? kept : next;
}

export function studioSlideCount(source: string): number {
  return new DOMParser().parseFromString(source, 'text/html').querySelectorAll('.deck-stage .slide').length;
}
