import { describe, expect, it } from 'vitest';
import { CanvasDocumentError, parseCanvasDocument } from '../src/api/canvas.js';

function fixture() {
  return {
    version: 2, name: 'Native carousel', stage: { width: 1080, height: 1080 },
    pages: [{ id: 'page-1', name: 'First page', stage: { width: 1080, height: 1080 }, nodes: [
      { className: 'Group', attrs: { id: 'composition', x: 40, y: 40 }, children: [
        { className: 'Rect', attrs: { id: 'gradient', width: 500, height: 400, fillPriority: 'linear-gradient', fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: 500, y: 400 }, fillLinearGradientColorStops: [0, '#ff7900', 1, '#fff4e8'] } },
        { className: 'Text', attrs: { id: 'headline', text: 'Zażółć gęślą jaźń', fontFamily: 'Arial', fontSize: 64, width: 800, fontStyle: 'bold', fill: '#111111' } },
      ] },
    ] }],
  };
}

describe('native Canvas document boundary', () => {
  it('preserves editable groups, text and flat native gradient attributes', () => {
    const input = fixture();
    const result = parseCanvasDocument(input);
    expect(result.pages[0]?.nodes).toEqual(input.pages[0]?.nodes);
    expect(result.activePageIndex).toBe(0);
  });

  it('rejects repeated layer ids across frames', () => {
    const input = fixture();
    input.pages.push({ ...input.pages[0]!, id: 'page-2' });
    expect(() => parseCanvasDocument(input)).toThrow('canvas_invalid_document');
  });

  it('rejects misplaced group children instead of silently rendering an empty group', () => {
    const input = fixture();
    const group = input.pages[0]!.nodes[0]!;
    Object.assign(group.attrs, { children: group.children });
    group.children = [];
    try { parseCanvasDocument(input); throw new Error('Expected rejection'); }
    catch (error) {
      expect((error as CanvasDocumentError).issues[0]?.message).toContain('beside attrs');
    }
  });

  it('rejects executable attributes while returning actionable validation issues', () => {
    const input = fixture();
    Object.assign(input.pages[0]!.nodes[0]!.attrs, { onClick: 'run()' });
    try { parseCanvasDocument(input); throw new Error('Expected rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(CanvasDocumentError);
      expect((error as CanvasDocumentError).issues).toEqual([{ path: 'document', message: 'Unsafe attribute' }]);
    }
  });

  it('reports the path of an unsupported shape without echoing the document', () => {
    const input = fixture(); input.pages[0]!.nodes[0]!.className = 'CustomScript';
    try { parseCanvasDocument(input); throw new Error('Expected rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(CanvasDocumentError);
      expect((error as CanvasDocumentError).issues[0]?.path).toBe('pages.0.nodes.0.className');
      expect(JSON.stringify((error as CanvasDocumentError).issues)).not.toContain('Zażółć');
    }
  });

  it('rejects canvas selection beyond the available frames', () => {
    expect(() => parseCanvasDocument({ ...fixture(), activePageIndex: 1 })).toThrow('canvas_invalid_document');
  });
});
