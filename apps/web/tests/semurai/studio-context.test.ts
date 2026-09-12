import { describe, expect, it } from 'vitest';
import { safeStudioReturn, studioSessionPath, type StudioContext } from '../../src/semurai/studio-context';

describe('Semurai Studio navigation boundary', () => {
  it('only resolves a UUID session path and never a browser-supplied arbitrary endpoint', () => {
    const id = 'aaaabbbb-cccc-4ddd-8eee-ffffaaaabbbb';
    expect(studioSessionPath('/studio/' + id + '/')).toBe('/studio/' + id + '/');
    for (const path of ['/api/settings', '/studio/../../api/', '/studio/token?secret=a', '//evil.test/']) expect(studioSessionPath(path)).toBeNull();
  });
  it('returns only to the scoped canonical project on the configured Semurai origin', () => {
    const context = { projectId: 'owned', project: { coreOrigin: 'https://semur.ai' }, returnUrl: 'https://semur.ai/app/creative/owned' } as StudioContext;
    expect(safeStudioReturn(context)).toBe(context.returnUrl);
    for (const returnUrl of ['https://evil.test/app/creative/owned', 'https://semur.ai/app/creative/other', 'javascript:alert(1)']) {
      expect(safeStudioReturn({ ...context, returnUrl })).toBeNull();
    }
  });
});
