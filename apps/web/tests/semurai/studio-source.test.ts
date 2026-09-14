import { describe, expect, it } from 'vitest';
import { studioFileSource, replaceStudioFile } from '../../src/semurai/studio-source';

describe('Studio source variants', () => {
  it('selects and edits a dark file without changing the main document or another variant', () => {
    const original = { html: '<h1>Light</h1>', files: [{ path: 'dark.html', content: '<h1>Dark</h1>' }, { path: 'print.html', content: '<h1>Print</h1>' }] };
    expect(studioFileSource(original, 'dark.html')).toBe('<h1>Dark</h1>');
    const edited = replaceStudioFile(original, 'dark.html', '<h1>Dark revised</h1>');
    expect(edited.html).toBe(original.html);
    expect(edited.files[1]).toEqual(original.files[1]);
    expect(studioFileSource(edited, 'dark.html')).toBe('<h1>Dark revised</h1>');
    expect(original.files[0]!.content).toBe('<h1>Dark</h1>');
    expect(() => replaceStudioFile(original, 'missing.html', 'Wrong target')).toThrow();
    expect(replaceStudioFile(edited, 'index.html', '<h1>Light revised</h1>').files).toEqual(edited.files);
  });
});

