import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { ChevronDown, Images, Paperclip } from 'lucide-react';
import { mediaCopy } from './StudioMedia';
import { studioImageCopy } from './StudioImagePicker';
import styles from './StudioImageMenu.module.css';

export function StudioImageMenu({ locale, disabled, onSelect }: {
  locale: keyof typeof mediaCopy; disabled: boolean; onSelect: (source: 'attach' | 'library') => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={root} className={styles.menu} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Button ref={trigger} disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>{studioImageCopy[locale].add}<ChevronDown size={14} /></Button>
    {open && !disabled && <div role="menu" aria-label={studioImageCopy[locale].add} className={styles.options} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
      <Button role="menuitem" onClick={() => { setOpen(false); trigger.current?.focus(); onSelect('attach'); }}><Paperclip size={16} />{mediaCopy[locale].attach}</Button>
      <Button role="menuitem" onClick={() => { setOpen(false); trigger.current?.focus(); onSelect('library'); }}><Images size={16} />{mediaCopy[locale].library}</Button>
    </div>}
  </div>;
}
