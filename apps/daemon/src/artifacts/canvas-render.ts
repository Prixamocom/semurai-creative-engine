import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Route } from 'playwright-core';
import { parseCanvasDocument } from '@open-design/contracts';

export interface CanvasRenderPage {
  pageId: string;
  stage: { width: number; height: number };
  renderer: string;
  issues: { id: string; severity: 'error' | 'warning'; code: string }[];
  preview?: string;
}
export interface CanvasRenderReport { valid: boolean; pages: CanvasRenderPage[]; directory?: string }

/**
 * Semurai: a plain-http entry on a single-label host (a Docker container name such as
 * semurai-creative-service) is the Semurai egress gateway. The sandbox then has no internet, so
 * Google Fonts are served by the gateway's /gf proxy instead of fonts.googleapis.com.
 */
export function canvasRenderViaGateway(entry: URL): boolean {
  return entry.protocol === 'http:' && entry.hostname !== 'localhost' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(entry.hostname);
}

/** Only the trusted render application and its static dependencies receive requests. */
export function canvasRenderRequestAllowed(raw: string, renderUrl: string, method: string): boolean {
  if (method !== 'GET') return false;
  try {
    const url = new URL(raw); const entry = new URL(renderUrl);
    if (url.username || url.password) return false;
    if (url.origin === entry.origin) return url.pathname === entry.pathname
      || url.pathname === entry.pathname.replace(/\/$/, '')
      || url.pathname.startsWith('/_nuxt/')
      || (canvasRenderViaGateway(entry) && /^\/gf\/(?:css2?|s\/.+)$/.test(url.pathname));
    return url.protocol === 'https:' && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  } catch { return false; }
}

/**
 * Semurai: the gateway URL serving an allowed Google Fonts request, or null to load it directly.
 * Playwright cannot continue a request under another scheme, so these are fetched and fulfilled.
 */
export function canvasRenderGatewayFontUrl(raw: string, entry: URL): string | null {
  if (!canvasRenderViaGateway(entry)) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') return null;
  if (url.hostname === 'fonts.googleapis.com' && ['/css', '/css2'].includes(url.pathname)) return `${entry.origin}/gf${url.pathname}${url.search}`;
  if (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/s/') && !url.search) return `${entry.origin}/gf${url.pathname}`;
  return null;
}

async function fulfilViaGateway(route: Route, target: string, entry: URL): Promise<void> {
  try {
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    let body = Buffer.from(await response.arrayBuffer());
    if (body.length > 6_000_000) return route.abort();
    // The proxied stylesheet points fonts at /gf/s/ relative to itself; pin them to the gateway origin.
    if (/^text\/css/i.test(contentType)) body = Buffer.from(body.toString('utf8').replaceAll('url(/gf/s/', `url(${entry.origin}/gf/s/`));
    await route.fulfill({ status: response.status, contentType, body, headers: { 'access-control-allow-origin': '*' } });
  } catch { await route.abort(); }
}

async function readProjectJson(root: string, name: string, maxBytes: number): Promise<unknown> {
  const file = path.join(root, name);
  if (await fs.realpath(file) !== file) throw new Error('canvas_unsafe_path');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('canvas_file_too_large');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function renderCanvasProject(projectRoot: string, writePreviews = false): Promise<CanvasRenderReport> {
  const root = await fs.realpath(projectRoot);
  const document = parseCanvasDocument(await readProjectJson(root, 'design.json', 2_000_000));
  const configured = process.env.CANVAS_RENDER_URL;
  if (!configured) throw new Error('canvas_renderer_unavailable');
  const entry = new URL(configured);
  // Semurai: plain http is also accepted for the internal gateway host (see canvasRenderViaGateway).
  if (entry.username || entry.password || entry.search || entry.hash
    || (entry.protocol !== 'https:' && !(entry.protocol === 'http:' && (['127.0.0.1', 'localhost'].includes(entry.hostname) || canvasRenderViaGateway(entry))))) {
    throw new Error('canvas_renderer_configuration');
  }
  const media = new Map<string, string>();
  const assetFiles = (await fs.readdir(root)).filter(name => /^canvas-asset-[a-f0-9-]{36}\.json$/.test(name));
  if (assetFiles.length > 6) throw new Error('canvas_asset_limit');
  for (const name of assetFiles) {
    const asset = await readProjectJson(root, name, 360_000) as { url?: unknown; dataUrl?: unknown };
    if (typeof asset.url !== 'string' || !/^https:\/\/media\.semurai\.invalid\/[a-f0-9-]{36}$/.test(asset.url)
      || typeof asset.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(asset.dataUrl)) throw new Error('canvas_invalid_asset');
    media.set(asset.url, asset.dataUrl);
  }
  const hydrate = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('https://media.semurai.invalid/')) {
      const asset = media.get(value); if (!asset) throw new Error('canvas_unknown_asset'); return asset;
    }
    if (Array.isArray(value)) return value.map(hydrate);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hydrate(item)]));
    return value;
  };
  const directory = writePreviews ? `canvas-review-${randomUUID()}` : undefined;
  if (directory) await fs.mkdir(path.join(root, directory), { mode: 0o700 });
  const browser = await chromium.launch({ headless: true, timeout: 30_000,
    ...(process.env.CANVAS_CHROMIUM_PATH ? { executablePath: process.env.CANVAS_CHROMIUM_PATH } : {}),
    args: ['--disable-dev-shm-usage'],
    env: Object.fromEntries(Object.entries({ PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR }).filter((item): item is [string, string] => typeof item[1] === 'string')),
  });
  const deadline = setTimeout(() => { void browser.close(); }, 180_000);
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', route => {
      if (!canvasRenderRequestAllowed(route.request().url(), entry.href, route.request().method())) return route.abort();
      const gatewayFont = canvasRenderGatewayFontUrl(route.request().url(), entry);
      return gatewayFont ? fulfilViaGateway(route, gatewayFont, entry) : route.continue();
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(entry.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => (globalThis as unknown as { semuraiCanvasRenderer?: { version: number } }).semuraiCanvasRenderer?.version === 1);
    const pages: CanvasRenderPage[] = [];
    for (const [index, frame] of document.pages.entries()) {
      const payload = hydrate({ ...document, nodes: [], pages: [frame], activePageIndex: 0 });
      const result = await page.evaluate(async payload => {
        const renderer = (globalThis as unknown as { semuraiCanvasRenderer: { render(payload: unknown): Promise<CanvasRenderPage & { dataUrl: string }> } }).semuraiCanvasRenderer;
        return renderer.render(payload);
      }, payload);
      if (result.renderer !== 'motif-v2' || result.pageId !== frame.id || !/^data:image\/png;base64,/.test(result.dataUrl) || result.dataUrl.length > 15_000_000) throw new Error('canvas_invalid_render');
      const { dataUrl, ...facts } = result;
      if (directory) {
        facts.preview = `${directory}/page-${index + 1}.png`;
        await fs.writeFile(path.join(root, facts.preview), Buffer.from(dataUrl.split(',')[1]!, 'base64'), { flag: 'wx', mode: 0o600 });
      }
      pages.push(facts);
    }
    const report = { valid: !pages.some(page => page.issues.some(issue => issue.severity === 'error')), pages, ...(directory ? { directory } : {}) };
    if (directory) await fs.writeFile(path.join(root, directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    return report;
  } finally { clearTimeout(deadline); await browser.close(); }
}
