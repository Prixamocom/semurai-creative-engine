'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';
import { Paperclip, Images, X } from 'lucide-react';
import styles from './StudioMedia.module.css';

export interface StudioImage { id: string; title: string; description: string; dataUrl: string }
export const mediaCopy = {
  pl: { attach: 'Załącz zdjęcia', library: 'Biblioteka mediów', auto: 'Dobierz zdjęcia z mojej biblioteki', search: 'Szukaj zdjęć', empty: 'Brak pasujących zdjęć.', more: 'Więcej', remove: 'Usuń zdjęcie', loading: 'Wczytuję zdjęcia…', error: 'Nie udało się wczytać zdjęcia. Użyj PNG, JPG lub WebP do 6 MB.' },
  en: { attach: 'Attach images', library: 'Media library', auto: 'Find matching photos in my library', search: 'Search images', empty: 'No matching images.', more: 'More', remove: 'Remove image', loading: 'Loading images…', error: 'Could not load image. Use PNG, JPG or WebP up to 6 MB.' },
  de: { attach: 'Bilder anhängen', library: 'Mediathek', auto: 'Passende Bilder in meiner Mediathek finden', search: 'Bilder suchen', empty: 'Keine passenden Bilder.', more: 'Mehr', remove: 'Bild entfernen', loading: 'Bilder werden geladen…', error: 'Bild konnte nicht geladen werden. PNG, JPG oder WebP bis 6 MB verwenden.' },
};

export function StudioMedia({ images, onChange, useLibrary, onLibrary, api, locale, disabled, onBusy, picker = false }: {
  images: StudioImage[]; onChange: (images: StudioImage[]) => void; useLibrary: boolean; onLibrary: (value: boolean) => void;
  api: (path: string, method?: string, body?: unknown) => Promise<{ data: StudioImage | StudioImage[]; has_more?: boolean }>;
  locale: 'pl' | 'en' | 'de'; disabled: boolean; onBusy: (busy: boolean) => void; picker?: boolean;
}) {
  const c = mediaCopy[locale]; const file = useRef<HTMLInputElement>(null); const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [items, setItems] = useState<StudioImage[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [page, setPage] = useState(1); const [more, setMore] = useState(false);
  const limit = picker ? 1 : 6;
  async function work(action: () => Promise<void>) {
    setBusy(true); onBusy(true); setError(false);
    try { await action(); } catch { setError(true); } finally { setBusy(false); onBusy(false); }
  }
  async function search(next = 1) {
    await work(async () => { const result = await api('media/search', 'POST', { search: query, page: next }); const values = result.data as StudioImage[]; setItems(next === 1 ? values : [...items, ...values]); setMore(Boolean(result.has_more)); setPage(next); });
  }
  async function upload(files: File[]) {
    if (busy || disabled) return;
    await work(async () => {
      const selected = [...images];
      for (const item of files.slice(0, limit - images.length)) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(item.type) || item.size > 6_000_000) throw new Error('Invalid image');
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(item); });
        const result = (await api('media/upload', 'POST', { image_data: image, title: item.name })).data as StudioImage;
        if (!selected.some(value => value.id === result.id)) selected.push(result);
        onChange([...selected]);
      }
    });
  }
  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form) return;
    const paste = (event: ClipboardEvent) => { if (event.clipboardData?.files.length) { event.preventDefault(); void upload([...event.clipboardData.files]); } };
    const drop = (event: DragEvent) => { event.preventDefault(); if (event.dataTransfer?.files.length) void upload([...event.dataTransfer.files]); };
    const drag = (event: DragEvent) => event.preventDefault();
    form.addEventListener('paste', paste); form.addEventListener('drop', drop); form.addEventListener('dragover', drag);
    return () => { form.removeEventListener('paste', paste); form.removeEventListener('drop', drop); form.removeEventListener('dragover', drag); };
  }, [images, disabled, busy, api]);
  return <div ref={root} className={styles.media}>
    <div className={styles.actions}><Button disabled={disabled || busy || images.length >= limit} onClick={() => file.current?.click()} title={c.attach}><Paperclip size={16} />{c.attach}</Button><Button disabled={disabled || busy} onClick={() => { setOpen(!open); if (!open) void search(); }} title={c.library}><Images size={16} />{c.library}</Button></div>
    <input hidden ref={file} type="file" accept="image/png,image/jpeg,image/webp" multiple={!picker} onChange={event => { void upload([...event.target.files ?? []]); event.target.value = ''; }} />
    <div className={styles.grid}>{images.map(item => <figure key={item.id}><img src={item.dataUrl} alt={item.title} /><figcaption>{item.title}</figcaption><Button disabled={disabled} title={c.remove} onClick={() => onChange(images.filter(value => value.id !== item.id))}><X size={12} /></Button></figure>)}</div>
    {!picker && <label className={styles.auto}><input type="checkbox" checked={useLibrary} disabled={disabled} onChange={event => onLibrary(event.target.checked)} />{c.auto}</label>}
    {open && <section><div className={styles.actions}><input aria-label={c.search} placeholder={c.search} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} /><Button disabled={busy || disabled} onClick={() => { void search(); }}>{c.search}</Button></div>{!busy && !items.length && <p>{c.empty}</p>}<div className={styles.grid}>{items.map(item => <Button key={item.id} disabled={disabled || busy || (!picker && images.length >= limit) || images.some(value => value.id === item.id)} onClick={() => onChange(picker ? [item] : [...images, item])}><img src={item.dataUrl} alt={item.title} /><span>{item.title}</span></Button>)}</div>{more && <Button disabled={busy || disabled} onClick={() => { void search(page + 1); }}>{c.more}</Button>}</section>}
    {busy && <p role="status">{c.loading}</p>}{error && <p role="alert">{c.error}</p>}
  </div>;
}
