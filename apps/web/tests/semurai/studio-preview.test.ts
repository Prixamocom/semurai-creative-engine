// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { studioPreviewSource, studioSlideCount } from '../../src/semurai/studio-preview';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';

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
    expect(parsed.head.firstElementChild?.getAttribute('content')).toContain("connect-src 'none'");
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
    expect(parsed.head.firstElementChild?.getAttribute('content')).toContain("connect-src 'none'");
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
    expect(parsed.head.firstElementChild?.getAttribute('content')).toContain("connect-src 'none'");
    const id = parsed.querySelector('h1')?.getAttribute('data-od-id');
    expect(id).toBeTruthy();
    const patched = applyManualEditPatch(source, { kind: 'set-text', id: id!, value: 'Manually edited' });
    expect(patched.ok).toBe(true);
    expect(new DOMParser().parseFromString(patched.source, 'text/html').querySelector('h1')?.textContent).toBe('Manually edited');
    expect(patched.source).toContain('unsafe-author');
    expect(studioSlideCount(source)).toBe(1);
  });
});
