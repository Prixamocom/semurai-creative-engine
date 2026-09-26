import { describe, expect, it } from 'vitest';
import { studioBriefParts, studioEditBrief } from '../../src/semurai/studio-brief';
import { reviewBrief, type ReviewTarget } from '../../src/semurai/studio-review';

const target: ReviewTarget = { file: 'index.html', version: 4, label: 'h1', selector: 'body > h1', text: 'Welcome', elementId: 'hero' };

describe('studioBriefParts', () => {
  it('returns the instruction of a whole-file request', () => {
    expect(studioBriefParts(studioEditBrief('index.html', '  Make the hero darker  '))).toEqual({ instruction: 'Make the hero darker' });
    expect(studioBriefParts(studioEditBrief('pages/about.html', 'Line one\nLine two'))).toEqual({ instruction: 'Line one\nLine two' });
  });

  it('splits a selection brief into the instruction and its target', () => {
    expect(studioBriefParts(reviewBrief(target, 'Shorter heading\n'))).toEqual({
      instruction: 'Shorter heading', target: { file: 'index.html', version: 4, label: 'h1', text: 'Welcome' },
    });
  });

  it('keeps the slide of a deck selection', () => {
    const parts = studioBriefParts(reviewBrief({ ...target, file: 'deck.html', slideIndex: 2, label: 'Title' }, 'Bigger title'));
    expect(parts).toEqual({ instruction: 'Bigger title', target: { file: 'deck.html', version: 4, label: 'Title', text: 'Welcome', slideIndex: 2 } });
  });

  it('reads briefs stored by earlier builds', () => {
    expect(studioBriefParts('Edit only the requested part of index.html.\nSelection from version 2:\n{"label":"h1"}\nUser instruction:\nShorter heading'))
      .toEqual({ instruction: 'Shorter heading', target: { file: 'index.html', version: 2, label: 'h1' } });
    expect(studioBriefParts('Edit the file index.html within this project. Preserve other files.\nAdd a footer')).toEqual({ instruction: 'Add a footer' });
    expect(studioBriefParts('Build a coffee landing page')).toEqual({ instruction: 'Build a coffee landing page' });
  });

  it('survives a damaged selection without showing the JSON', () => {
    const parts = studioBriefParts('Edit only the requested part of index.html. Preserve other files and unrelated content.\nSelection from version 3, slide 5:\n{"label":"h1",\nUser instruction:\nFix it');
    expect(parts).toEqual({ instruction: 'Fix it', target: { file: 'index.html', version: 3, slideIndex: 4 } });
    expect(studioBriefParts('Something else\n[1,2]\nUser instruction:\nOnly this')).toEqual({ instruction: 'Only this' });
    expect(studioBriefParts('Edit only the requested part of index.html.\nSelection from version 1:\n[1]\nUser instruction:\nArray target')).toEqual({ instruction: 'Array target', target: { file: 'index.html', version: 1 } });
  });

  it('keeps an instruction that repeats the marker', () => {
    expect(studioBriefParts(reviewBrief(target, 'Quote this:\nUser instruction:\nverbatim')).instruction).toBe('Quote this:\nUser instruction:\nverbatim');
  });

  it('tolerates empty and non-string briefs', () => {
    expect(studioBriefParts('')).toEqual({ instruction: '' });
    expect(studioBriefParts(undefined as unknown as string)).toEqual({ instruction: '' });
  });
});
