'use client';

import { useRef, type CSSProperties, type Dispatch, type PointerEvent } from 'react';
import { Loader2, MoveUpRight, PenLine, Send, Square, Trash2, Undo2 } from 'lucide-react';
import { StudioButton, StudioButtonGroup } from './StudioButton';
import { STUDIO_DRAW_COLORS, studioStrokePath, type StudioDrawAction, type StudioDrawState, type StudioDrawTool, type StudioPoint } from './studio-draw';
import type { StudioDrawCopy } from './studio-editor-copy';
import styles from './StudioDraw.module.css';

/**
 * Host-side drawing layer over the preview. It sits inside the zoomed
 * viewport, so pointer positions are divided by the zoom and the SVG draws in
 * the preview's CSS pixels. Only while `active` does it take pointer events;
 * otherwise it just shows the marks above the preview.
 */
export function StudioDrawLayer({ state, dispatch, zoom, active, label }: {
  state: StudioDrawState; dispatch: Dispatch<StudioDrawAction>; zoom: number; active: boolean; label: string;
}) {
  const pointer = useRef<number | null>(null);
  function point(event: PointerEvent<HTMLDivElement>): StudioPoint {
    const rect = event.currentTarget.getBoundingClientRect(); const scale = zoom / 100 || 1;
    const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
    return { x: clamp((event.clientX - rect.left) / scale, rect.width / scale), y: clamp((event.clientY - rect.top) / scale, rect.height / scale) };
  }
  const strokes = state.draft ? [...state.strokes, state.draft] : state.strokes;
  return <div className={styles.layer} data-active={active || undefined} data-testid="studio-draw-layer" role={active ? 'application' : undefined} aria-label={active ? label : undefined} aria-hidden={active ? undefined : true}
    onPointerDown={active ? event => {
      if (event.button !== 0 || pointer.current !== null) return;
      event.preventDefault(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dispatch({ type: 'begin', point: point(event) });
    } : undefined}
    onPointerMove={active ? event => { if (pointer.current === event.pointerId) dispatch({ type: 'move', point: point(event) }); } : undefined}
    onPointerUp={active ? event => {
      if (pointer.current !== event.pointerId) return;
      pointer.current = null; dispatch({ type: 'move', point: point(event) }); dispatch({ type: 'end' });
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } : undefined}
    onPointerCancel={active ? () => { pointer.current = null; dispatch({ type: 'cancel' }); } : undefined}>
    <svg className={styles.marks} aria-hidden="true">
      {strokes.map((stroke, index) => <path key={index} d={studioStrokePath(stroke)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  </div>;
}

const TOOLS: [StudioDrawTool, typeof PenLine][] = [['pen', PenLine], ['rect', Square], ['arrow', MoveUpRight]];
const COLOR_NAMES = ['red', 'blue', 'yellow'] as const;

/** Bar of the Draw sub-tool, docked over the top of the canvas: tool, color, undo, clear and "Send to chat". Render it as the first child of the stage. */
export function StudioDrawBar({ copy, state, dispatch, busy, disabled, onSend }: {
  copy: StudioDrawCopy; state: StudioDrawState; dispatch: Dispatch<StudioDrawAction>; busy: boolean; disabled: boolean; onSend: () => void;
}) {
  const empty = !state.strokes.length;
  return <div className={styles.dock}><div className={styles.bar} role="toolbar" aria-label={copy.bar}>
    <StudioButtonGroup label={copy.tools}>
      {TOOLS.map(([tool, Icon]) => <StudioButton key={tool} icon aria-pressed={state.tool === tool} title={copy[tool]} aria-label={copy[tool]} onClick={() => dispatch({ type: 'tool', tool })}><Icon size={16} /></StudioButton>)}
    </StudioButtonGroup>
    <div className={styles.colors} role="radiogroup" aria-label={copy.colors}>
      {STUDIO_DRAW_COLORS.map((color, index) => <button key={color} type="button" role="radio" className={styles.color} aria-checked={state.color === color} aria-label={copy[COLOR_NAMES[index]!]} title={copy[COLOR_NAMES[index]!]}
        style={{ '--draw-color': color } as CSSProperties} onClick={() => dispatch({ type: 'color', color })} />)}
    </div>
    <span className={styles.divider} aria-hidden="true" />
    <StudioButton icon title={copy.undo} aria-label={copy.undo} disabled={empty || busy} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={16} /></StudioButton>
    <StudioButton icon title={copy.clear} aria-label={copy.clear} disabled={empty || busy} onClick={() => dispatch({ type: 'clear' })}><Trash2 size={16} /></StudioButton>
    <StudioButton variant="primary" disabled={empty || busy || disabled} onClick={onSend}>
      {busy ? <Loader2 size={16} className={styles.spinning} /> : <Send size={16} />}<span aria-live="polite">{busy ? copy.sending : copy.send}</span>
    </StudioButton>
  </div></div>;
}
