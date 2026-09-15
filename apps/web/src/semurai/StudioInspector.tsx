import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import type { ManualEditDraft } from '../components/ManualEditPanel';
import type { ManualEditPatch, ManualEditStyles, ManualEditTarget } from '../edit-mode/types';
import styles from './StudioInspector.module.css';

export const inspectorCopy = {
  pl: { content: 'Treść', image: 'Adres obrazu', alt: 'Opis obrazu', link: 'Adres linku', fontSize: 'Rozmiar tekstu', color: 'Kolor tekstu', backgroundColor: 'Tło', borderRadius: 'Zaokrąglenie', opacity: 'Krycie', fontFamily: 'Czcionka', apply: 'Zastosuj', select: 'Kliknij element na projekcie, aby go edytować.', code: 'HTML elementu', invalid: 'Wprowadź jeden poprawny element HTML.', reset: 'Przywróć', hint: 'Zmiany obejmują wybrany element. Zapisz, aby utworzyć nową wersję.' },
  en: { content: 'Content', image: 'Image URL', alt: 'Image description', link: 'Link URL', fontSize: 'Text size', color: 'Text color', backgroundColor: 'Background', borderRadius: 'Corner radius', opacity: 'Opacity', fontFamily: 'Font', apply: 'Apply', select: 'Click an element on the design to edit it.', code: 'Element HTML', invalid: 'Enter one valid HTML element.', reset: 'Reset', hint: 'Changes affect the selected element. Save to create a new version.' },
  de: { content: 'Inhalt', image: 'Bild-URL', alt: 'Bildbeschreibung', link: 'Link-URL', fontSize: 'Schriftgröße', color: 'Textfarbe', backgroundColor: 'Hintergrund', borderRadius: 'Eckenradius', opacity: 'Deckkraft', fontFamily: 'Schrift', apply: 'Anwenden', select: 'Klicke auf ein Element, um es zu bearbeiten.', code: 'Element-HTML', invalid: 'Gib ein gültiges HTML-Element ein.', reset: 'Zurücksetzen', hint: 'Änderungen betreffen das ausgewählte Element. Speichern erstellt eine neue Version.' },
};

export function StudioInspector({ mode, selected, draft, onDraft, patch, locale, disabled }: {
  mode: 'simple' | 'code'; selected: ManualEditTarget | null; draft: ManualEditDraft;
  onDraft: (draft: ManualEditDraft) => void; patch: (patch: ManualEditPatch) => void; locale: 'pl' | 'en' | 'de'; disabled: boolean;
}) {
  const c = inspectorCopy[locale];
  const [html, setHtml] = useState(''), [error, setError] = useState('');
  useEffect(() => { setHtml(selected?.outerHtml ?? ''); setError(''); }, [selected?.id, selected?.outerHtml]);
  if (!selected) return <p className={styles.empty}>{c.select}</p>;
  const field = (label: string, key: 'text' | 'href' | 'src' | 'alt') => <label>{label}<textarea aria-label={label} rows={key === 'text' ? 4 : 2} value={draft[key]} onChange={event => onDraft({ ...draft, [key]: event.target.value })} /></label>;
  function apply() {
    if (!selected) return;
    if (selected.kind === 'text') patch({ kind: 'set-text', id: selected.id, value: draft.text });
    if (selected.kind === 'link') patch({ kind: 'set-link', id: selected.id, text: draft.text, href: draft.href });
    if (selected.kind === 'image') patch({ kind: 'set-image', id: selected.id, src: draft.src, alt: draft.alt });
    patch({ kind: 'set-style', id: selected.id, styles: draft.styles });
  }
  return <div className={styles.panel} data-testid={'studio-inspector-' + mode}>
    <strong>{selected.label || selected.tagName}</strong>
    {mode === 'code' ? <><label>{c.code}<textarea className={styles.code} aria-label={c.code} spellCheck={false} value={html} onChange={event => setHtml(event.target.value)} /></label>
      <Button disabled={disabled || html === selected.outerHtml} onClick={() => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.body.children.length !== 1) { setError(c.invalid); return; }
        setError(''); patch({ kind: 'set-outer-html', id: selected.id, html });
      }}>{c.apply}</Button></> : <>
      {(selected.kind === 'text' || selected.kind === 'link') && field(c.content, 'text')}
      {selected.kind === 'link' && field(c.link, 'href')}
      {selected.kind === 'image' && <>{field(c.image, 'src')}{field(c.alt, 'alt')}</>}
      {(['fontFamily', 'fontSize', 'color', 'backgroundColor', 'borderRadius', 'opacity'] as const).map(key => <label key={key}>{c[key]}<input aria-label={c[key]} value={draft.styles[key]} placeholder={key === 'fontSize' ? '34px' : undefined} onChange={event => onDraft({ ...draft, styles: { ...draft.styles, [key as keyof ManualEditStyles]: event.target.value } })} /></label>)}
      <Button disabled={disabled} onClick={apply}>{c.apply}</Button>
    </>}
    {error && <p role="alert">{error}</p>}<small>{c.hint}</small>
  </div>;
}
