import DOMPurify from 'dompurify';
import { DECK_SKELETON_HTML } from '@open-design/contracts';
import { findRealTagEnd, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { annotateManualEditSourcePaths, annotateMissingOdIds, buildSrcdoc } from '../runtime/srcdoc';

export const STUDIO_ARTIFACT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

/** Prepare an opaque preview; never persist this derivative as the user's source. */
export function studioPreviewSource(source: string, slide = 0, edit = false, deck = true): string {
  // Map identities before removing unsafe author nodes so a manual edit still
  // resolves the same element in the original, unsanitized canonical source.
  const mapped = annotateManualEditSourcePaths(annotateMissingOdIds(source));
  const safe = DOMPurify.sanitize(mapped, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'form'],
    FORBID_ATTR: ['srcset', 'ping', 'action', 'formaction', 'autofocus'],
  });
  const parsed = new DOMParser().parseFromString(safe, 'text/html');
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
  const prepared = buildSrcdoc('<!doctype html>\n' + parsed.documentElement.outerHTML, {
    deck, initialSlideIndex: slide, hideDeckChrome: true, editBridge: edit, freezeMotion: deck && !edit,
  });
  // First in the head, before any of the trusted preview bridges execute.
  const headEnd = findRealTagEnd(prepared, HTML_TAG_PATTERNS.headOpen);
  if (headEnd < 0) throw new Error('Invalid preview document');
  return prepared.slice(0, headEnd) + '<meta http-equiv="Content-Security-Policy" content="' + STUDIO_ARTIFACT_CSP + '">' + prepared.slice(headEnd);
}

export function studioSlideCount(source: string): number {
  return new DOMParser().parseFromString(source, 'text/html').querySelectorAll('.deck-stage .slide').length;
}
