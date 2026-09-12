// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { placeStudioImage } from '../../src/semurai/studio-images';
import { studioPreviewSource } from '../../src/semurai/studio-preview';

const image = { dataUrl: 'data:image/png;base64,aGVsbG8=', alt: 'Zażółć & <produkt>' };
const parse = (source: string) => new DOMParser().parseFromString(source, 'text/html');
describe('Studio library images in canonical HTML', () => {
  it('replaces the actual source-path image and clears stale responsive candidates, preserving unrelated HTML', () => {
    const source = '<html><body><main><picture><source srcset="old.webp"><img src="old.png" srcset="old@2x.png 2x" width="300" style="border-radius:20px"></picture><p>Keep this copy</p></main></body></html>';
    const id = parse(studioPreviewSource(source, 0, true, false)).querySelector('img')!.getAttribute('data-od-source-path')!;
    const result = parse(placeStudioImage(source, image, 'replace', false, id)!);
    expect(result.querySelector('img')?.getAttribute('src')).toBe(image.dataUrl);
    expect(result.querySelector('img')?.getAttribute('alt')).toBe(image.alt);
    expect(result.querySelector('img')?.getAttribute('width')).toBe('300');
    expect(result.querySelector('img')?.getAttribute('style')).toBe('border-radius:20px');
    expect(result.querySelector('source, [srcset]')).toBeNull();
    expect(result.querySelector('p')?.textContent).toBe('Keep this copy');
    expect(result.querySelector('[data-od-id]')).toBeNull();
  });
  it('inserts into a selected email cell without breaking its table or link', () => {
    const source = '<html><body><table><tbody><tr><td data-od-id="cell"><a href="https://example.com">CTA</a></td></tr></tbody></table></body></html>';
    const result = parse(placeStudioImage(source, image, 'inside', true, 'cell')!);
    expect(result.querySelector('table > tbody > tr > td > img')?.getAttribute('src')).toBe(image.dataUrl);
    expect(result.querySelectorAll('table')).toHaveLength(1);
    expect(result.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });
  it('appends a table image block for email and places landing images inside main', () => {
    const email = parse(placeStudioImage('<html><body><p>Existing</p></body></html>', image, 'end', true)!);
    expect(email.querySelector('table[role="presentation"] > tbody > tr > td > img')).not.toBeNull();
    expect(email.querySelector('p')?.textContent).toBe('Existing');
    const landing = parse(placeStudioImage('<html><body><main><h1>Hero</h1></main><footer>Footer</footer></body></html>', image, 'end', false)!);
    expect(landing.querySelector('main')?.lastElementChild?.tagName).toBe('IMG');
    expect(landing.body.lastElementChild?.tagName).toBe('FOOTER');
  });
  it('refuses missing or invalid targets and non-raster URLs rather than changing a different element', () => {
    const source = '<html><body><p data-od-id="text">Keep</p></body></html>';
    expect(placeStudioImage(source, image, 'inside', true, 'text')).toBeNull();
    expect(placeStudioImage(source, image, 'replace', false, 'missing')).toBeNull();
    expect(placeStudioImage(source, { ...image, dataUrl: 'javascript:alert(1)' }, 'end', false)).toBeNull();
    expect(placeStudioImage(source, { ...image, dataUrl: 'data:image/svg+xml;base64,aA==' }, 'end', true)).toBeNull();
  });
});
