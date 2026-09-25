import { annotateManualEditSourcePaths, annotateMissingOdIds } from '../runtime/srcdoc';
import type { ManualEditKind, ManualEditTarget } from '../edit-mode/types';

export interface StudioLayer { id: string; tag: string; name: string; kind: ManualEditKind; layout: '' | 'row' | 'column' | 'grid'; children: StudioLayer[] }

function layerName(element: Element, target: ManualEditTarget): string {
  const label = element.getAttribute('data-od-label') || element.getAttribute('aria-label');
  if (label) return label.trim().slice(0, 60);
  if (target.kind === 'image') return (element.getAttribute('alt') || '').trim() || target.tagName;
  if (target.kind === 'text' || target.kind === 'link') return (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || target.tagName;
  if (element.id && !/^path-/.test(element.id)) return element.id;
  const className = [...element.classList].find(name => !name.startsWith('od-'));
  return className ?? target.tagName;
}

function layerLayout(target: ManualEditTarget): StudioLayer['layout'] {
  if (!target.isLayoutContainer) return '';
  const display = target.styles.display ?? '';
  if (display.includes('grid')) return 'grid';
  return (target.styles.flexDirection ?? '').startsWith('column') ? 'column' : 'row';
}

/**
 * Nest the preview's edit targets by the canonical source structure. Ids are
 * derived exactly like the preview does (explicit data-od-id, then the
 * generated source path), so every node maps back to one reported target.
 * Elements that are not targets (too small, host chrome) are skipped and their
 * children lifted to the nearest target ancestor.
 */
export function studioLayerTree(source: string, targets: ManualEditTarget[]): StudioLayer[] {
  if (!source || !targets.length) return [];
  const known = new Map(targets.map(target => [target.id, target]));
  const doc = new DOMParser().parseFromString(annotateManualEditSourcePaths(annotateMissingOdIds(source)), 'text/html');
  const walk = (parent: Element): StudioLayer[] => [...parent.children].flatMap(element => {
    const id = element.getAttribute('data-od-id') || element.getAttribute('data-od-source-path') || '';
    const children = walk(element);
    const target = known.get(id);
    return target ? [{ id, tag: target.tagName, name: layerName(element, target), kind: target.kind, layout: layerLayout(target), children }] : children;
  });
  return walk(doc.body);
}

/** Ancestors of a node (outermost first), or null when the id is not in the tree. */
export function studioLayerPath(layers: StudioLayer[], id: string): StudioLayer[] | null {
  for (const layer of layers) {
    if (layer.id === id) return [layer];
    const below = studioLayerPath(layer.children, id);
    if (below) return [layer, ...below];
  }
  return null;
}
