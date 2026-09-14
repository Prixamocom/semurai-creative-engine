'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Button, Dialog } from '@open-design/components';
import { X } from 'lucide-react';
import { mediaCopy, StudioMedia, type StudioImage } from './StudioMedia';
import { acceptsStudioImage, type StudioImagePlacement } from './studio-images';
import type { ManualEditTarget } from '../edit-mode/types';
import styles from './StudioImagePicker.module.css';

export const studioImageCopy = {
  pl: { title: 'Zdjęcie w projekcie', add: 'Dodaj zdjęcie', replace: 'Zamień zaznaczone zdjęcie', inside: 'W zaznaczonym elemencie', end: 'Na końcu treści', location: 'Umiejscowienie', alt: 'Tekst alternatywny', hint: 'Opisz zawartość zdjęcia. Dla obrazu dekoracyjnego pozostaw puste.', apply: 'Wstaw zdjęcie', close: 'Zamknij', error: 'Projekt lub zaznaczenie zmieniły się. Zamknij okno i wybierz miejsce ponownie.' },
  en: { title: 'Project image', add: 'Add image', replace: 'Replace selected image', inside: 'Inside selected element', end: 'At the end of the content', location: 'Placement', alt: 'Alternative text', hint: 'Describe the image. Leave empty for a decorative image.', apply: 'Insert image', close: 'Close', error: 'The project or selection changed. Close this window and select a location again.' },
  de: { title: 'Projektbild', add: 'Bild hinzufügen', replace: 'Ausgewähltes Bild ersetzen', inside: 'Im ausgewählten Element', end: 'Am Ende des Inhalts', location: 'Position', alt: 'Alternativtext', hint: 'Beschreibe das Bild. Für dekorative Bilder leer lassen.', apply: 'Bild einfügen', close: 'Schließen', error: 'Projekt oder Auswahl wurden geändert. Schließe das Fenster und wähle die Position erneut.' },
};

export function StudioImagePicker({ target, locale, api, onApply, onClose, initialSource }: {
  target: ManualEditTarget | null; locale: keyof typeof studioImageCopy; api: ComponentProps<typeof StudioMedia>['api'];
  onApply: (image: StudioImage, alt: string, placement: StudioImagePlacement) => boolean; onClose: () => void;
  initialSource?: 'attach' | 'library';
}) {
  const c = studioImageCopy[locale]; const root = useRef<HTMLDivElement>(null);
  const title = initialSource === 'library' ? mediaCopy[locale].library : c.title;
  const canReplace = target?.tagName.toLowerCase() === 'img'; const canInsert = !!target && acceptsStudioImage(target.tagName);
  const [images, setImages] = useState<StudioImage[]>([]); const [alt, setAlt] = useState('');
  const [placement, setPlacement] = useState<StudioImagePlacement>(canReplace ? 'replace' : canInsert ? 'inside' : 'end');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <Dialog ariaLabel={title} className={styles.dialog} onClose={busy ? undefined : onClose} closeOnEscape>
    <div ref={root} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([hidden]):not(:disabled),select:not(:disabled)')];
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className={styles.header}><h2>{title}</h2><Button title={c.close} disabled={busy} onClick={onClose}><X size={18} /></Button></header>
      <StudioMedia picker initialSource={initialSource} images={images} onChange={value => { setImages(value); setAlt(value[0]?.description || value[0]?.title || ''); }} useLibrary={false} onLibrary={() => {}} api={api} locale={locale} disabled={false} onBusy={setBusy} />
      <label className={styles.field}>{c.location}<select value={placement} onChange={event => setPlacement(event.target.value as StudioImagePlacement)}>{canReplace && <option value="replace">{c.replace}</option>}{canInsert && <option value="inside">{c.inside}</option>}<option value="end">{c.end}</option></select></label>
      <label className={styles.field}>{c.alt}<input value={alt} maxLength={1000} onChange={event => setAlt(event.target.value)} /></label><p className={styles.hint}>{c.hint}</p>
      {error && <p role="alert">{c.error}</p>}
      <footer className={styles.footer}><Button disabled={busy} onClick={onClose}>{c.close}</Button><Button disabled={busy || !images[0]} onClick={() => { if (images[0]) setError(!onApply(images[0], alt, placement)); }}>{placement === 'replace' ? c.replace : c.apply}</Button></footer>
    </div>
  </Dialog>;
}
