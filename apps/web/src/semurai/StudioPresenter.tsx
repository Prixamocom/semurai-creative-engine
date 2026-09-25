'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog } from '@open-design/components';
import { ArrowLeft, ArrowRight, Maximize2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { studioPreviewSource, studioSlideCount } from './studio-preview';
import styles from './StudioPresenter.module.css';

const copy = {
  pl: { title: 'Widok prezentera', current: 'Bieżący slajd', next: 'Następny slajd', notes: 'Notatki prelegenta', empty: 'Brak notatek do tego slajdu.', end: 'Ostatni slajd', previous: 'Poprzedni slajd', close: 'Zakończ prezentację', fullscreen: 'Pokaż slajd na pełnym ekranie', timer: 'Czas prezentacji', pause: 'Zatrzymaj zegar', resume: 'Uruchom zegar', reset: 'Wyzeruj zegar', hint: '← → slajdy · Home początek · End koniec · Esc zamknij', fullscreenError: 'Przeglądarka nie pozwoliła włączyć pełnego ekranu.' },
  en: { title: 'Presenter view', current: 'Current slide', next: 'Next slide', notes: 'Speaker notes', empty: 'No notes for this slide.', end: 'Last slide', previous: 'Previous slide', close: 'End presentation', fullscreen: 'Show slide in full screen', timer: 'Presentation time', pause: 'Pause timer', resume: 'Start timer', reset: 'Reset timer', hint: '← → slides · Home first · End last · Esc close', fullscreenError: 'Your browser did not allow full screen.' },
  de: { title: 'Referentenansicht', current: 'Aktuelle Folie', next: 'Nächste Folie', notes: 'Sprechernotizen', empty: 'Keine Notizen für diese Folie.', end: 'Letzte Folie', previous: 'Vorherige Folie', close: 'Präsentation beenden', fullscreen: 'Folie im Vollbild anzeigen', timer: 'Präsentationszeit', pause: 'Timer anhalten', resume: 'Timer starten', reset: 'Timer zurücksetzen', hint: '← → Folien · Home Anfang · End Ende · Esc schließen', fullscreenError: 'Der Browser hat den Vollbildmodus nicht zugelassen.' },
};

export function StudioPresenter({ source, notes, initialSlide, locale, onClose }: {
  source: string; notes: readonly (string | null)[]; initialSlide: number; locale: keyof typeof copy; onClose: (slide: number) => void;
}) {
  const c = copy[locale]; const count = useMemo(() => studioSlideCount(source), [source]);
  const [slide, setSlide] = useState(Math.max(0, Math.min(initialSlide, count - 1)));
  const current = useRef<HTMLIFrameElement>(null); const nextFrame = useRef<HTMLIFrameElement>(null); const stage = useRef<HTMLDivElement>(null); const controls = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null); const slideRef = useRef(slide); slideRef.current = slide;
  const [running, setRunning] = useState(true); const [seconds, setSeconds] = useState(0); const [error, setError] = useState('');
  const accumulated = useRef(0); const started = useRef(Date.now());
  const sourceDoc = useMemo(() => studioPreviewSource(source, initialSlide, false, true), [source, initialSlide]);
  const nextDoc = useMemo(() => slide + 1 < count ? studioPreviewSource(source, slide + 1, false, true) : '', [source, slide, count]);
  function go(index: number) {
    const next = Math.max(0, Math.min(index, count - 1)); setSlide(next); slideRef.current = next;
    current.current?.contentWindow?.postMessage({ type: 'od:slide', action: 'go', index: next }, '*');
  }
  function pause() {
    accumulated.current += (Date.now() - started.current) / 1000; setSeconds(accumulated.current); setRunning(false);
  }
  useEffect(() => {
    if (!running) return;
    started.current = Date.now();
    const timer = setInterval(() => setSeconds(accumulated.current + (Date.now() - started.current) / 1000), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const fullscreenChanged = () => { if (!document.fullscreenElement) closeButton.current?.focus(); };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    const previous = document.activeElement as HTMLElement | null; closeButton.current?.focus();
    return () => { document.removeEventListener('fullscreenchange', fullscreenChanged); previous?.focus(); };
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== current.current?.contentWindow || event.data?.type !== 'od:slide-state') return;
      if (Number.isInteger(event.data.active) && event.data.active >= 0 && event.data.active < count) { setSlide(event.data.active); slideRef.current = event.data.active; }
    };
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLSelectElement) return;
      const index = slideRef.current;
      if (['ArrowRight', 'PageDown'].includes(event.key)) { event.preventDefault(); go(index + 1); }
      else if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); go(index - 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(count - 1); }
      else if (event.key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); onClose(index); }
      else if (event.key === 'Tab') {
        const focusable = [...controls.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select') ?? []];
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('message', receive); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('message', receive); window.removeEventListener('keydown', key); };
  }, [count, onClose]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return <Dialog ariaLabel={c.title} includeChromeClassName={false} className={styles.presenter} backdropClassName={styles.backdrop} closeOnBackdrop={false}>
    <div ref={controls} className={styles.layout}>
      <header><strong>{c.title}</strong><div className={styles.timer}><output aria-label={c.timer}>{time}</output><Button title={running ? c.pause : c.resume} onClick={() => running ? pause() : setRunning(true)}>{running ? <Pause size={16} /> : <Play size={16} />}</Button><Button title={c.reset} onClick={() => { accumulated.current = 0; started.current = Date.now(); setSeconds(0); }}><RotateCcw size={16} /></Button></div><Button ref={closeButton} title={c.close} onClick={() => onClose(slide)}><X size={20} /></Button></header>
      <div className={styles.content}><section className={styles.current}><div ref={stage} className={styles.stage}><iframe ref={current} title={c.current} tabIndex={-1} sandbox="allow-scripts" srcDoc={sourceDoc} onLoad={() => current.current?.contentWindow?.postMessage({ type: 'od:slide', action: 'go', index: slideRef.current }, '*')} /></div><nav><Button title={c.previous} disabled={slide <= 0} onClick={() => go(slide - 1)}><ArrowLeft size={18} /></Button><select aria-label={c.current} value={slide} onChange={event => go(Number(event.target.value))}>{Array.from({ length: count }, (_, i) => <option key={i} value={i}>{i + 1} / {count}</option>)}</select><Button title={c.next} disabled={slide >= count - 1} onClick={() => go(slide + 1)}><ArrowRight size={18} /></Button><Button className={styles.fullscreen} title={c.fullscreen} onClick={() => { setError(''); void stage.current?.requestFullscreen().catch(() => setError(c.fullscreenError)); }}><Maximize2 size={16} />{c.fullscreen}</Button></nav></section>
      <aside><section className={styles.next}><h2>{c.next}</h2>{nextDoc ? <iframe ref={nextFrame} title={c.next} tabIndex={-1} sandbox="allow-scripts" srcDoc={nextDoc} onLoad={() => nextFrame.current?.contentWindow?.postMessage({ type: 'od:slide', action: 'go', index: slideRef.current + 1 }, '*')} /> : <p>{c.end}</p>}</section><section className={styles.notes}><h2>{c.notes}</h2><p>{notes[slide] || c.empty}</p></section></aside></div>
      <footer>{error ? <span role="alert">{error}</span> : c.hint}</footer>
    </div>
  </Dialog>;
}
