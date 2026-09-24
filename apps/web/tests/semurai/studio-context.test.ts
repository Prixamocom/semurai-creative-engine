import { describe, expect, it } from 'vitest';
import { safeStudioReturn, studioDocumentTitle, studioSessionPath, type StudioContext } from '../../src/semurai/studio-context';

describe('Semurai Studio document title', () => {
  it('names the project before the product', () => {
    expect(studioDocumentTitle('Q3 Board Deck')).toBe('Q3 Board Deck | Semurai Creative');
    expect(studioDocumentTitle('  Oferta\n  jesień 2026 ')).toBe('Oferta jesień 2026 | Semurai Creative');
  });
  it('falls back to the product name without a project name', () => {
    for (const title of [undefined, null, '', '   ']) expect(studioDocumentTitle(title)).toBe('Semurai Creative');
  });
});

describe('Semurai Studio navigation boundary', () => {
  it('only resolves a UUID session path and never a browser-supplied arbitrary endpoint', () => {
    const id = 'aaaabbbb-cccc-4ddd-8eee-ffffaaaabbbb';
    expect(studioSessionPath('/studio/' + id + '/')).toBe('/studio/' + id + '/');
    for (const path of ['/api/settings', '/studio/../../api/', '/studio/token?secret=a', '//evil.test/']) expect(studioSessionPath(path)).toBeNull();
  });
  it('returns to the Creative library on the configured Semurai origin', () => {
    const context = { projectId: 'owned', project: { coreOrigin: 'https://semur.ai' }, returnUrl: 'https://semur.ai/app/creative/owned' } as StudioContext;
    expect(safeStudioReturn(context)).toBe('https://semur.ai/app/chat/creative');
    expect(safeStudioReturn({ ...context, returnUrl: 'https://semur.ai/app/chat/creative' })).toBe('https://semur.ai/app/chat/creative');
    expect(safeStudioReturn({ ...context, returnUrl: 'https://semur.ai/app/chat/creative/?creative_project=owned' })).toBeNull();
    for (const returnUrl of ['https://evil.test/app/creative/owned', 'https://semur.ai/app/creative/other', 'javascript:alert(1)']) {
      expect(safeStudioReturn({ ...context, returnUrl })).toBeNull();
    }
  });
});
