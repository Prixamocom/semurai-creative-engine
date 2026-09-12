const presentationNs = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const drawingNs = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** The pinned converter already creates related notes parts. Populate only their
 * body placeholders, preserving native slide objects, masters and relationships. */
export async function withStudioSpeakerNotes(base64: string, notes: readonly (string | null)[]): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (!slides.length || slides.length !== notes.length) throw new Error('Presentation notes do not match slides');
  for (const [index, note] of notes.entries()) {
    const name = `ppt/notesSlides/notesSlide${index + 1}.xml`;
    const file = zip.file(name);
    if (!file) throw new Error('Presentation notes part is missing');
    const xml = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Invalid presentation notes');
    const shape = [...xml.getElementsByTagNameNS(presentationNs, 'sp')].find(element =>
      [...element.getElementsByTagNameNS(presentationNs, 'ph')].some(placeholder => placeholder.getAttribute('type') === 'body'));
    const body = shape?.getElementsByTagNameNS(presentationNs, 'txBody')[0];
    if (!body) throw new Error('Presentation notes body is missing');
    for (const child of [...body.children]) if (child.namespaceURI === drawingNs && child.localName === 'p') child.remove();
    for (const line of (note ?? '').split(/\r\n|\r|\n/)) {
      const paragraph = xml.createElementNS(drawingNs, 'a:p');
      const run = xml.createElementNS(drawingNs, 'a:r');
      const text = xml.createElementNS(drawingNs, 'a:t');
      text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      // XML 1.0 excludes control characters except tab, LF and CR.
      text.textContent = line.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '');
      run.appendChild(text); paragraph.appendChild(run); body.appendChild(paragraph);
    }
    zip.file(name, new XMLSerializer().serializeToString(xml));
  }
  return zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
}
