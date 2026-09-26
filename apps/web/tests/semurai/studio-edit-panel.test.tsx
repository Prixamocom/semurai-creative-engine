// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StudioEditor } from '../../src/semurai/StudioEditor';
import { StudioEditPanel } from '../../src/semurai/StudioEditPanel';
import { studioLayerTree } from '../../src/semurai/studio-layers';
import { STUDIO_FONT_OPTIONS, stepStudioValue, studioFontFamilyName, studioFontSelectValue, studioHexColor, studioPageStyles, studioStyleDisplay } from '../../src/semurai/studio-edit-values';
import { normalizeManualEditStyles } from '../../src/components/ManualEditPanel';
import { applyManualEditPatch } from '../../src/edit-mode/source-patches';
import type { StudioContext } from '../../src/semurai/studio-context';
import { emptyManualEditStyles, type ManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

const projectId = '11111111-2222-4333-8444-555555555555';
const html = '<!doctype html><html><head></head><body><section class="hero"><h1 data-od-id="hero">Welcome</h1><a data-od-id="cta" href="https://example.com/start">Start</a></section><footer class="site-footer"><p data-od-id="note">Fine print</p></footer></body></html>';
const context: StudioContext = {
  projectId, workspaceId: 'workspace', returnUrl: 'https://core.test/app/creative/' + projectId, expiresAt: Date.now() + 3_600_000,
  project: { title: 'Landing', artifactType: 'page', locale: 'en', sourceLocale: 'en', uiLocale: 'en', direction: 'ltr', currentVersion: 1, coreOrigin: 'https://core.test' },
};
// What the preview bridge reports: inline styles merged with ~36 computed values.
const computed: ManualEditStyles = { ...emptyManualEditStyles(), fontFamily: 'Arial, sans-serif', fontSize: '32px', fontWeight: '700', color: 'rgb(32, 32, 32)', textAlign: 'start', lineHeight: 'normal',
  letterSpacing: 'normal', width: '640px', height: '38px', backgroundColor: 'rgba(0, 0, 0, 0)', opacity: '1', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
  marginTop: '21px', marginRight: '0px', marginBottom: '21px', marginLeft: '0px', borderStyle: 'none', borderTopWidth: '0px', borderRadius: '0px', display: 'block' };
function target(id: string, overrides: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return { id, kind: 'text', label: id, tagName: 'h1', className: '', text: 'Welcome', rect: { x: 0, y: 0, width: 400, height: 40 }, fields: { text: 'Welcome' }, attributes: {},
    styles: computed, isLayoutContainer: false, outerHtml: '', ...overrides };
}
const hero = target('hero');
const section = target('path-0', { kind: 'container', tagName: 'section', label: 'Welcome Start', isLayoutContainer: true, styles: { ...computed, display: 'flex', flexDirection: 'column' } });
const cta = target('cta', { kind: 'link', tagName: 'a', label: 'Start', fields: { text: 'Start', href: '' } });
const footer = target('path-1', { kind: 'container', tagName: 'footer', label: 'Fine print' });
const note = target('note', { tagName: 'p', label: 'Fine print' });
const targets = [section, hero, cta, footer, note];

function fromPreview(data: unknown) {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')!;
  window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }));
}
function panel(overrides: Partial<Parameters<typeof StudioEditPanel>[0]> = {}) {
  const props = { locale: 'en' as const, source: html, targets, selected: hero, mode: 'pro' as const, layersOpen: true, disabled: false,
    onMode: vi.fn(), onLayersOpen: vi.fn(), onSelect: vi.fn(), onPatch: vi.fn(() => true), onPickImage: vi.fn(), ...overrides };
  render(<StudioEditPanel {...props} />);
  return props;
}

let puts: { html: string }[] = [];
beforeEach(() => {
  localStorage.clear(); puts = [];
  window.history.replaceState({}, '', '/studio/' + projectId + '/');
  const saved = { id: 'source', version: 1, document_hash: 'hash', document: { version: 1, kind: 'page', name: 'Landing', html, notes: [] } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint = String(url).split('/project/')[1];
    if (endpoint === 'document' && init?.method === 'PUT') puts.push(JSON.parse(String(init.body)).document);
    return new Response(JSON.stringify({ data: endpoint === 'document' ? saved : [] }), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Studio edit panel values', () => {
  it('reads computed colors as hex and steps numeric values with units', () => {
    expect(studioHexColor('rgb(32, 32, 32)')).toBe('#202020');
    expect(studioHexColor('rgba(0, 0, 0, 0)')).toBe('');
    expect(stepStudioValue('fontSize', '16px', 1, false)).toBe('17px');
    expect(stepStudioValue('fontSize', '16px', -1, true)).toBe('6px');
    expect(stepStudioValue('opacity', '1', 1, false)).toBe('1');
    expect(stepStudioValue('lineHeight', '1.5', -1, false)).toBe('1.4');
    expect(stepStudioValue('width', 'auto', 1, false)).toBeNull();
  });
  it('rounds measured lengths for display but keeps exact typed or inline values', () => {
    expect(studioStyleDisplay('width', '335.94px')).toBe('336px');
    expect(studioStyleDisplay('fontSize', '46.2px')).toBe('46px');
    expect(studioStyleDisplay('letterSpacing', '-1.536px')).toBe('-1.5px');
    expect(studioStyleDisplay('paddingTop', '0.04px')).toBe('0px');
    expect(studioStyleDisplay('opacity', '0.856')).toBe('0.86');
    expect(studioStyleDisplay('width', '335.94px', true)).toBe('335.94px');
    expect(studioStyleDisplay('color', 'rgb(32, 32, 32)', true)).toBe('#202020');
  });
  it('shows rounded computed values and the exact inline value in the panel', () => {
    const source = '<!doctype html><html><head></head><body><h1 data-od-id="hero" style="line-height: 1.125">Welcome</h1></body></html>';
    panel({ source, selected: target('hero', { styles: { ...computed, width: '335.94px', lineHeight: '1.125', letterSpacing: '-1.536px' } }) });
    expect((screen.getByRole('textbox', { name: 'Width' }) as HTMLInputElement).value).toBe('336px');
    expect((screen.getByRole('textbox', { name: 'Letter spacing' }) as HTMLInputElement).value).toBe('-1.5px');
    expect((screen.getByRole('textbox', { name: 'Line height' }) as HTMLInputElement).value).toBe('1.125');
  });
  it('offers only font families the upstream normalizer accepts', () => {
    for (const option of STUDIO_FONT_OPTIONS) expect(normalizeManualEditStyles({ fontFamily: option.value }, { layoutEnabled: false }).ok).toBe(true);
  });
});

describe('Studio edit panel commits', () => {
  it('commits only the edited property on Enter, arrow steps and blur', () => {
    const { onPatch } = panel();
    const size = screen.getByRole('textbox', { name: 'Font size' });
    expect((size as HTMLInputElement).value).toBe('32px');
    fireEvent.change(size, { target: { value: '48' } });
    fireEvent.keyDown(size, { key: 'Enter' });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { fontSize: '48px' } });
    fireEvent.keyDown(size, { key: 'ArrowUp' });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { fontSize: '49px' } });
    fireEvent.keyDown(size, { key: 'ArrowDown', shiftKey: true });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { fontSize: '39px' } });
    const radius = screen.getByRole('textbox', { name: 'Radius' });
    fireEvent.change(radius, { target: { value: '12px' } }); fireEvent.blur(radius);
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { borderRadius: '12px' } });
    expect(onPatch).toHaveBeenCalledTimes(4);
  });

  it('shows an invalid value inline, never patches it, and reverts on Escape', () => {
    const { onPatch } = panel();
    const size = screen.getByRole('textbox', { name: 'Font size' });
    fireEvent.change(size, { target: { value: 'huge' } });
    fireEvent.keyDown(size, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Enter a number in px.');
    expect(size.getAttribute('aria-invalid')).toBe('true');
    fireEvent.keyDown(size, { key: 'Escape' });
    expect((size as HTMLInputElement).value).toBe('32px');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(size);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('commits segment clicks and colors as single properties and text on Ctrl+Enter', () => {
    const { onPatch } = panel();
    fireEvent.click(screen.getByRole('radio', { name: 'Center' }));
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { textAlign: 'center' } });
    const color = screen.getByRole('textbox', { name: 'Color' });
    expect((color as HTMLInputElement).value).toBe('#202020');
    fireEvent.change(color, { target: { value: '#f00' } }); fireEvent.keyDown(color, { key: 'Enter' });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'hero', styles: { color: '#ff0000' } });
    const text = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(text, { target: { value: 'Hello' } }); fireEvent.keyDown(text, { key: 'Enter', ctrlKey: true });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-text', id: 'hero', value: 'Hello' });
  });

  it('keeps the canonical link target when the label changes', () => {
    const { onPatch } = panel({ selected: cta });
    expect((screen.getByRole('textbox', { name: 'Link' }) as HTMLInputElement).value).toBe('https://example.com/start');
    const text = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(text, { target: { value: 'Begin' } }); fireEvent.blur(text);
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-link', id: 'cta', text: 'Begin', href: 'https://example.com/start' });
  });

  it('shows layout controls only for layout containers and moves element HTML to the Code tab', () => {
    const { onPatch, onMode } = panel({ selected: section });
    fireEvent.click(screen.getByRole('radio', { name: 'Horizontal' }));
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: 'path-0', styles: { flexDirection: 'row' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit HTML in the Code tab' }));
    expect(onMode).toHaveBeenCalledWith('code');
    cleanup(); panel({ selected: hero });
    expect(screen.queryByRole('radiogroup', { name: 'Direction' })).toBeNull();
  });
});

describe('Studio layer tree', () => {
  it('nests reported targets by the source structure', () => {
    const tree = studioLayerTree(html, targets);
    expect(tree.map(layer => [layer.id, layer.tag, layer.children.map(child => child.id)])).toEqual([['path-0', 'section', ['hero', 'cta']], ['path-1', 'footer', ['note']]]);
    expect(tree[0]!.name).toBe('hero');
    expect(tree[0]!.children[1]!.name).toBe('Start');
  });

  it('selects a node, expands to the selection and toggles its region', () => {
    const { onSelect, onLayersOpen } = panel({ selected: note });
    const tree = screen.getByRole('tree', { name: 'Layers' });
    const selected = within(tree).getByRole('treeitem', { selected: true });
    expect(selected.textContent).toContain('Fine print');
    expect(selected.getAttribute('aria-level')).toBe('2');
    fireEvent.keyDown(selected, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(note);
    fireEvent.click(within(tree).getByText('Start'));
    expect(onSelect).toHaveBeenLastCalledWith(cta);
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    expect(onLayersOpen).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Select parent element' }));
    expect(onSelect).toHaveBeenLastCalledWith(footer);
  });
});

describe('Studio editor edit mode', () => {
  async function open() {
    render(<StudioEditor context={context} onClose={() => {}} />);
    await waitFor(() => expect(document.querySelector<HTMLIFrameElement>('iframe[title="Preview"]')?.srcdoc).toContain('Welcome'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fromPreview({ type: 'od-edit-targets', targets });
    fromPreview({ type: 'od-edit-select', target: hero });
    return screen.findByRole('textbox', { name: 'Font size' });
  }

  it('saves only the changed property instead of baking computed styles inline', async () => {
    const size = await open();
    fireEvent.change(size, { target: { value: '48px' } }); fireEvent.keyDown(size, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.html).toContain('<h1 data-od-id="hero" style="font-size: 48px;">Welcome</h1>');
  });

  it('returns to the saved state after undo and ignores no-op commits', async () => {
    // Root cause of the stale "Unsaved changes": the patcher re-serializes the
    // whole file, so an unchanged value still produced different source text.
    expect(applyManualEditPatch(html, { kind: 'set-text', id: 'hero', value: 'Welcome' }).source).not.toBe(html);
    const size = await open();
    expect(screen.getByText('Saved')).toBeTruthy();
    fromPreview({ type: 'od-edit-text-commit', id: 'hero', value: 'Welcome' });
    expect(screen.getByText('Saved')).toBeTruthy();
    fireEvent.change(size, { target: { value: '40px' } }); fireEvent.keyDown(size, { key: 'Enter' });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Undo'));
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByTitle('Undo').hasAttribute('disabled')).toBe(true);
  });

  it('keeps the selection with fresh values after the preview reports new targets', async () => {
    await open();
    fromPreview({ type: 'od-edit-targets', targets: targets.map(item => item.id === 'hero' ? { ...item, styles: { ...item.styles, fontSize: '40px' } } : item) });
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Font size' }) as HTMLInputElement).value).toBe('40px'));
    fromPreview({ type: 'od-edit-targets', targets: targets.filter(item => item.id !== 'hero') });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Font size' })).toBeNull());
    expect(screen.getByRole('navigation', { name: 'Element path' }).textContent).toBe('Page');
  });

  it('shows the page styles the preview reports in the page knobs', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Deselect' }));
    fromPreview({ type: 'semurai:page-styles', backgroundColor: 'rgba(0, 0, 0, 0)', rootBackgroundColor: 'rgb(251, 250, 247)', fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Background' }).getAttribute('placeholder')).toBe('#fbfaf7'));
    expect((screen.getByRole('combobox', { name: 'Font' }) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('Playfair Display');
  });
});

describe('Studio page knobs', () => {
  it('derives the effective page background, font and size from the computed report', () => {
    expect(studioPageStyles({ backgroundColor: 'rgb(10, 10, 10)', rootBackgroundColor: 'rgb(255, 255, 255)', fontFamily: 'Inter, sans-serif', fontSize: '16px' }))
      .toEqual({ backgroundColor: '#0a0a0a', fontFamily: 'Inter, sans-serif', fontSize: '16px' });
    // A transparent body shows the html background; both transparent means no background.
    expect(studioPageStyles({ backgroundColor: 'rgba(0, 0, 0, 0)', rootBackgroundColor: 'rgb(251, 250, 247)', fontFamily: 'Arial', fontSize: '17.6px' }))
      .toEqual({ backgroundColor: '#fbfaf7', fontFamily: 'Arial', fontSize: '18px' });
    expect(studioPageStyles({ backgroundColor: 'transparent', rootBackgroundColor: 'rgba(0, 0, 0, 0)', fontFamily: '', fontSize: 'medium' }))
      .toEqual({ backgroundColor: '', fontFamily: '', fontSize: '' });
    expect(studioPageStyles({ backgroundColor: 'url(x)', rootBackgroundColor: 42, fontFamily: 'x'.repeat(400), fontSize: '12px' }))
      .toEqual({ backgroundColor: '', fontFamily: '', fontSize: '12px' });
    expect(studioPageStyles(null)).toBeNull();
  });

  it('prefers the inline font and maps a computed one to the listed option or its own first family', () => {
    expect(studioFontFamilyName('"Playfair Display", Georgia, serif')).toBe('Playfair Display');
    expect(studioFontSelectValue('Georgia, serif', '"Times New Roman"')).toEqual({ value: 'Georgia, serif', computed: false });
    expect(studioFontSelectValue('', '"Times New Roman"')).toEqual({ value: '"Times New Roman", Times, serif', computed: true });
    expect(studioFontSelectValue(undefined, 'arial, sans-serif')).toEqual({ value: 'Arial, Helvetica, sans-serif', computed: true });
    expect(studioFontSelectValue(undefined, '"Playfair Display", Georgia, serif')).toEqual({ value: '"Playfair Display", Georgia, serif', computed: true });
    expect(studioFontSelectValue(undefined, '')).toEqual({ value: '', computed: false });
  });

  const pageStyles = { backgroundColor: '#fbfaf7', fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px' };
  it('shows computed values muted and writes an inline value only on edit', () => {
    const { onPatch } = panel({ selected: null, pageStyles });
    const background = screen.getByRole('textbox', { name: 'Background' }) as HTMLInputElement;
    expect(background.value).toBe('');
    expect(background.placeholder).toBe('#fbfaf7');
    expect(background.closest('label')!.hasAttribute('data-computed')).toBe(true);
    expect((background.closest('label')!.querySelector('span[data-computed]') as HTMLElement).style.background).toBe('rgb(251, 250, 247)');
    const font = screen.getByRole('combobox', { name: 'Font' }) as HTMLSelectElement;
    expect(font.selectedOptions[0]!.textContent).toBe('Playfair Display');
    expect(font.closest('label')!.hasAttribute('data-computed')).toBe(true);
    const size = screen.getByRole('textbox', { name: 'Base size' }) as HTMLInputElement;
    expect([size.value, size.placeholder]).toEqual(['', '18px']);
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.change(background, { target: { value: '#101010' } }); fireEvent.keyDown(background, { key: 'Enter' });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: '__body__', styles: { backgroundColor: '#101010' } });
    fireEvent.change(font, { target: { value: 'Georgia, serif' } });
    expect(onPatch).toHaveBeenLastCalledWith({ kind: 'set-style', id: '__body__', styles: { fontFamily: 'Georgia, serif' } });
    expect(onPatch).toHaveBeenCalledTimes(2);
  });

  it('shows inline body styles as the values, also on the Tweaks tab', () => {
    const source = '<!doctype html><html><head></head><body style="background-color: #222222; font-family: Georgia, serif; font-size: 20px"><h1 data-od-id="hero">Welcome</h1></body></html>';
    panel({ source, selected: null, mode: 'tweaks', pageStyles });
    const background = screen.getByRole('textbox', { name: 'Background' }) as HTMLInputElement;
    expect(background.value).toBe('#222222');
    expect(background.closest('label')!.hasAttribute('data-computed')).toBe(false);
    const font = screen.getByRole('combobox', { name: 'Font' }) as HTMLSelectElement;
    expect([font.value, font.closest('label')!.hasAttribute('data-computed')]).toEqual(['Georgia, serif', false]);
    expect((screen.getByRole('textbox', { name: 'Base size' }) as HTMLInputElement).value).toBe('20px');
    cleanup();
    // Without a report the knobs fall back to the previous hints.
    panel({ selected: null, mode: 'tweaks' });
    expect(screen.getByRole('textbox', { name: 'Background' }).getAttribute('placeholder')).toBe('None');
    expect((screen.getByRole('combobox', { name: 'Font' }) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('Default');
    expect(screen.getByRole('textbox', { name: 'Base size' }).getAttribute('placeholder')).toBe('16px');
  });
});
