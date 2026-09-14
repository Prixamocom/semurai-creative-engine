/** Source operations also participate in Studio's document undo/version history. */
export function styleBlocks(source: string): string[] {
  return [...new DOMParser().parseFromString(source, 'text/html').querySelectorAll('style')].map(node => node.textContent ?? '');
}

export function replaceStyleBlock(source: string, index: number, css: string): string {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const blocks = [...doc.querySelectorAll('style')];
  const target = blocks[index] ?? doc.head.appendChild(doc.createElement('style'));
  // Preserve all other sheets, including media-scoped rules and their attributes.
  target.textContent = css.replace(/<\/style/gi, '<\\/style');
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

export type SlideOperation = 'duplicate' | 'remove' | 'before' | 'after';
export function changeSlide(source: string, notes: (string | null)[], index: number, operation: SlideOperation) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const slides = [...doc.querySelectorAll('.deck-stage .slide')];
  const current = slides[index];
  const nextNotes = slides.map((_, i) => notes[i] ?? '');
  let active = index;
  if (!current) return null;
  if (operation === 'duplicate') {
    if (slides.length >= 60) return null;
    const clone = current.cloneNode(true) as Element;
    for (const node of [clone, ...clone.querySelectorAll('*')]) {
      for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-od-')) node.removeAttribute(attribute.name);
    }
    // Keep document IDs unique and preserve local fragment/SVG references.
    const suffix = '-copy-' + crypto.randomUUID().slice(0, 8);
    const ids = new Map<string, string>();
    for (const node of [clone, ...clone.querySelectorAll('[id]')]) if (node.id) { ids.set(node.id, node.id + suffix); node.id += suffix; }
    for (const node of [clone, ...clone.querySelectorAll('*')]) for (const attribute of [...node.attributes]) {
      if (attribute.name === 'id') continue;
      let value = attribute.value;
      for (const [oldId, newId] of ids) {
        if (value === '#' + oldId) value = '#' + newId;
        value = value.replaceAll('url(#' + oldId + ')', 'url(#' + newId + ')');
      }
      if (value !== attribute.value) node.setAttribute(attribute.name, value);
    }
    current.after(clone); nextNotes.splice(index + 1, 0, nextNotes[index]!); active++;
  } else if (operation === 'remove') {
    if (slides.length <= 1) return null;
    current.remove(); nextNotes.splice(index, 1); active = Math.min(index, slides.length - 2);
  } else {
    const other = operation === 'before' ? index - 1 : index + 1;
    if (!slides[other]) return null;
    if (operation === 'before') slides[other]!.before(current); else slides[other]!.after(current);
    [nextNotes[index], nextNotes[other]] = [nextNotes[other]!, nextNotes[index]!]; active = other;
  }
  [...doc.querySelectorAll('.deck-stage .slide')].forEach((node, i) => node.classList.toggle('active', i === active));
  return { html: '<!doctype html>\n' + doc.documentElement.outerHTML, notes: nextNotes, active };
}

export interface StudioSources { html: string; files?: { path: string; content: string }[] }
export function studioFileSource(document: StudioSources, path: string): string {
  return path === 'index.html' ? document.html : document.files?.find(file => file.path === path)?.content ?? document.html;
}
export function replaceStudioFile<T extends StudioSources>(document: T, path: string, content: string): T {
  if (path === 'index.html') return { ...document, html: content };
  if (!document.files?.some(file => file.path === path)) throw new Error('Unknown source file');
  return { ...document, files: document.files.map(file => file.path === path ? { ...file, content } : file) };
}
