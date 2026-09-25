'use client';

import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import styles from './StudioChrome.module.css';

export type StudioButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';
export interface StudioButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: StudioButtonVariant;
  /** Square 28px icon-only button; give it an aria-label and a title. */
  icon?: boolean;
}

const join = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** The one button primitive of the Studio chrome: 28px, 16px icons, token colors. */
export const StudioButton = forwardRef<HTMLButtonElement, StudioButtonProps>(function StudioButton({ variant = 'ghost', icon = false, className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={join(styles.button, styles[variant], icon && styles.icon, className)} {...props} />;
});

/** Segmented group of StudioButtons; the pressed button (aria-pressed) is raised. */
export function StudioButtonGroup({ label, accent = false, className, children }: { label: string; accent?: boolean; className?: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={join(styles.group, accent && styles.accentGroup, className)}>{children}</div>;
}

/** Count bubble in the accent color, e.g. open comments on the Comment tool. */
export function StudioBadge({ children }: { children: ReactNode }) {
  return <span className={styles.badge} aria-hidden="true">{children}</span>;
}

/**
 * Menu button with a styled popover. Opens on click or ArrowDown, moves with
 * the arrow keys/Home/End, closes on Escape (focus returns to the trigger),
 * Tab, an outside pointer press or after an item is chosen.
 */
export function StudioMenu({ label, trigger, title, ariaLabel, variant = 'ghost', icon = false, disabled = false, align = 'start', className, triggerClassName, children }: {
  label: string; trigger: ReactNode; title?: string; ariaLabel?: string; variant?: StudioButtonVariant; icon?: boolean; disabled?: boolean;
  align?: 'start' | 'end'; className?: string; triggerClassName?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const items = () => [...root.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []];
  useEffect(() => {
    if (!open) return;
    const list = items();
    (list.find(item => item.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    // A press inside the preview iframe never reaches this document; the window blurs instead.
    const blurred = () => setOpen(false);
    document.addEventListener('pointerdown', outside); window.addEventListener('blur', blurred);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', blurred); };
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  function close() { setOpen(false); button.current?.focus(); }
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    const list = items(); const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : null;
    if (next === null || !list.length) return;
    event.preventDefault(); list[(next + list.length) % list.length]?.focus();
  }
  return <div ref={root} className={join(styles.menuRoot, className)} onBlur={event => { if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <StudioButton ref={button} variant={variant} icon={icon} title={title} aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={disabled} className={triggerClassName} onClick={() => setOpen(!open)}
      onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>{trigger}</StudioButton>
    {open && <div id={id} role="menu" aria-label={label} className={styles.menu} data-align={align} onKeyDown={keyDown}
      onClick={event => { const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[role^="menuitem"]'); if (item && !item.disabled) close(); }}>{children}</div>}
  </div>;
}

export function StudioMenuItem({ icon, hint, checked, danger = false, disabled = false, onSelect, children }: {
  icon?: ReactNode; hint?: string; checked?: boolean; danger?: boolean; disabled?: boolean; onSelect: () => void; children: ReactNode;
}) {
  return <button type="button" role={checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={checked} tabIndex={-1} disabled={disabled}
    className={join(styles.item, danger && styles.itemDanger)} onClick={onSelect}>
    {icon}<span className={styles.itemLabel}>{children}</span>
    {hint && <kbd className={styles.itemHint}>{hint}</kbd>}
    {checked !== undefined && <Check size={16} className={styles.itemCheck} data-checked={checked || undefined} aria-hidden="true" />}
  </button>;
}

/** Labelled set of menu items, e.g. the theme choice in the overflow menu. */
export function StudioMenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={styles.menuGroup}><div className={styles.menuGroupLabel} aria-hidden="true">{label}</div>{children}</div>;
}

export function StudioMenuSeparator() {
  return <div role="separator" className={styles.separator} />;
}
