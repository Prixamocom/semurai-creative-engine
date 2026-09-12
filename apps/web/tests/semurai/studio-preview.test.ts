// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { studioPreviewSource, studioSlideCount } from '../../src/semurai/studio-preview';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';

describe('Semurai opaque artifact preview', () => {
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
