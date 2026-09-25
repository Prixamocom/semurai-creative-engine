import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Link2, PanelBottom, PanelLeft, PanelRight, PanelTop, Unlink2 } from 'lucide-react';
import { stepStudioValue, studioHexColor, type StudioStyleKey } from './studio-edit-values';
import styles from './StudioEditPanel.module.css';

/** Returns an inline error message, or null when the value was committed. */
export type StudioCommit = (value: string) => string | null;

/**
 * Compact 28px field with the label inside on the left. Commits on Enter or
 * blur (only when the text changed), reverts on Escape and, for numeric
 * properties, steps with ArrowUp/ArrowDown (Shift = x10) committing each step.
 * `stepper` replaces the style-key stepping for values that are not element
 * styles (the design variables on the Tweaks tab).
 */
export function StudioField({ label, icon, ariaLabel, value, placeholder, step, stepper, adornment, disabled, onCommit }: {
  label?: string; icon?: ReactNode; ariaLabel: string; value: string; placeholder?: string; step?: StudioStyleKey;
  stepper?: (value: string, direction: 1 | -1, large: boolean) => string | null; adornment?: ReactNode; disabled?: boolean; onCommit: StudioCommit;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const edited = useRef(false);
  const errorId = useId();
  useEffect(() => { if (!edited.current) { setDraft(value); setError(''); } }, [value]);
  function commit(next = draft) {
    edited.current = false;
    if (next.trim() === value.trim()) { setError(''); return; }
    const failure = onCommit(next.trim());
    setError(failure ?? '');
    if (failure) edited.current = true;
  }
  return <div className={styles.fieldWrap}>
    <label className={styles.field} data-invalid={error ? true : undefined} title={label ? ariaLabel : undefined}>
      {icon ? <span className={styles.fieldIcon} aria-hidden="true">{icon}</span> : label && <span className={styles.fieldLabel}>{label}</span>}
      {adornment}
      <input className={styles.fieldInput} value={draft} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
        disabled={disabled} spellCheck={false} autoComplete="off" inputMode={step ? 'decimal' : undefined}
        onChange={event => { edited.current = true; setDraft(event.target.value); }}
        onBlur={() => { if (edited.current) commit(); }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          else if (event.key === 'Escape') { event.preventDefault(); edited.current = false; setDraft(value); setError(''); }
          else if ((step || stepper) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            const direction = event.key === 'ArrowUp' ? 1 : -1;
            const next = stepper ? stepper(draft, direction, event.shiftKey) : stepStudioValue(step!, draft, direction, event.shiftKey);
            if (next === null) return;
            event.preventDefault(); setDraft(next); commit(next);
          }
        }} />
    </label>
    {error && <p id={errorId} className={styles.fieldError} role="alert">{error}</p>}
  </div>;
}

/** Color field: swatch opening the native picker plus a hex text value. */
export function StudioColorField({ label, value, pickLabel, placeholder, disabled, onCommit }: { label: string; value: string; pickLabel: string; placeholder?: string; disabled?: boolean; onCommit: StudioCommit }) {
  const picker = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit); commitRef.current = onCommit;
  // Short hex and rgb() values still open the picker on their color.
  const normalized = studioHexColor(value);
  const hex = /^#[0-9a-f]{6}$/.test(normalized) ? normalized : '#000000';
  // Uncontrolled on purpose: the native `change` event fires once the picker
  // closes, while React's onChange follows `input` and would commit (and
  // reload the preview) on every drag step.
  useEffect(() => { if (picker.current) picker.current.value = hex; }, [hex]);
  useEffect(() => {
    const input = picker.current; if (!input) return;
    const changed = () => { if (input.value.toLowerCase() !== value) commitRef.current(input.value.toLowerCase()); };
    input.addEventListener('change', changed); return () => input.removeEventListener('change', changed);
  }, [value]);
  const swatch = <span className={styles.swatch} data-empty={value ? undefined : true} style={value ? { background: value } : undefined}>
    <input ref={picker} type="color" aria-label={pickLabel + ': ' + label} title={pickLabel} disabled={disabled} defaultValue={hex} />
  </span>;
  return <StudioField label={label} ariaLabel={label} value={value} placeholder={placeholder ?? "#rrggbb"} adornment={swatch} disabled={disabled} onCommit={onCommit} />;
}

export interface StudioOption { value: string; label: string }
/** Native select with the inside label; commits immediately on change. */
export function StudioSelectField({ label, value, options, disabled, onCommit }: { label: string; value: string; options: StudioOption[]; disabled?: boolean; onCommit: StudioCommit }) {
  const [error, setError] = useState('');
  useEffect(() => setError(''), [value]);
  const listed = options.some(option => option.value === value) ? options : [...options, { value, label: value.split(',')[0]!.replace(/["']/g, '').trim() || value }];
  return <div className={styles.fieldWrap}>
    <label className={styles.field} data-invalid={error ? true : undefined}>
      <span className={styles.fieldLabel}>{label}</span>
      <select className={styles.fieldInput} aria-label={label} value={value} disabled={disabled} onChange={event => { setError(onCommit(event.target.value) ?? ''); }}>
        {listed.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown className={styles.fieldChevron} size={14} aria-hidden="true" />
    </label>
    {error && <p className={styles.fieldError} role="alert">{error}</p>}
  </div>;
}

export interface StudioSegment { value: string; label: string; icon?: ReactNode }
/** Segmented control for enumerations; each click commits one value. */
export function StudioSegmented({ label, value, options, disabled, onChange }: { label: string; value: string; options: StudioSegment[]; disabled?: boolean; onChange: (value: string) => void }) {
  return <div className={styles.segmented} role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} aria-label={option.label} title={option.label} disabled={disabled}
      onClick={() => { if (option.value !== value) onChange(option.value); }}>{option.icon ?? option.label}</button>)}
  </div>;
}

/** Padding/margin editor: one linked value (shorthand) or four sides. */
export function StudioQuadField({ label, shorthand, keys, values, copy, disabled, onCommit }: {
  label: string; shorthand: StudioStyleKey; keys: [StudioStyleKey, StudioStyleKey, StudioStyleKey, StudioStyleKey]; values: string[];
  copy: { link: string; all: string; top: string; right: string; bottom: string; left: string }; disabled?: boolean;
  onCommit: (key: StudioStyleKey, value: string) => string | null;
}) {
  const uniform = values.every(value => value === values[0]);
  const [linked, setLinked] = useState(uniform);
  const sides = [[copy.top, PanelTop], [copy.right, PanelRight], [copy.bottom, PanelBottom], [copy.left, PanelLeft]] as const;
  return <div className={styles.quad}>
    <div className={styles.quadHead}><span>{label}</span>
      <button type="button" className={styles.iconButtonSmall} aria-pressed={linked} aria-label={copy.link} title={copy.link} onClick={() => setLinked(!linked)}>{linked ? <Link2 size={14} /> : <Unlink2 size={14} />}</button>
    </div>
    {linked ? <StudioField label={copy.all} ariaLabel={label + ': ' + copy.all} value={uniform ? values[0] ?? '' : ''} placeholder={uniform ? undefined : values.join(' ')} step={shorthand} disabled={disabled} onCommit={value => onCommit(shorthand, value)} />
      : <div className={styles.row4}>{sides.map(([side, Icon], index) => <StudioField key={side} icon={<Icon size={14} />} ariaLabel={label + ': ' + side} value={values[index] ?? ''} step={keys[index]} disabled={disabled} onCommit={value => onCommit(keys[index]!, value)} />)}</div>}
  </div>;
}
