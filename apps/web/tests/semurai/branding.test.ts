import { describe, expect, it } from 'vitest';
import { productLabel } from '../../src/semurai/branding';

describe('Semurai branding adapter', () => {
  it('brands bundled labels without changing interpolation slots', () => {
    expect(productLabel('OpenDesign: {projectName}', true)).toBe('Semurai Creative: {projectName}');
    expect(productLabel('Open Design — OD Project', true)).toBe('Semurai Creative — Creative Project');
  });

  it('preserves upstream behavior when the deployment flag is off', () => {
    expect(productLabel('OpenDesign: {projectName}', false)).toBe('OpenDesign: {projectName}');
  });

  it('does not rewrite internal identifiers or unrelated translated labels', () => {
    expect(productLabel('open-design:locale / opendesign / Zapisz', true)).toBe('open-design:locale / opendesign / Zapisz');
  });
});
