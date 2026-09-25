'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from '@open-design/components';
import { X } from 'lucide-react';
import { StudioButton } from './StudioButton';
import styles from './StudioChrome.module.css';

/**
 * Short confirmation at the bottom of the Studio, optionally with one action
 * (e.g. "Copy to clipboard" after a PNG export). It closes itself after
 * `timeout` ms unless the pointer or focus is inside it.
 */
export function StudioToast({ message, detail, action, tone = 'default', closeLabel, timeout = 8000, onAction, onClose }: {
  message: string; detail?: string; action?: string; tone?: 'default' | 'error'; closeLabel: string; timeout?: number;
  onAction?: () => void; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const start = () => { clearTimeout(timer); timer = setTimeout(() => close.current(), timeout); };
    const element = root.current;
    const stop = () => clearTimeout(timer);
    const resume = () => { if (!element?.matches(':hover') && !element?.contains(document.activeElement)) start(); };
    start();
    element?.addEventListener('pointerenter', stop); element?.addEventListener('focusin', stop);
    element?.addEventListener('pointerleave', resume); element?.addEventListener('focusout', resume);
    return () => { clearTimeout(timer); element?.removeEventListener('pointerenter', stop); element?.removeEventListener('focusin', stop); element?.removeEventListener('pointerleave', resume); element?.removeEventListener('focusout', resume); };
  }, [timeout, message]);
  return <div ref={root} className={styles.toast} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
    <div className={styles.toastText}><span>{message}</span>{detail && <small>{detail}</small>}</div>
    {action && onAction && <StudioButton variant="secondary" onClick={onAction}>{action}</StudioButton>}
    <StudioButton icon title={closeLabel} aria-label={closeLabel} onClick={onClose}><X size={16} /></StudioButton>
  </div>;
}

/** Modal yes/no question in Studio styling. Escape is handled by the caller. */
export function StudioConfirm({ title, children, cancel, confirm, busy = false, onCancel, onConfirm }: {
  title: string; children: ReactNode; cancel: string; confirm: string; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return <Dialog role="alertdialog" ariaLabel={title} className={styles.confirm} onClose={busy ? undefined : onCancel}>
    <h2>{title}</h2>
    <p>{children}</p>
    <footer>
      <StudioButton ref={cancelButton} variant="secondary" disabled={busy} onClick={onCancel}>{cancel}</StudioButton>
      <StudioButton variant="primary" disabled={busy} onClick={onConfirm}>{confirm}</StudioButton>
    </footer>
  </Dialog>;
}
