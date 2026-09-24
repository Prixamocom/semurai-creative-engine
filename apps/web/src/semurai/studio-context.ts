import { SEMURAI_PRODUCT_NAME } from './branding';

export interface StudioContext {
  projectId: string;
  workspaceId: string;
  project: {
    title: string;
    artifactType: string;
    locale: string;
    sourceLocale: string;
    uiLocale: 'en' | 'pl' | 'de';
    direction: 'ltr' | 'rtl';
    currentVersion: number;
    coreOrigin: string;
  };
  returnUrl: string;
  expiresAt: number;
}

/** Browser tab title for a Studio project: "<project name> | Semurai Creative". */
export function studioDocumentTitle(projectTitle?: string | null): string {
  const name = (projectTitle ?? '').replace(/\s+/g, ' ').trim();
  return name ? name + ' | ' + SEMURAI_PRODUCT_NAME : SEMURAI_PRODUCT_NAME;
}

export function studioSessionPath(pathname: string): string | null {
  const match = pathname.match(/^\/studio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  return match ? '/studio/' + match[1] + '/' : null;
}

export function safeStudioReturn(context: StudioContext): string | null {
  try {
    const origin = new URL(context.project.coreOrigin);
    const target = new URL(context.returnUrl);
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) return null;
    const allowed = target.pathname === '/app/creative/' + context.projectId || target.pathname === '/app/chat/creative' || target.pathname === '/app/chat/creative/';
    return target.origin === origin.origin && allowed && !target.search && !target.hash
      ? new URL('/app/chat/creative', origin).href : null;
  } catch { return null; }
}
