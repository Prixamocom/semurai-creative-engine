// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { studioArtifactCsp, studioPreviewSource, studioSlideCount } from '../../src/semurai/studio-preview';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';
import { setStudioFontProxyOrigin, studioFontLinks, studioFontProxyHref, studioFontProxyOrigin, studioFontStylesheetHref, studioRewriteFontCss } from '../../src/semurai/studio-fonts';

// The Studio page origin hosts the font proxy (creative-service /gf); jsdom's page origin stands in for it.
const ORIGIN = window.location.origin;
// Everything stays locked down; the only network source is our font proxy, never a Google host.
const PREVIEW_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' " + ORIGIN + '; img-src data: blob:; '
  + 'font-src data: ' + ORIGIN + '; connect-src ' + ORIGIN + "; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

afterEach(() => setStudioFontProxyOrigin(null));

describe('Semurai opaque artifact preview', () => {
  it('retains landing styles containing HTML examples in CSS comments without enabling author scripts', () => {
    const source = '<!doctype html><html><head><style id="brand">'
      + '/* Keep the <img height="400"> ratio; never use <!-- markup --> here. */'
      + 'body{background:#0a0a0a;color:#f5f5f5}h1{color:#ff0000}'
      + 'h1::after{content:"/* literal */ <example>"}'
      + '@media(width<600px){h1{font-size:24px}}'
      + '</style><script>window.authorExecuted=true</script></head><body><h1>SEO Agent</h1></body></html>';
    const preview = studioPreviewSource(source, 0, true, false);
    const parsed = new DOMParser().parseFromString(preview, 'text/html');
    const css = parsed.querySelector('#brand')?.textContent;
    expect(css).toContain('body{background:#0a0a0a;color:#f5f5f5}');
    expect(css).toContain('h1{color:#ff0000}');
    expect(css).toContain('@media(width< 600px)');
    expect(css).toContain('content:"/* literal */ \\3c example>"');
    expect(preview).not.toContain('window.authorExecuted');
    expect(parsed.head.firstElementChild?.getAttribute('content')).toBe(PREVIEW_CSP);
    const id = parsed.querySelector('h1')!.getAttribute('data-od-id')!;
    const edited = applyManualEditPatch(source, { kind: 'set-text', id, value: 'Edited landing' });
    expect(edited.ok).toBe(true);
    expect(edited.source).toContain('/* Keep the <img height="400"> ratio');
  });
  it('runs video timelines only in the opaque preview, retaining the network sandbox and source identities', () => {
    const source = '<html><body><div data-composition-id="main" data-width="1080" data-height="1920" data-duration="36"><h1 onclick="alert(1)">Film</h1></div><script src="https://untrusted.test/a.js"></script><script>window.__timelines={main:gsap.timeline({paused:true})};</script></body></html>';
    const preview = studioPreviewSource(source, 0, true, false, false, true, 'window.gsap={timeline:()=>({})}');
    const parsed = new DOMParser().parseFromString(preview, 'text/html');
    expect(preview).toContain('window.__timelines={main:gsap.timeline');
    expect(preview).toContain('semurai:video');
    expect(preview).not.toContain('https://untrusted.test');
    expect(parsed.querySelector('h1')?.hasAttribute('onclick')).toBe(false);
    expect(parsed.querySelector('h1')?.getAttribute('data-od-id')).toBeTruthy();
    expect(parsed.head.firstElementChild?.getAttribute('content')).toBe(PREVIEW_CSP);
    expect(studioPreviewSource(source, 0, false, false)).not.toContain('window.__timelines={main:gsap.timeline');
  });
  it('removes author execution and navigation while retaining source identities for manual changes', () => {
    const source = '<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.test"></head><body>'
      + '<script>window.privatePayload = "unsafe-author"</script><main class="deck-stage"><section class="slide">'
      + '<h1 onclick="alert(1)">Zażółć — Wachstum</h1><a href="https://evil.test" ping="https://evil.test">Link</a>'
      + '<iframe src="https://evil.test"></iframe></section></main></body></html>';
    const preview = studioPreviewSource(source, 0, true);
    const parsed = new DOMParser().parseFromString(preview, 'text/html');
    expect(preview).not.toContain('unsafe-author');
    expect(parsed.querySelector('iframe')).toBeNull();
    expect(parsed.querySelector('h1')?.hasAttribute('onclick')).toBe(false);
    expect(parsed.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(parsed.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(parsed.head.firstElementChild?.getAttribute('content')).toBe(PREVIEW_CSP);
    const id = parsed.querySelector('h1')?.getAttribute('data-od-id');
    expect(id).toBeTruthy();
    const patched = applyManualEditPatch(source, { kind: 'set-text', id: id!, value: 'Manually edited' });
    expect(patched.ok).toBe(true);
    expect(new DOMParser().parseFromString(patched.source, 'text/html').querySelector('h1')?.textContent).toBe('Manually edited');
    expect(patched.source).toContain('unsafe-author');
    expect(studioSlideCount(source)).toBe(1);
  });
});

describe('Google Fonts through our font proxy', () => {
  const QUERY = '?family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap';
  const FONT_CSS = 'https://fonts.googleapis.com/css2' + QUERY;
  const PROXY_CSS = ORIGIN + '/gf/css2' + QUERY;
  it('rewrites Google Fonts stylesheets to the proxy and strips every other link, preconnects included', () => {
    const source = '<!doctype html><html><head>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + '<link rel="stylesheet" href="' + FONT_CSS.replace(/&/g, '&amp;') + '" onload="alert(1)">'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:400,700|Lato">'
      + '<link rel="stylesheet" href="https://evil.example/x.css"><link rel="stylesheet" href="//fonts.googleapis.com/css2?family=Inter">'
      + '<link rel="stylesheet" href="http://fonts.googleapis.com/css2?family=Inter"><link rel="stylesheet" href="data:text/css,body{color:red}">'
      + '<link rel="stylesheet" href="https://evil.example/fonts.googleapis.com/inject.css"><link rel="stylesheet" href="https://fonts.googleapis.com.evil.example/x.css">'
      + '<link rel="stylesheet" href="https://fonts.gstatic.com/s/x.css"><link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">'
      + '<link rel="icon" href="https://fonts.googleapis.com/favicon.ico"><link rel="alternate stylesheet" href="https://fonts.googleapis.com/css2?family=Lato">'
      + '<link rel="stylesheet" href="https://user:pw@fonts.googleapis.com/css2?family=Lato"><link rel="stylesheet" href="https://fonts.googleapis.com:8443/css2?family=Lato">'
      + '</head><body><h1>Hi</h1></body></html>';
    for (const [deck, edit] of [[false, true], [false, false], [true, false]] as const) {
      const preview = studioPreviewSource(source, 0, edit, deck);
      const parsed = new DOMParser().parseFromString(preview, 'text/html');
      expect(parsed.head.firstElementChild?.getAttribute('content')).toBe(PREVIEW_CSP);
      const links = [...parsed.querySelectorAll('link')].map(link => [link.getAttribute('rel'), link.getAttribute('href'), link.attributes.length]);
      expect(links).toEqual([['stylesheet', PROXY_CSS, 2], ['stylesheet', ORIGIN + '/gf/css?family=Roboto:400,700|Lato', 2]]);
      expect(preview).not.toMatch(/googleapis|gstatic/);
    }
    // Edits patch the saved source, never the preview: the original Google links stay there.
    const id = new DOMParser().parseFromString(studioPreviewSource(source, 0, true, false), 'text/html').querySelector('h1')!.getAttribute('data-od-id')!;
    const edited = applyManualEditPatch(source, { kind: 'set-text', id, value: 'Edited' });
    expect(edited.source).toContain('href="' + FONT_CSS.replace(/&/g, '&amp;') + '"');
    expect(edited.source).not.toContain('/gf/');
  });

  it('maps only Google Fonts CSS API URLs and needs a proxy origin', () => {
    expect(studioFontStylesheetHref(' ' + FONT_CSS + ' ')).toBe(FONT_CSS);
    expect(studioFontProxyHref(FONT_CSS, ORIGIN)).toBe(PROXY_CSS);
    for (const href of ['//fonts.googleapis.com/css2', 'http://fonts.googleapis.com/css2', 'data:text/css,x', 'javascript:alert(1)', 'https://fonts.gstatic.com/s/a.css',
      'https://evil.example/fonts.googleapis.com/x.css', 'https://fonts.googleapis.com.evil.example/css2', 'https://a@fonts.googleapis.com/css2', 'https://fonts.googleapis.com:444/css2',
      'https://fonts.googleapis.com/icon?family=Material+Icons', 'not a url']) {
      expect(studioFontProxyHref(href, ORIGIN)).toBeNull();
    }
    expect(studioFontProxyHref(FONT_CSS, null)).toBeNull();
    expect(studioFontProxyHref('https://fonts.googleapis.com/css2?family=' + 'a'.repeat(600), ORIGIN)).toBeNull();
    const doc = new DOMParser().parseFromString('<link rel="STYLESHEET" href="' + FONT_CSS + '"><link rel="stylesheet" href="' + FONT_CSS + '">', 'text/html');
    expect(studioFontLinks(doc, ORIGIN)).toEqual([PROXY_CSS]);
    // The dev harness can point at a local creative-service; anything but a bare origin is ignored.
    setStudioFontProxyOrigin('http://127.0.0.1:8080');
    expect(studioFontProxyOrigin()).toBe('http://127.0.0.1:8080');
    setStudioFontProxyOrigin('http://127.0.0.1:8080/gf');
    expect(studioFontProxyOrigin()).toBe(ORIGIN);
    expect(studioArtifactCsp(null)).toBe("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'");
  });

  it('rewrites Google Fonts @import and gstatic sources to the proxy and leaves strings and comments alone', () => {
    const css = [
      '@import url("' + FONT_CSS + '");',
      '@import url(https://fonts.googleapis.com/css2?family=Inter:wght@400;700) screen;',
      "@import 'https://fonts.googleapis.com/css2?family=Lato';",
      '@import url(https://evil.example/x.css);',
      "@import '//fonts.googleapis.com/css2?family=Inter';",
      '@import url(http://fonts.googleapis.com/css2?family=Inter);',
      '@import url("data:text/css,body{color:red}");',
      '@import url(https://fonts.gstatic.com/x.css);',
      '@import url(https://fonts.googleapis.com/css2?family=Inter) supports(background:url(https://evil.example/x.png));',
      '@import broken;',
      "@font-face{font-family:Brand;src:url('https://fonts.gstatic.com/s/brand/v1/brand.woff2') format('woff2'),url(https://fonts.gstatic.com/s/../x.woff2)}",
      'h1::after{content:"@import url(https://evil.example/x.css); url(https://fonts.gstatic.com/s/a/v1/a.woff2)"}/* @import url(https://evil.example/y.css); */body{margin:0}',
    ].join('\n');
    const clean = studioRewriteFontCss(css, ORIGIN);
    const [imports, rest] = clean.split('@font-face');
    expect(imports!.trim().split('\n').filter(Boolean)).toEqual([
      '@import url("' + PROXY_CSS + '");',
      '@import url("' + ORIGIN + '/gf/css2?family=Inter:wght@400;700") screen;',
      '@import url("' + ORIGIN + '/gf/css2?family=Lato");',
    ]);
    expect(rest).toContain('src:url("' + ORIGIN + '/gf/s/s/brand/v1/brand.woff2") format(\'woff2\'),url(about:invalid)}');
    expect(rest).toContain('h1::after{content:"@import url(https://evil.example/x.css); url(https://fonts.gstatic.com/s/a/v1/a.woff2)"}');
    expect(rest).toContain('/* @import url(https://evil.example/y.css); */body{margin:0}');
    // Without a proxy origin nothing loads at all.
    expect(studioRewriteFontCss(css, null).split('h1::after')[0]).not.toMatch(/@import|url\("?http/);
    const preview = new DOMParser().parseFromString(studioPreviewSource('<html><head><style id="s">' + css + '</style></head><body></body></html>', 0, false, false), 'text/html');
    expect(preview.querySelector('#s')?.textContent).toContain('@import url("' + PROXY_CSS + '");');
    expect(preview.querySelector('#s')?.textContent).not.toMatch(/^@import url\(https:\/\/evil/m);
  });
});
