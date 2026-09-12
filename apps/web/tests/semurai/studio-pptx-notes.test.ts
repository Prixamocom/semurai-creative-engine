// @vitest-environment jsdom
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { withStudioSpeakerNotes } from '../../src/semurai/studio-pptx-notes';

const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
async function fixture() {
  const zip = new JSZip();
  for (let i = 1; i <= 2; i++) {
    zip.file(`ppt/slides/slide${i}.xml`, '<native-text-and-shapes/>');
    zip.file(`ppt/notesSlides/notesSlide${i}.xml`, `<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Old note</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${i}</a:t></a:r></a:p></p:txBody></p:sp></p:notes>`);
  }
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<relationships/>');
  return zip.generateAsync({ type: 'base64' });
}

it('writes Unicode notes in slide order without changing native slides or relationships', async () => {
  const input = await fixture();
  const result = await JSZip.loadAsync(await withStudioSpeakerNotes(input, [' Zażółć & <tag>\nمرحبا\n', null]), { base64: true });
  const xml = new DOMParser().parseFromString(await result.file('ppt/notesSlides/notesSlide1.xml')!.async('string'), 'application/xml');
  expect(xml.querySelector('parsererror')).toBeNull();
  expect([...xml.getElementsByTagNameNS(a, 't')].map(node => node.textContent)).toEqual([' Zażółć & <tag>', 'مرحبا', '', '1']);
  expect(await result.file('ppt/notesSlides/notesSlide2.xml')!.async('string')).not.toContain('Old note');
  const before = await JSZip.loadAsync(input, { base64: true });
  for (const name of Object.keys(before.files).filter(name => !before.files[name].dir && !name.startsWith('ppt/notesSlides/'))) {
    expect(await result.file(name)!.async('string')).toBe(await before.file(name)!.async('string'));
  }
});

it('rejects missing notes parts or slide mismatch instead of silently losing notes', async () => {
  await expect(withStudioSpeakerNotes(await fixture(), ['One'])).rejects.toThrow('match slides');
  const zip = await JSZip.loadAsync(await fixture(), { base64: true });
  zip.remove('ppt/notesSlides/notesSlide2.xml');
  await expect(withStudioSpeakerNotes(await zip.generateAsync({ type: 'base64' }), ['One', 'Two'])).rejects.toThrow('part is missing');
});
