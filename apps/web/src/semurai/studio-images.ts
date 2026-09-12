import { findEditableElement } from '../edit-mode/source-patches';

export type StudioImagePlacement = 'replace' | 'inside' | 'end';
const containers = new Set(['main', 'section', 'div', 'article', 'header', 'footer', 'td', 'th']);
export function acceptsStudioImage(tag: string): boolean { return containers.has(tag.toLowerCase()); }

/** Apply a private-library raster to canonical HTML, never to preview markup. */
export function placeStudioImage(source: string, image: { dataUrl: string; alt: string }, placement: StudioImagePlacement, email: boolean, targetId?: string): string | null {
  if (!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$/.test(image.dataUrl)) return null;
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const target = targetId ? findEditableElement(doc, targetId) : null;
  if (placement !== 'end' && !target) return null;
  if (placement === 'replace') {
    if (target!.tagName.toLowerCase() !== 'img') return null;
    target!.setAttribute('src', image.dataUrl); target!.setAttribute('alt', image.alt);
    // Otherwise the browser can keep displaying the old responsive candidate.
    target!.removeAttribute('srcset'); target!.removeAttribute('sizes');
    if (target!.parentElement?.tagName.toLowerCase() === 'picture') {
      for (const child of [...target!.parentElement.children]) if (child.tagName.toLowerCase() === 'source') child.remove();
    }
  } else {
    if (placement === 'inside' && !acceptsStudioImage(target!.tagName)) return null;
    const img = doc.createElement('img'); img.src = image.dataUrl; img.alt = image.alt;
    img.setAttribute('style', 'display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 auto');
    img.setAttribute('width', '600');
    if (placement === 'inside') target!.appendChild(img);
    else if (email) {
      const table = doc.createElement('table'); table.setAttribute('role', 'presentation'); table.setAttribute('width', '100%');
      table.setAttribute('cellpadding', '0'); table.setAttribute('cellspacing', '0'); table.setAttribute('border', '0');
      table.insertRow().insertCell().appendChild(img); doc.body.appendChild(table);
    } else (doc.querySelector('main') ?? doc.body).appendChild(img);
  }
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
