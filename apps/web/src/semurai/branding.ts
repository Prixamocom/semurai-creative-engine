/** Semurai presentation adapter. Upstream identifiers and stored data stay intact. */
// Semurai branding is the default for this fork. NEXT_PUBLIC_SEMURAI_CREATIVE=0
// opts out only to compare against upstream behavior.
export const SEMURAI_CREATIVE = process.env.NEXT_PUBLIC_SEMURAI_CREATIVE !== '0';

export const SEMURAI_PRODUCT_NAME = 'Semurai Creative';

export const PRODUCT_NAME = SEMURAI_CREATIVE ? SEMURAI_PRODUCT_NAME : 'OpenDesign';

/** Apply only to bundled UI labels, before interpolating any user content. */
export function productLabel(label: string, enabled = SEMURAI_CREATIVE): string {
  if (!enabled) return label;
  return label
    .replace(/\bOpen[\s-]?Design\b/g, SEMURAI_PRODUCT_NAME)
    .replace(/\bOPEN[\s-]?DESIGN\b/g, SEMURAI_PRODUCT_NAME.toUpperCase())
    .replace(/\bOD (Project|Artifact|Daemon|Design System)\b/g, 'Creative $1');
}
