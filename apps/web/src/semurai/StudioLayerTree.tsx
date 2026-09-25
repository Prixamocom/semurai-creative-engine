import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, Columns3, Heading, Image, LayoutGrid, Link, Rows3, Square, Type } from 'lucide-react';
import { studioLayerPath, type StudioLayer } from './studio-layers';
import type { StudioEditPanelCopy } from './studio-editor-copy';
import styles from './StudioEditPanel.module.css';

function LayerIcon({ layer }: { layer: StudioLayer }) {
  const Icon = layer.kind === 'image' ? Image : layer.kind === 'link' ? Link : layer.kind === 'text' ? (/^h[1-6]$/.test(layer.tag) ? Heading : Type)
    : layer.layout === 'grid' ? LayoutGrid : layer.layout === 'column' ? Rows3 : layer.layout === 'row' ? Columns3 : Square;
  return <Icon className={styles.nodeIcon} size={14} aria-hidden="true" />;
}

/** Collapsible, height-limited layer tree built from the active file's structure. */
export function StudioLayerTree({ layers, selectedId, open, copy, onOpenChange, onSelect }: {
  layers: StudioLayer[]; selectedId: string | null; open: boolean; copy: StudioEditPanelCopy;
  onOpenChange: (open: boolean) => void; onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(layers.map(layer => layer.id)));
  const [focusId, setFocusId] = useState<string | null>(null);
  const tree = useRef<HTMLDivElement>(null);
  const seeded = useRef(layers.length > 0);
  useEffect(() => { if (!seeded.current && layers.length) { seeded.current = true; setExpanded(new Set(layers.map(layer => layer.id))); } }, [layers]);
  // Reveal the selection: expand its ancestors, then bring its row into view.
  useEffect(() => {
    setFocusId(null);
    if (!selectedId) return;
    const path = studioLayerPath(layers, selectedId);
    if (path && path.length > 1) setExpanded(previous => path.slice(0, -1).every(layer => previous.has(layer.id)) ? previous : new Set([...previous, ...path.slice(0, -1).map(layer => layer.id)]));
  }, [selectedId, layers]);
  useEffect(() => {
    if (!open || !selectedId) return;
    const row = tree.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [open, selectedId, expanded]);
  const rows = useMemo(() => {
    const list: { layer: StudioLayer; level: number; parent: string | null }[] = [];
    const visit = (items: StudioLayer[], level: number, parent: string | null) => items.forEach(layer => {
      list.push({ layer, level, parent });
      if (layer.children.length && expanded.has(layer.id)) visit(layer.children, level + 1, layer.id);
    });
    visit(layers, 1, null); return list;
  }, [layers, expanded]);
  const toggle = (id: string, value = !expanded.has(id)) => setExpanded(previous => { const next = new Set(previous); if (value) next.add(id); else next.delete(id); return next; });
  const current = rows.findIndex(row => row.layer.id === (focusId ?? selectedId));
  function move(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))]; if (!row) return;
    setFocusId(row.layer.id);
    [...(tree.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [])].find(node => node.dataset.layerId === row.layer.id)?.focus();
  }
  function keyDown(event: KeyboardEvent) {
    const row = rows[current]; if (!row) return;
    const { layer } = row;
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(current + 1), ArrowUp: () => move(current - 1), Home: () => move(0), End: () => move(rows.length - 1),
      ArrowRight: () => { if (layer.children.length && !expanded.has(layer.id)) toggle(layer.id, true); else if (layer.children.length) move(current + 1); },
      ArrowLeft: () => { if (layer.children.length && expanded.has(layer.id)) toggle(layer.id, false); else if (row.parent) move(rows.findIndex(item => item.layer.id === row.parent)); },
      Enter: () => onSelect(layer.id), ' ': () => onSelect(layer.id),
    };
    const action = keys[event.key]; if (!action) return;
    event.preventDefault(); action();
  }
  return <section className={styles.layers} data-open={open || undefined}>
    <button type="button" className={styles.layersHead} aria-expanded={open} aria-controls="studio-layer-tree" onClick={() => onOpenChange(!open)}>
      {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}<span>{copy.layers}</span>
    </button>
    {open && <div id="studio-layer-tree" ref={tree} className={styles.tree} role="tree" aria-label={copy.layers} onKeyDown={keyDown}>
      {!rows.length && <p className={styles.treeEmpty}>{copy.layersEmpty}</p>}
      {rows.map(({ layer, level }, index) => {
        const branch = layer.children.length > 0; const isOpen = branch && expanded.has(layer.id);
        return <div key={layer.id} data-layer-id={layer.id} className={styles.node} role="treeitem" aria-level={level} aria-selected={layer.id === selectedId} aria-expanded={branch ? isOpen : undefined}
          tabIndex={index === Math.max(0, current) ? 0 : -1} style={{ paddingLeft: 4 + (level - 1) * 12 }}
          onClick={() => { setFocusId(layer.id); onSelect(layer.id); }} onFocus={() => setFocusId(layer.id)}>
          <span className={styles.nodeChevron} aria-hidden={!branch || undefined} title={branch ? (isOpen ? copy.collapse : copy.expand) : undefined}
            onClick={event => { if (!branch) return; event.stopPropagation(); toggle(layer.id); }}>
            {branch && (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
          </span>
          <LayerIcon layer={layer} /><span className={styles.nodeName}>{layer.name}</span><span className={styles.nodeTag}>{layer.tag}</span>
        </div>;
      })}
    </div>}
  </section>;
}
