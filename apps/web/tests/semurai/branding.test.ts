import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, SEMURAI_CREATIVE, productLabel } from '../../src/semurai/branding';
import { ar } from '../../src/i18n/locales/ar';
import { de } from '../../src/i18n/locales/de';
import { en } from '../../src/i18n/locales/en';
import { esES } from '../../src/i18n/locales/es-ES';
import { fa } from '../../src/i18n/locales/fa';
import { fr } from '../../src/i18n/locales/fr';
import { hu } from '../../src/i18n/locales/hu';
import { id } from '../../src/i18n/locales/id';
import { it as itLocale } from '../../src/i18n/locales/it';
import { ja } from '../../src/i18n/locales/ja';
import { ko } from '../../src/i18n/locales/ko';
import { pl } from '../../src/i18n/locales/pl';
import { ptBR } from '../../src/i18n/locales/pt-BR';
import { ru } from '../../src/i18n/locales/ru';
import { th } from '../../src/i18n/locales/th';
import { tr } from '../../src/i18n/locales/tr';
import { uk } from '../../src/i18n/locales/uk';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';

const UPSTREAM_BRAND = /\bOpen[\s-]?Design\b|\bOPEN[\s-]?DESIGN\b/;

describe('Semurai branding adapter', () => {
  it('brands bundled labels without changing interpolation slots', () => {
    expect(productLabel('OpenDesign: {projectName}', true)).toBe('Semurai Creative: {projectName}');
    expect(productLabel('Open Design — OD Project', true)).toBe('Semurai Creative — Creative Project');
    expect(productLabel('Open-Design / OPENDESIGN', true)).toBe('Semurai Creative / SEMURAI CREATIVE');
  });

  it('preserves upstream behavior when the deployment flag is off', () => {
    expect(productLabel('OpenDesign: {projectName}', false)).toBe('OpenDesign: {projectName}');
  });

  it('does not rewrite internal identifiers or unrelated translated labels', () => {
    expect(productLabel('open-design:locale / opendesign / Zapisz / Open design system', true))
      .toBe('open-design:locale / opendesign / Zapisz / Open design system');
  });

  it('uses Semurai branding unless the build explicitly opts out', () => {
    expect(SEMURAI_CREATIVE).toBe(true);
    expect(PRODUCT_NAME).toBe('Semurai Creative');
  });

  it('ships no upstream product name in any bundled UI locale', () => {
    const dictionaries = { ar, de, en, esES, fa, fr, hu, id, it: itLocale, ja, ko, pl, ptBR, ru, th, tr, uk, zhCN, zhTW };
    const leaks = Object.entries(dictionaries).flatMap(([locale, dict]) => Object.entries(dict)
      .filter(([, value]) => typeof value === 'string' && UPSTREAM_BRAND.test(value))
      .map(([key]) => locale + ':' + key));
    expect(leaks).toEqual([]);
  });
});
