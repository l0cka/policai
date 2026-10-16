import { describe, expect, it } from 'vitest';
import { getPolicies } from './data-service';
import { splitSummaryBlocks } from './summary-blocks';

const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();

const rejoin = (text: string) =>
  splitSummaryBlocks(text)
    .flatMap((block) => [...(block.label ? [block.label] : []), ...block.paragraphs])
    .join(' ');

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

  describe('abbreviations at a paragraph boundary', () => {
    const filler = (length: number) => {
      const word = 'word ';
      return `${word.repeat(Math.ceil(length / word.length))}`.slice(0, length).trimEnd();
    };

    it.each([
      ['Dr.', 'the claim was filed by Dr.', 'Smith in the Federal Court.'],
      ['Mr.', 'the respondent was represented by Mr.', 'Jones on the second day.'],
      ['Mrs.', 'evidence was given by Mrs.', 'Lee on the second day.'],
      ['Ms.', 'the notice was lodged by Ms.', 'Nguyen within the time allowed.'],
      ['Prof.', 'the framework was reviewed by Prof.', 'Brown before publication.'],
      ['Ltd.', 'the business was sold by Acme Pty Ltd.', 'Smith Holdings acquired it.'],
      ['Inc.', 'the business was sold by Acme Inc.', 'Smith Holdings acquired it.'],
      ['St.', 'the premises are at 5 Church St.', 'Smith Holdings occupies them.'],
      ['No.', 'the filing must include Form No.', 'A12 as approved by the court.'],
      ['Nos.', 'the filing must include Forms Nos.', 'A12 and B3 as approved by the court.'],
      ['s.', 'the court may order disclosure under s.', 'A12 of the Act.'],
      ['ss.', 'the court may order disclosure under ss.', 'A12 and B3 of the Act.'],
      ['cl.', 'the supplier must report under cl.', 'A12 of the contract.'],
      ['reg.', 'the operator must report under reg.', 'A12 of the regulations.'],
      ['Cth.', 'the duty arises under the Privacy Act 1988 (Cth.)', 'Smith Holdings must comply.'],
      ['v.', 'the point was decided in Smith v.', 'Jones by the Full Court.'],
      ['e.g.', 'keep a register of tools, e.g.', 'Chambers lists, in one place.'],
      ['i.e.', 'keep one register, i.e.', 'Chambers keep a single list.'],
      ['etc.', 'record the names, dates, etc.', 'Chambers should keep the list.'],
    ])('keeps a sentence whole across "%s" at the 400-character boundary', (_abbreviation, head, rest) => {
      const lead = filler(390 - head.length - 1);
      const sentence = `${lead} ${head} ${rest}`;
      const [block] = splitSummaryBlocks(`Requirement 1: ${sentence}`);
      expect(block.paragraphs).toEqual([sentence]);
    });

    it('still ends a sentence at an ordinary full stop', () => {
      const [block] = splitSummaryBlocks(`Requirement 1: ${'word '.repeat(75).trim()}. Smith filed the claim in court.`);
      expect(block.paragraphs).toHaveLength(2);
    });
  });

  describe('Requirement markers', () => {
    it('does not start a block at a cross-reference inside a sentence', () => {
      const text =
        'Requirement 1: Do the thing. Requirement 2: Apply it, and see Requirement 3: of the guide, before filing.';
      const blocks = splitSummaryBlocks(text);
      expect(blocks.map((block) => block.label)).toEqual(['Requirement 1:', 'Requirement 2:']);
      expect(blocks[1].paragraphs.join(' ')).toContain('see Requirement 3: of the guide');
      expect(rejoin(text)).toBe(text);
    });

    it('leaves text with only a cross-reference as one unlabelled paragraph', () => {
      const text = 'The guide says to see Requirement 3: of the guide before filing.';
      expect(splitSummaryBlocks(text)).toEqual([{ label: null, paragraphs: [text] }]);
    });

    it('splits at a marker that starts a line', () => {
      expect(splitSummaryBlocks('Intro text\nRequirement 1: do it.')).toEqual([
        { label: null, paragraphs: ['Intro text'] },
        { label: 'Requirement 1:', paragraphs: ['do it.'] },
      ]);
    });

    it('splits at a marker that starts a sentence after an abbreviation-free full stop', () => {
      const blocks = splitSummaryBlocks('Overview here. Requirement 1: first. Requirement 2: second.');
      expect(blocks.map((block) => block.label)).toEqual([null, 'Requirement 1:', 'Requirement 2:']);
    });
  });

  describe('public records', () => {
    it('lose, duplicate and reorder no text in any public summary field', async () => {
      const policies = await getPolicies();
      expect(policies.length).toBeGreaterThan(0);
      for (const policy of policies) {
        for (const text of [policy.aiSummary, policy.description, policy.content]) {
          if (!text) continue;
          expect(normalise(rejoin(text)), policy.id).toBe(normalise(text));
        }
      }
    });
  });
});
