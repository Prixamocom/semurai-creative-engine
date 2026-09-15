import { z } from 'zod';

export class CanvasDocumentError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) { super('canvas_invalid_document'); }
}

const stage = z.object({ width: z.number().int().min(100).max(8192), height: z.number().int().min(100).max(8192) }).strict();
const node: z.ZodType<{ className: string; attrs: Record<string, unknown>; children?: unknown[] | undefined }> = z.lazy(() => z.object({
  className: z.enum(['Text', 'Rect', 'Circle', 'Ellipse', 'Line', 'Arrow', 'RegularPolygon', 'Star', 'Image', 'Group', 'Ring', 'Arc', 'Wedge', 'Path']),
  attrs: z.record(z.string(), z.unknown()), children: z.array(node).max(200).optional(),
}).strict());
const page = z.object({ id: z.string().min(1).max(100), name: z.string().max(240), stage,
  nodes: z.array(node).min(1).max(500), annotations: z.array(z.unknown()).default([]),
  guides: z.array(z.unknown()).default([]), preview: z.string().nullable().optional(), meta: z.record(z.string(), z.unknown()).default({}) });
const canvas = z.object({ version: z.literal(2), name: z.string().min(1).max(240), stage,
  nodes: z.array(node).default([]), pages: z.array(page).min(1).max(30), activePageIndex: z.number().int().min(0).default(0),
  annotations: z.array(z.unknown()).default([]), meta: z.record(z.string(), z.unknown()).default({}),
});

/** Native editable Canvas v2. Keep the service vendored copy byte-identical. */
export function parseCanvasDocument(value: unknown) {
  try {
    const document = canvas.parse(value);
    if (document.activePageIndex >= document.pages.length) throw new Error('Invalid frame count');
    const ids = new Set<string>();
    let count = 0;
    function inspect(nodes: unknown[], depth = 0): void {
      if (depth > 8) throw new Error('Excessive nesting');
      for (const raw of nodes) {
        const item = node.parse(raw);
        if (++count > 3000) throw new Error('Too many nodes');
        const id = item.attrs.id;
        if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('Missing/duplicate layer id');
        ids.add(id);
        if ('children' in item.attrs) throw new Error('Place children beside attrs on the Group node, never inside attrs');
        for (const [key, attr] of Object.entries(item.attrs)) {
          if (/^on/i.test(key) || ['__proto__', 'constructor', 'prototype', 'sceneFunc', 'hitFunc', 'image'].includes(key)) throw new Error('Unsafe attribute');
          if (typeof attr === 'number' && (!Number.isFinite(attr) || Math.abs(attr) > 100_000)) throw new Error('Invalid geometry');
          if (['x', 'y', 'width', 'height', 'fontSize', 'rotation', 'opacity', 'scaleX', 'scaleY', 'radius', 'strokeWidth', 'letterSpacing', 'lineHeight'].includes(key) && typeof attr !== 'number') throw new Error('Invalid numeric attribute');
          if (['text', 'fontFamily', 'fontStyle', 'fill', 'stroke', 'align', 'direction'].includes(key) && typeof attr !== 'string') throw new Error('Invalid string attribute');
          if (['width', 'height', 'fontSize', 'radius'].includes(key) && typeof attr === 'number' && attr < 0) throw new Error('Negative dimensions');
          if (key === 'points' && (!Array.isArray(attr) || attr.length > 2000 || !attr.every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000))) throw new Error('Invalid points');
          if (typeof attr === 'string' && attr.length > (/^(src|url|imageUrl)$/i.test(key) ? 350_000 : 24_000)) throw new Error('Excessive text');
          if (/^(src|url|imageUrl)$/i.test(key) && (typeof attr !== 'string' || !/^https:\/\//.test(attr) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(attr))) throw new Error('Unsafe image URL');
        }
        if (item.children) inspect(item.children, depth + 1);
      }
    }
    for (const frame of document.pages) inspect(frame.nodes);
    if (new Set(document.pages.map(page => page.id)).size !== document.pages.length) throw new Error('Duplicate page id');
    return document;
  } catch (error) {
    throw new CanvasDocumentError(error instanceof z.ZodError
      ? error.issues.slice(0, 10).map(issue => ({ path: issue.path.join('.'), message: issue.message.slice(0, 240) }))
      : [{ path: 'document', message: error instanceof Error ? error.message : 'Invalid document' }]);
  }
}
