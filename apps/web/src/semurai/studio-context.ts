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

export function studioSessionPath(pathname: string): string | null {
  const match = pathname.match(/^\/studio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  return match ? '/studio/' + match[1] + '/' : null;
}

export function safeStudioReturn(context: StudioContext): string | null {
  try {
    const origin = new URL(context.project.coreOrigin);
    const target = new URL(context.returnUrl);
    if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) return null;
    return target.origin === origin.origin && target.pathname === '/app/creative/' + context.projectId && !target.search && !target.hash
      ? target.href : null;
  } catch { return null; }
}
