import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween, AlignJustify, AlignLeft, AlignRight, AlignStartHorizontal, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight,
  Code2, CornerLeftUp, ImageDown, ImageUp, Sparkles, StretchHorizontal, Trash2, X,
} from 'lucide-react';
import { readManualEditFields, readManualEditOuterHtml, readManualEditStyles } from '../edit-mode/source-patches';
import type { ManualEditPatch, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import { studioCaptureCopy, studioEditPanelCopy, type StudioEditPanelCopy } from './studio-editor-copy';
import { STUDIO_BORDER_STYLES, STUDIO_FONT_OPTIONS, STUDIO_FONT_WEIGHTS, studioFontSelectValue, studioSideKeys, studioStyleCommit, studioStyleDisplay, type StudioPageStyles, type StudioStyleKey } from './studio-edit-values';
import { studioLayerPath, studioLayerTree } from './studio-layers';
import { StudioColorField, StudioField, StudioQuadField, StudioSegmented, StudioSelectField } from './StudioFields';
import { StudioLayerTree } from './StudioLayerTree';
import { StudioImageMenu } from './StudioImageMenu';
import { setStudioTweak, stepStudioTweak, studioTweakError, studioTweakGroups, studioTweaks, type StudioTweak, type StudioTweakGroup } from './studio-tweaks';
import styles from './StudioEditPanel.module.css';

export type StudioInspectorMode = 'simple' | 'pro' | 'code' | 'tweaks';
type Commit = (values: Partial<ManualEditStyles>) => string | null;

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.section} aria-label={title}><header className={styles.sectionHead}><h3>{title}</h3>{action}</header><div className={styles.sectionBody}>{children}</div></section>;
}
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.labeledRow}><span>{label}</span>{children}</div>;
}

/** Multi-line content that commits on blur or Ctrl/Cmd+Enter and reverts on Escape. */
function ContentText({ label, value, hint, disabled, onCommit }: { label: string; value: string; hint: string; disabled: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setDraft(value); }, [value]);
  const commit = () => { edited.current = false; if (draft !== value) onCommit(draft); };
  return <>
    <textarea className={styles.textarea} aria-label={label} title={hint} rows={3} value={draft} disabled={disabled} spellCheck
      onChange={event => { edited.current = true; setDraft(event.target.value); }} onBlur={() => { if (edited.current) commit(); }}
      onKeyDown={event => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); commit(); }
        if (event.key === 'Escape') { event.preventDefault(); edited.current = false; setDraft(value); }
      }} />
    <p className={styles.hint}>{hint}</p>
  </>;
}

function CodeTab({ c, source, selected, disabled, onPatch }: { c: StudioEditPanelCopy; source: string; selected: ManualEditTarget | null; disabled: boolean; onPatch: (patch: ManualEditPatch) => boolean }) {
  // The canonical source keeps link targets and attributes the sanitized preview drops.
  const original = useMemo(() => selected ? readManualEditOuterHtml(source, selected.id) || selected.outerHtml : '', [source, selected]);
  const [html, setHtml] = useState(original);
  const [error, setError] = useState('');
  useEffect(() => { setHtml(original); setError(''); }, [original]);
  if (!selected) return <p className={styles.empty}>{c.htmlSelect}</p>;
  return <div className={styles.code}>
    <textarea className={styles.codeInput} aria-label={c.html} spellCheck={false} value={html} disabled={disabled} aria-invalid={error ? true : undefined} onChange={event => { setHtml(event.target.value); setError(''); }} />
    {error && <p className={styles.fieldError} role="alert">{error}</p>}
    <div className={styles.codeFooter}><p className={styles.hint}>{c.htmlHint}</p>
      <button type="button" className={styles.primaryButton} disabled={disabled || html === original} onClick={() => {
        const template = document.createElement('template'); template.innerHTML = html.trim();
        if (template.content.children.length !== 1) { setError(c.invalidHtml); return; }
        setError(''); onPatch({ kind: 'set-outer-html', id: selected.id, html });
      }}>{c.applyHtml}</button>
    </div>
  </div>;
}

function Properties({ c, mode, source, target, disabled, commit, onPatch, onMode, onPickImage }: {
  c: StudioEditPanelCopy; mode: 'simple' | 'pro'; source: string; target: ManualEditTarget; disabled: boolean; commit: Commit;
  onPatch: (patch: ManualEditPatch) => boolean; onMode: (mode: StudioInspectorMode) => void; onPickImage: () => void;
}) {
  const [borderAdded, setBorderAdded] = useState(false);
  const fields = useMemo(() => ({ ...target.fields, ...readManualEditFields(source, target.id) }), [source, target]);
  // Values written inline in the source are shown exactly; measured (computed) ones are rounded.
  const inline = useMemo(() => readManualEditStyles(source, target.id), [source, target.id]);
  const raw = (key: StudioStyleKey) => target.styles[key] ?? '';
  const value = (key: StudioStyleKey) => { const own = inline[key]?.trim(); return studioStyleDisplay(key, own || target.styles[key], Boolean(own)); };
  const field = (key: StudioStyleKey, label: string, placeholder?: string) => <StudioField label={label} ariaLabel={label} value={value(key)} placeholder={placeholder} step={key} disabled={disabled} onCommit={next => commit({ [key]: next })} />;
  const color = (key: StudioStyleKey, label: string) => <StudioColorField label={label} value={value(key)} pickLabel={c.pickColor} placeholder={c.none} disabled={disabled} onCommit={next => commit({ [key]: next })} />;
  const fontSelect = <StudioSelectField label={c.font} value={raw('fontFamily')} disabled={disabled} options={[{ value: '', label: c.inherit }, ...STUDIO_FONT_OPTIONS]} onCommit={next => commit({ fontFamily: next })} />;
  const weightSelect = <StudioSelectField label={c.fontWeight} value={raw('fontWeight')} disabled={disabled} options={STUDIO_FONT_WEIGHTS.map(weight => ({ value: weight, label: weight }))} onCommit={next => commit({ fontWeight: next })} />;
  const textual = target.kind !== 'image';
  const image = target.kind === 'image';
  const src = fields.src ?? '';

  const content = <Section title={c.content}>
    {(target.kind === 'text' || target.kind === 'link') && <ContentText label={c.text} value={fields.text ?? ''} hint={c.textHint} disabled={disabled}
      onCommit={text => { onPatch(target.kind === 'link' ? { kind: 'set-link', id: target.id, text, href: fields.href ?? '' } : { kind: 'set-text', id: target.id, value: text }); }} />}
    {target.kind === 'link' && <StudioField label={c.href} ariaLabel={c.href} value={fields.href ?? ''} placeholder="https://" disabled={disabled}
      onCommit={href => { onPatch({ kind: 'set-link', id: target.id, text: fields.text ?? '', href }); return null; }} />}
    {image && <>
      <div className={styles.imageRow}>
        {/* Only embedded rasters are shown here; remote URLs are not fetched by the Studio host. */}
        {src.startsWith('data:image/') && <img src={src} alt="" className={styles.thumb} />}
        <span className={styles.imageName} title={src.startsWith('data:') ? undefined : src}>{src.startsWith('data:') ? c.embedded : src.split('/').pop() || c.none}</span>
        <button type="button" className={styles.ghostButton} disabled={disabled} onClick={onPickImage}><ImageUp size={14} />{c.changeImage}</button>
      </div>
      {!src.startsWith('data:') && <StudioField label={c.src} ariaLabel={c.src} value={src} placeholder="https://" disabled={disabled} onCommit={next => { onPatch({ kind: 'set-image', id: target.id, src: next, alt: fields.alt ?? '' }); return null; }} />}
      <StudioField label={c.alt} ariaLabel={c.alt} value={fields.alt ?? ''} disabled={disabled} onCommit={alt => { onPatch({ kind: 'set-image', id: target.id, src, alt }); return null; }} />
    </>}
    {target.kind === 'container' && <button type="button" className={styles.linkButton} onClick={() => onMode('code')}><Code2 size={14} />{c.editHtml}</button>}
  </Section>;

  if (mode === 'simple') return <>
    {content}
    <Section title={c.style}>
      {textual && <div className={styles.row2}>{field('fontSize', c.fontSize)}{weightSelect}</div>}
      {textual && color('color', c.color)}
      {color('backgroundColor', c.background)}
      {field('borderRadius', c.radius)}
    </Section>
  </>;

  const align = raw('textAlign') === 'start' ? 'left' : raw('textAlign') === 'end' ? 'right' : raw('textAlign');
  const widths = (['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'] as const);
  const hasBorder = borderAdded || (!['', 'none', 'hidden'].includes(raw('borderStyle')) && widths.some(key => parseFloat(raw(key)) > 0));
  const flex = raw('display').includes('flex');
  const alignItems = raw('alignItems') === 'normal' ? 'stretch' : raw('alignItems');
  const quadCopy = { link: c.link, all: c.all, top: c.top, right: c.right, bottom: c.bottom, left: c.left };
  return <>
    {content}
    {textual && <Section title={c.typography}>
      {fontSelect}
      <div className={styles.row2}>{field('fontSize', c.fontSize)}{weightSelect}</div>
      <div className={styles.row2}>{field('lineHeight', c.lineHeight)}{field('letterSpacing', c.letterSpacing)}</div>
      <Labeled label={c.textAlign}><StudioSegmented label={c.textAlign} value={align} disabled={disabled} onChange={next => { commit({ textAlign: next }); }} options={[
        { value: 'left', label: c.alignLeft, icon: <AlignLeft size={14} /> }, { value: 'center', label: c.alignCenter, icon: <AlignCenter size={14} /> },
        { value: 'right', label: c.alignRight, icon: <AlignRight size={14} /> }, { value: 'justify', label: c.alignJustify, icon: <AlignJustify size={14} /> }]} /></Labeled>
      {color('color', c.color)}
    </Section>}
    <Section title={c.appearance}>
      {color('backgroundColor', c.background)}
      <div className={styles.row2}>{field('opacity', c.opacity)}{field('borderRadius', c.radius)}</div>
      {hasBorder ? <div className={styles.subsection}>
        <div className={styles.quadHead}><span>{c.border}</span><button type="button" className={styles.iconButtonSmall} aria-label={c.removeBorder} title={c.removeBorder} disabled={disabled} onClick={() => { setBorderAdded(false); commit({ borderStyle: 'none' }); }}><X size={14} /></button></div>
        {color('borderColor', c.color)}
        <div className={styles.row2}>
          <StudioField label={c.borderWidth} ariaLabel={c.border + ': ' + c.borderWidth} value={value('borderTopWidth')} step="borderTopWidth" disabled={disabled} onCommit={next => commit(Object.fromEntries(widths.map(key => [key, next])))} />
          <StudioSelectField label={c.borderStyle} value={raw('borderStyle')} disabled={disabled} options={STUDIO_BORDER_STYLES.map(style => ({ value: style, label: style }))} onCommit={next => commit({ borderStyle: next })} />
        </div>
      </div> : <p className={styles.addRow}>{c.add}<button type="button" disabled={disabled} onClick={() => { setBorderAdded(true); commit({ borderStyle: 'solid', ...Object.fromEntries(widths.map(key => [key, '1px'])) }); }}>{c.addBorder}</button></p>}
    </Section>
    <Section title={c.size}><div className={styles.row2}>{field('width', c.width, 'auto')}{field('height', c.height, 'auto')}</div></Section>
    <Section title={c.spacing}>
      <StudioQuadField label={c.padding} shorthand="padding" keys={studioSideKeys('padding')} values={studioSideKeys('padding').map(value)} copy={quadCopy} disabled={disabled} onCommit={(key, next) => commit({ [key]: next })} />
      <StudioQuadField label={c.margin} shorthand="margin" keys={studioSideKeys('margin')} values={studioSideKeys('margin').map(value)} copy={quadCopy} disabled={disabled} onCommit={(key, next) => commit({ [key]: next })} />
    </Section>
    {target.isLayoutContainer && <Section title={c.layout}>
      {flex && <Labeled label={c.direction}><StudioSegmented label={c.direction} value={raw('flexDirection')} disabled={disabled} onChange={next => { commit({ flexDirection: next }); }} options={[
        { value: 'row', label: c.row, icon: <ArrowRight size={14} /> }, { value: 'column', label: c.column, icon: <ArrowDown size={14} /> },
        { value: 'row-reverse', label: c.rowReverse, icon: <ArrowLeft size={14} /> }, { value: 'column-reverse', label: c.columnReverse, icon: <ArrowUp size={14} /> }]} /></Labeled>}
      <Labeled label={c.justify}><StudioSegmented label={c.justify} value={raw('justifyContent')} disabled={disabled} onChange={next => { commit({ justifyContent: next }); }} options={[
        { value: 'flex-start', label: c.start, icon: <AlignHorizontalJustifyStart size={14} /> }, { value: 'center', label: c.center, icon: <AlignHorizontalJustifyCenter size={14} /> },
        { value: 'flex-end', label: c.end, icon: <AlignHorizontalJustifyEnd size={14} /> }, { value: 'space-between', label: c.between, icon: <AlignHorizontalSpaceBetween size={14} /> }]} /></Labeled>
      <Labeled label={c.align}><StudioSegmented label={c.align} value={alignItems} disabled={disabled} onChange={next => { commit({ alignItems: next }); }} options={[
        { value: 'flex-start', label: c.start, icon: <AlignStartHorizontal size={14} /> }, { value: 'center', label: c.center, icon: <AlignCenterHorizontal size={14} /> },
        { value: 'flex-end', label: c.end, icon: <AlignEndHorizontal size={14} /> }, { value: 'stretch', label: c.stretch, icon: <StretchHorizontal size={14} /> }]} /></Labeled>
      <div className={styles.row2}>{field('gap', c.gap)}</div>
    </Section>}
  </>;
}

/**
 * Page knobs. Inline body styles are the values; without one, the preview's
 * effective (computed) value shows muted as the placeholder, swatch or
 * selected font, and only an edit writes an inline value.
 */
function PageProperties({ c, source, computed, disabled, onPatch, hint = c.pageHint }: { c: StudioEditPanelCopy; source: string; computed?: StudioPageStyles | null; disabled: boolean; onPatch: (patch: ManualEditPatch) => boolean; hint?: string }) {
  const page = useMemo(() => readManualEditStyles(source, '__body__'), [source]);
  const background = studioStyleDisplay('backgroundColor', page.backgroundColor, true);
  const size = studioStyleDisplay('fontSize', page.fontSize, true);
  const font = studioFontSelectValue(page.fontFamily, computed?.fontFamily);
  const commit: Commit = values => {
    const result = studioStyleCommit(values, false, c);
    if (!result.ok) return result.error;
    onPatch({ kind: 'set-style', id: '__body__', styles: result.styles }); return null;
  };
  return <Section title={c.page}>
    <StudioColorField label={c.background} value={background} fallback={computed?.backgroundColor || undefined} pickLabel={c.pickColor} placeholder={c.none} disabled={disabled} onCommit={next => commit({ backgroundColor: next })} />
    <StudioSelectField label={c.font} value={font.value} computed={font.computed} disabled={disabled} options={[{ value: '', label: c.inherit }, ...STUDIO_FONT_OPTIONS]} onCommit={next => commit({ fontFamily: next })} />
    <div className={styles.row2}><StudioField label={c.baseSize} ariaLabel={c.baseSize} value={size} placeholder={computed?.fontSize || '16px'} computed={!!computed?.fontSize} step="fontSize" disabled={disabled} onCommit={next => commit({ fontSize: next })} /></div>
    <p className={styles.hint}>{hint}</p>
  </Section>;
}

const GROUP_TITLES: Record<StudioTweakGroup, 'groupColor' | 'groupType' | 'groupSpace' | 'groupOther'> = { color: 'groupColor', type: 'groupType', space: 'groupSpace', other: 'groupOther' };

/**
 * Tweaks tab: design-wide knobs. The page background, font and base size
 * (the same body patch as the Page section) always come first; below them
 * every root CSS variable of the file, grouped. A variable edit rewrites only
 * that value in the source and goes through the editor's undoable change path.
 */
function TweaksTab({ c, source, pageStyles, disabled, onPatch, onSource, onAskAi }: {
  c: StudioEditPanelCopy; source: string; pageStyles?: StudioPageStyles | null; disabled: boolean; onPatch: (patch: ManualEditPatch) => boolean;
  onSource?: (source: string) => void; onAskAi?: (prompt: string) => void;
}) {
  const tweaks = useMemo(() => studioTweaks(source), [source]);
  const commit = (tweak: StudioTweak) => (value: string): string | null => {
    const error = studioTweakError(tweak, value);
    if (error) return error === 'empty' ? c.tweakEmpty : error === 'color' ? c.tweakColor : c.tweakUnsafe;
    const next = setStudioTweak(source, tweak.name, value);
    if (next !== null) onSource?.(next);
    return null;
  };
  const field = (tweak: StudioTweak) => {
    const common = { label: tweak.name, value: tweak.value, disabled: disabled || !onSource, onCommit: commit(tweak) };
    if (tweak.kind === 'color') return <StudioColorField key={tweak.name} {...common} pickLabel={c.pickColor} />;
    if (tweak.kind === 'font') return <StudioSelectField key={tweak.name} {...common} options={[...STUDIO_FONT_OPTIONS]} />;
    return <StudioField key={tweak.name} {...common} ariaLabel={tweak.name} stepper={tweak.kind === 'length' || tweak.kind === 'number' ? stepStudioTweak : undefined} />;
  };
  return <>
    <PageProperties c={c} source={source} computed={pageStyles} disabled={disabled} onPatch={onPatch} hint={c.tweaksPageHint} />
    {tweaks.length ? <>
      <p className={styles.tweaksHint}>{c.tweaksHint}</p>
      {studioTweakGroups(tweaks).map(({ group, items }) => <Section key={group} title={c[GROUP_TITLES[group]]}>{items.map(field)}</Section>)}
    </> : <Section title={c.tweaksEmptyTitle}>
      <p className={styles.hint}>{c.tweaksEmpty}</p>
      {onAskAi && <button type="button" className={styles.ghostButton} disabled={disabled} onClick={() => onAskAi(c.tweaksPrompt)}><Sparkles size={14} />{c.tweaksAsk}</button>}
    </Section>}
  </>;
}

/**
 * Docked Edit panel. Every property edit is one `set-style` patch carrying
 * only the changed property (Enter, blur, segment click or arrow step); text
 * commits on blur or Ctrl/Cmd+Enter. The Studio header Save stays the only
 * version save, and all commits run through the editor's undoable patch().
 * `onInsertImage` adds the "Add image" menu to the panel header (not for decks);
 * `onExportPng` adds "Export element as PNG" for the selected element.
 * The Tweaks tab writes variable edits through `onSource` (the whole new file
 * source) and hands its "ask AI" prompt to `onAskAi`. `pageStyles` are the
 * preview's computed page styles (capture bridge report) for the page knobs.
 */
export function StudioEditPanel({ locale, source, targets, selected, mode, layersOpen, disabled, onMode, onLayersOpen, onSelect, onPatch, onPickImage, onInsertImage, onExportPng, exportBusy = false, onSource, onAskAi, pageStyles }: {
  locale: keyof typeof studioEditPanelCopy; source: string; targets: ManualEditTarget[]; selected: ManualEditTarget | null; mode: StudioInspectorMode;
  layersOpen: boolean; disabled: boolean; onMode: (mode: StudioInspectorMode) => void; onLayersOpen: (open: boolean) => void;
  onSelect: (target: ManualEditTarget | null) => void; onPatch: (patch: ManualEditPatch) => boolean; onPickImage: () => void;
  onInsertImage?: (source: 'attach' | 'library') => void; onExportPng?: () => void; exportBusy?: boolean;
  onSource?: (source: string) => void; onAskAi?: (prompt: string) => void; pageStyles?: StudioPageStyles | null;
}) {
  const c = studioEditPanelCopy[locale];
  const layers = useMemo(() => studioLayerTree(source, targets), [source, targets]);
  const byId = useMemo(() => new Map(targets.map(target => [target.id, target])), [targets]);
  const path = selected ? studioLayerPath(layers, selected.id) ?? [] : [];
  const parent = path.length > 1 ? byId.get(path[path.length - 2]!.id) : undefined;
  const select = (id: string) => { const target = byId.get(id); if (target) onSelect(target); };
  const commit: Commit = values => {
    if (!selected) return null;
    const result = studioStyleCommit(values, selected.isLayoutContainer, c);
    if (!result.ok) return result.error;
    onPatch({ kind: 'set-style', id: selected.id, styles: result.styles }); return null;
  };
  const crumbs = path.length ? path.slice(-4) : [];
  return <div className={styles.panel} data-testid="studio-edit-panel">
    <header className={styles.head}>
      <strong>{c.properties}</strong>
      <div className={styles.headActions}>
        {onInsertImage && <StudioImageMenu locale={locale} disabled={disabled} onSelect={onInsertImage} />}
        {selected && <>
          {onExportPng && <button type="button" className={styles.iconButton} aria-label={studioCaptureCopy[locale].element} title={studioCaptureCopy[locale].element} disabled={exportBusy} onClick={onExportPng}><ImageDown size={16} /></button>}
          <button type="button" className={styles.iconButton} aria-label={c.parent} title={c.parent} disabled={!parent} onClick={() => parent && onSelect(parent)}><CornerLeftUp size={16} /></button>
          <button type="button" className={styles.iconButton} aria-label={c.remove} title={c.remove} disabled={disabled} onClick={() => { if (onPatch({ kind: 'remove-element', id: selected.id })) onSelect(null); }}><Trash2 size={16} /></button>
          <button type="button" className={styles.iconButton} aria-label={c.deselect} title={c.deselect} onClick={() => onSelect(null)}><X size={16} /></button>
        </>}
      </div>
    </header>
    <nav className={styles.crumbs} aria-label={c.path}>
      {!selected ? <span aria-current="true">{c.page}</span> : crumbs.length ? crumbs.map((layer, index) => <Fragment key={layer.id}>
        {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
        {index === crumbs.length - 1 ? <span aria-current="true" title={layer.name}>{layer.name}</span> : <button type="button" title={layer.name} onClick={() => select(layer.id)}>{layer.name}</button>}
      </Fragment>) : <span aria-current="true">{selected.label || selected.tagName}</span>}
    </nav>
    <div className={styles.modes} role="tablist" aria-label={c.modes}>
      {(['simple', 'pro', 'code', 'tweaks'] as const).map(value => <button key={value} type="button" role="tab" id={'studio-mode-' + value} aria-selected={mode === value} aria-controls="studio-edit-body"
        title={value === 'tweaks' ? c.tweaksTitle : undefined} onClick={() => onMode(value)}>{c[value]}</button>)}
    </div>
    {/* Tweaks are design-wide, so the element tree stays out of the way there. */}
    {mode !== 'tweaks' && <StudioLayerTree layers={layers} selectedId={selected?.id ?? null} open={layersOpen} copy={c} onOpenChange={onLayersOpen} onSelect={select} />}
    <div id="studio-edit-body" className={styles.body} role="tabpanel" aria-labelledby={'studio-mode-' + mode} key={mode === 'tweaks' ? mode : (selected?.id ?? '') + mode}>
      {mode === 'tweaks' ? <TweaksTab c={c} source={source} pageStyles={pageStyles} disabled={disabled} onPatch={onPatch} onSource={onSource} onAskAi={onAskAi} />
        : mode === 'code' ? <CodeTab c={c} source={source} selected={selected} disabled={disabled} onPatch={onPatch} />
        : selected ? <Properties c={c} mode={mode} source={source} target={selected} disabled={disabled} commit={commit} onPatch={onPatch} onMode={onMode} onPickImage={onPickImage} />
          : <PageProperties c={c} source={source} computed={pageStyles} disabled={disabled} onPatch={onPatch} />}
    </div>
  </div>;
}
