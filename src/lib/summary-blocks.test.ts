import { describe, expect, it } from 'vitest';
import { splitSummaryBlocks } from './summary-blocks';

describe('splitSummaryBlocks', () => {
  it('splits at each Requirement marker and labels the blocks', () => {
    const text =
      'Three requirements apply. Requirement 1: state that AI was used. Requirement 2: check the document. Requirement 3: witnesses attest.';
    expect(splitSummaryBlocks(text)).toEqual([
      { label: null, paragraphs: ['Three requirements apply.'] },
      { label: 'Requirement 1:', paragraphs: ['state that AI was used.'] },
      { label: 'Requirement 2:', paragraphs: ['check the document.'] },
      { label: 'Requirement 3:', paragraphs: ['witnesses attest.'] },
    ]);
  });

  it('starts with a label when the text opens on a marker', () => {
    expect(splitSummaryBlocks('Requirement 1: do it.')).toEqual([
      { label: 'Requirement 1:', paragraphs: ['do it.'] },
    ]);
  });

  it('breaks a long block at sentence ends, never mid-sentence', () => {
    const sentence = 'The Commission states a long sentence that fills space here and there.';
    const body = Array.from({ length: 12 }, () => sentence).join(' ');
    const [block] = splitSummaryBlocks(`Requirement 1: ${body}`);
    expect(block.paragraphs.length).toBeGreaterThan(1);
    expect(block.paragraphs.every((p) => p.length <= 400)).toBe(true);
    expect(block.paragraphs.join(' ')).toBe(body);
  });

  it('leaves text without markers as one paragraph', () => {
    const text = 'A short summary. It has two sentences.';
    expect(splitSummaryBlocks(text)).toEqual([{ label: null, paragraphs: [text] }]);
  });

  it('returns nothing for empty text', () => {
    expect(splitSummaryBlocks('')).toEqual([]);
    expect(splitSummaryBlocks('  \n ')).toEqual([]);
  });
});
