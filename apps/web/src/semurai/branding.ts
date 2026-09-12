/** Semurai presentation adapter. Upstream identifiers and stored data stay intact. */
export const SEMURAI_CREATIVE = process.env.NEXT_PUBLIC_SEMURAI_CREATIVE === '1';

export const PRODUCT_NAME = SEMURAI_CREATIVE ? 'Semurai Creative' : 'OpenDesign';

/** Apply only to bundled UI labels, before interpolating any user content. */
export function productLabel(label: string, enabled = SEMURAI_CREATIVE): string {
  if (!enabled) return label;
  return label
    .replace(/\bOpen\s?Design\b/g, 'Semurai Creative')
    .replace(/\bOD (Project|Artifact|Daemon|Design System)\b/g, 'Creative $1');
}
