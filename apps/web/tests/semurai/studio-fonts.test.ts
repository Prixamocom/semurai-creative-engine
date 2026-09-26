// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureStudioPng, clearStudioFontCache, rememberStudioFonts, studioFontCache } from '../../src/semurai/studio-capture';
import { STUDIO_CAPTURE_BRIDGE } from '../../src/semurai/studio-capture-bridge';
import { STUDIO_FONT_INLINER } from '../../src/semurai/studio-fonts';

// The font proxy lives on the Studio page origin (creative-service /gf); jsdom's origin stands in for it.
const ORIGIN = window.location.origin;
const CSS_URL = ORIGIN + '/gf/css2?family=Playfair+Display:ital,wght@0,400;1,700&display=swap';
const LATIN = ORIGIN + '/gf/s/s/playfairdisplay/v37/latin-400.woff2';
const LATIN_EXT = ORIGIN + '/gf/s/s/playfairdisplay/v37/latin-ext-400.woff2';
const ITALIC = ORIGIN + '/gf/s/s/playfairdisplay/v37/latin-700i.woff2';
// What the proxy serves: Google's stylesheet with every source rewritten to a relative /gf/s/ URL.
const PROXY_CSS = `/* latin-ext */
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/gf/s/s/playfairdisplay/v37/latin-ext-400.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+1E00-1E9F;
}
/* latin */
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/gf/s/s/playfairdisplay/v37/latin-400.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F;
}
/* latin */
@font-face {
  font-family: 'Playfair Display';
  font-style: italic;
  font-weight: 700;
  font-display: swap;
  src: url(/gf/s/s/playfairdisplay/v37/latin-700i.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F;
}`;
const LINK = '<link rel="stylesheet" href="' + CSS_URL.replace(/&/g, '&amp;') + '">';

type Embedded = { css: string; missing: boolean; fetched: Record<string, string> };
const inliner = () => new Function('return ' + STUDIO_FONT_INLINER)()(window) as { embed: (doc: Document, options?: Record<string, unknown>) => Promise<Embedded> };

interface LoadedFace { family: string; style?: string; weight?: string; unicodeRange?: string; status?: string }
function fontDocument(head: string, loaded: LoadedFace[]) {
  const doc = new DOMParser().parseFromString('<!doctype html><html><head>' + head + '</head><body><h1>Lumen</h1></body></html>', 'text/html');
  // document.fonts as the browser reports it: CSS-connected faces, serialized its own way.
  const faces = loaded.map(face => ({ style: 'normal', weight: '400', unicodeRange: 'U+0-10FFFF', status: 'loaded', ...face }));
  Object.defineProperty(doc, 'fonts', { value: { forEach: (callback: (face: unknown) => void) => faces.forEach(callback) } });
  return doc;
}
function server(overrides: Record<string, () => Promise<Response>> = {}) {
  return vi.fn(async (url: string) => {
    const override = overrides[url];
    if (override) return override();
    if (url === CSS_URL) return new Response(PROXY_CSS, { headers: { 'content-type': 'text/css' } });
    if (url.startsWith(ORIGIN + '/gf/s/')) return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32, url.length % 256]), { headers: { 'content-type': 'font/woff2' } });
    return new Response('', { status: 404 });
  });
}
const latinLoaded: LoadedFace = { family: '"Playfair Display"', unicodeRange: 'U+0-FF, U+131, U+152-153, U+2000-206F' };
const embed = (doc: Document, options: Record<string, unknown>) => inliner().embed(doc, { origin: ORIGIN, ...options });

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; clearStudioFontCache(); });

describe('Font inlining for the PNG capture', () => {
  it('embeds only the used faces of proxied stylesheets as data: URLs', async () => {
    const fetch = server();
    const doc = fontDocument(LINK + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="https://evil.example/x.css">',
      [latinLoaded, { family: 'Arial', status: 'unloaded' }]);
    const result = await embed(doc, { fetch });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([CSS_URL, LATIN]);
    expect(result.missing).toBe(false);
    expect(result.css.match(/@font-face/g)).toHaveLength(1);
    expect(result.css).toContain('font-family:"Playfair Display";font-style:normal;font-weight:400');
    expect(result.css).toContain('unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+2000-206F');
    expect(result.css).toMatch(/src:url\("data:font\/woff2;base64,[A-Za-z0-9+/=]+"\)/);
    expect(Object.keys(result.fetched).sort()).toEqual([CSS_URL, LATIN].sort());
    expect(result.fetched[LATIN]).toMatch(/^data:font\/woff2;base64,/);
  });

  it('reuses the session cache instead of fetching again', async () => {
    const doc = fontDocument(LINK, [latinLoaded, { family: 'Playfair Display', style: 'italic', weight: '700', unicodeRange: 'U+0-FF, U+131, U+152-153, U+2000-206F' }]);
    const first = await embed(doc, { fetch: server() });
    expect(first.css.match(/@font-face/g)).toHaveLength(2);
    const fetch = server();
    const second = await embed(doc, { fetch, cache: first.fetched });
    expect(fetch).not.toHaveBeenCalled();
    expect(second).toEqual({ css: first.css, missing: false, fetched: {} });
  });

  it('fetches only from the proxy origin: @import and direct faces in style blocks included, Google never', async () => {
    const fetch = server();
    const doc = fontDocument('<style>@import url("' + CSS_URL + '");\n@import url(https://fonts.googleapis.com/css2?family=Inter);\n@import url(https://evil.example/x.css);\n'
      + "@font-face{font-family:Brand;src:url(" + ORIGIN + "/gf/s/s/brand/v1/brand.woff2) format('woff2')}"
      + "@font-face{font-family:Other;src:url(https://fonts.gstatic.com/s/other/v1/other.woff2) format('woff2')}@font-face{font-family:Local;src:url(fonts/local.woff2)}</style>",
    [latinLoaded, { family: 'Brand' }, { family: 'Other' }, { family: 'Local' }]);
    const result = await embed(doc, { fetch });
    expect(fetch.mock.calls.map(call => call[0]).sort()).toEqual([CSS_URL, LATIN, ORIGIN + '/gf/s/s/brand/v1/brand.woff2'].sort());
    expect(result.css).toContain('font-family:"Brand"');
    expect(result.css).not.toContain('Other');
    expect(result.missing).toBe(false);
    // Without a proxy origin nothing is fetched at all.
    const none = server();
    expect(await inliner().embed(doc, { fetch: none })).toEqual({ css: '', missing: false, fetched: {} });
    expect(await inliner().embed(doc, { fetch: none, origin: 'https://fonts.googleapis.com/x' })).toEqual({ css: '', missing: false, fetched: {} });
    expect(none).not.toHaveBeenCalled();
  });

  it('still resolves with fallback fonts and reports missing ones on failures and timeouts', async () => {
    const brokenFont = await embed(fontDocument(LINK, [latinLoaded]), { fetch: server({ [LATIN]: async () => new Response('', { status: 404 }) }) });
    expect(brokenFont).toMatchObject({ css: '', missing: true });
    const brokenSheet = await embed(fontDocument(LINK, [latinLoaded]), { fetch: server({ [CSS_URL]: async () => { throw new TypeError('Failed to fetch'); } }) });
    expect(brokenSheet).toMatchObject({ css: '', missing: true });
    const slow = await embed(fontDocument(LINK, [latinLoaded]), { fetch: server({ [LATIN]: () => new Promise<Response>(() => {}) }), timeout: 20 });
    expect(slow).toMatchObject({ css: '', missing: true });
    const stalled = await embed(fontDocument(LINK, [latinLoaded]), { fetch: server({ [CSS_URL]: () => new Promise<Response>(() => {}) }), timeout: 5_000, total: 30 });
    expect(stalled).toMatchObject({ css: '', missing: true });
    // A loaded face of a proxied family that no parsed rule describes cannot be embedded either.
    const unmatched = await embed(fontDocument(LINK, [{ family: 'Playfair Display', weight: '900' }]), { fetch: server() });
    expect(unmatched).toMatchObject({ css: '', missing: true });
    // Nothing to embed is not a failure.
    expect(await embed(fontDocument('', [{ family: 'Arial' }]), { fetch: server() })).toEqual({ css: '', missing: false, fetched: {} });
  });

  it('ships the inliner inside the capture bridge as valid script', () => {
    expect(STUDIO_CAPTURE_BRIDGE).toContain(STUDIO_FONT_INLINER);
    expect(() => new Function(STUDIO_CAPTURE_BRIDGE)).not.toThrow();
  });
});

function frame() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  return iframe.contentWindow!;
}
const measured = { rect: { x: 0, y: 0, width: 300, height: 200 }, scroll: { x: 0, y: 0 }, document: { width: 1440, height: 900 }, background: '#fff', label: 'page' };

describe('host font cache', () => {
  it('hands the proxy origin and session cache to the render, keeps valid entries that came back and reports fallback fonts', async () => {
    const win = frame();
    const png = new Blob(['png'], { type: 'image/png' });
    const fonts = { [LATIN]: 'data:font/woff2;base64,d09GMg==', [CSS_URL]: PROXY_CSS, 'https://fonts.gstatic.com/s/x/v1/x.woff2': 'data:font/woff2;base64,AAAA',
      'https://evil.example/x.css': 'body{}', [ITALIC]: 'data:text/html;base64,PGgxPg==' };
    const sent: Record<string, unknown>[] = [];
    vi.spyOn(win, 'postMessage').mockImplementation(((message: Record<string, unknown>) => {
      sent.push(message);
      const data = message.type === 'semurai:capture-measure' ? { type: 'semurai:capture-measure:result', ...measured }
        : { type: 'semurai:capture-render:result', blob: png, width: 600, height: 400, fontsMissing: sent.length < 3, fonts };
      queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { data: { ...data, id: message.id }, source: win })));
    }) as typeof win.postMessage);
    const result = await captureStudioPng(win, { kind: 'page' });
    expect(result.fontsMissing).toBe(true);
    expect(sent[1]).toMatchObject({ fonts: {}, fontOrigin: ORIGIN });
    expect(studioFontCache()).toEqual({ [LATIN]: fonts[LATIN], [CSS_URL]: PROXY_CSS });
    expect((await captureStudioPng(win, { kind: 'page' })).fontsMissing).toBe(false);
    expect(sent[3]!.fonts).toEqual({ [LATIN]: fonts[LATIN], [CSS_URL]: PROXY_CSS });
    rememberStudioFonts({ [LATIN_EXT]: 'x'.repeat(10), [ITALIC]: 42 });
    expect(Object.keys(studioFontCache()).sort()).toEqual([CSS_URL, LATIN].sort());
  });
});
