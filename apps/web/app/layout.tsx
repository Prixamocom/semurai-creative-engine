import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import { PRODUCT_NAME, SEMURAI_CREATIVE } from '../src/semurai/branding';
import '@excalidraw/excalidraw/index.css';
import '../src/index.css';
import '../src/styles/home/index.css';

const productIcon = SEMURAI_CREATIVE
  ? 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e63535"/><text x="32" y="47" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="44" fill="white">S</text></svg>')
  : '/app-icon.png';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  icons: {
    icon: productIcon,
    apple: productIcon,
  },
};

export const viewport: Viewport = {
  themeColor: '#f7f7f7',
};

/**
 * Inline script that runs before React hydrates so the first paint already
 * carries the app's appearance — no flash of unstyled content.
 *
 * `data-theme` is pinned to `light` unconditionally, and deliberately OUTSIDE
 * the try/catch: OpenDesign ships light-only (product removed the theme
 * setting), and a stored `dark` / `system` from the old picker must never reach
 * the document. Every dark CSS rule is gated on the attribute being absent, so
 * a storage read that throws must still leave the attribute stamped.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
const themeInitScript = `(function(){document.documentElement.setAttribute('data-theme','light');try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#353535';if(c.configMigrationVersion!==3&&(a==='#87ea5c'||a==='#c96442'))a='#353535';var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 82%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 12%, var(--bg-subtle))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 6%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 86%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>
          {SEMURAI_CREATIVE ? children : <AnalyticsProvider>{children}</AnalyticsProvider>}
        </I18nProvider>
      </body>
    </html>
  );
}
