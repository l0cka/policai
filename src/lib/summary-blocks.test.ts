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

  describe('marker rule', () => {
    const labels = (text: string) => splitSummaryBlocks(text).map((block) => block.label);

    it.each([
      ['an abbreviation full stop (etc.)', 'Requirement 1: record names, dates, etc. Requirement 2: check it.'],
      ['an abbreviation full stop (Pty Ltd.)', 'Requirement 1: disclose to Acme Pty Ltd. Requirement 2: check it.'],
      ['an abbreviation full stop (no.)', 'Requirement 1: it was no. Requirement 2: check it.'],
      ['a semicolon', 'Requirement 1: state the use; Requirement 2: check it.'],
      ['a full stop and bracket', 'Requirement 1: state the use (see the Act.) Requirement 2: check it.'],
      ['a full stop and double quote', 'Requirement 1: state "the use." Requirement 2: check it.'],
      ['a full stop and single quote', "Requirement 1: state 'the use.' Requirement 2: check it."],
      ['an exclamation mark', 'Requirement 1: state the use! Requirement 2: check it.'],
      ['a question mark', 'Requirement 1: state the use? Requirement 2: check it.'],
      ['a newline', 'Requirement 1: state the use\n  Requirement 2: check it.'],
    ])('starts a block after %s', (_name, text) => {
      expect(labels(text)).toEqual(['Requirement 1:', 'Requirement 2:']);
      expect(normalise(rejoin(text))).toBe(normalise(text));
    });

    it.each([
      'Requirement 1: Apply it, and see Requirement 3: of the guide.',
      'Requirement 1: Apply it under Requirement 3: the guide.',
      'Requirement 1: Apply it as in Requirement 4: above.',
      'Requirement 1: Apply it (see Requirement 4: above).',
      'Requirement 1: Apply it, etc. and see Requirement 4: above.',
    ])('keeps a cross-reference inside its sentence: %s', (text) => {
      expect(labels(text)).toEqual(['Requirement 1:']);
      expect(rejoin(text)).toBe(text);
    });

    it('does not split a marker glued to the previous word or quote', () => {
      expect(labels('Requirement 1: do it."Requirement 2: no.')).toEqual(['Requirement 1:']);
    });

    it('keeps a no-space-after-colon pair intact but inserts the missing space', () => {
      const text = 'Requirement 1:Requirement 2:';
      expect(rejoin(text)).toBe('Requirement 1: Requirement 2:');
    });

    it('stays linear on many line-start markers', () => {
      const text = 'Requirement 1: x\n'.repeat(32_000);
      const started = performance.now();
      const blocks = splitSummaryBlocks(text);
      expect(performance.now() - started).toBeLessThan(1500);
      expect(blocks).toHaveLength(32_000);
    });
  });

  describe('generated inputs', () => {
    const mulberry32 = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const WORDS = ['the', 'court', 'must', 'Smith', 'record', 'AI', 'use', 'filed', '(Cth)', 'Acme'];
    const ABBREVIATIONS = ['etc.', 'Ltd.', 'no.', 'Dr.', 'e.g.', 'i.e.', 'St.', 'v.'];
    const STRUCTURAL = ['. ', '; ', '.) ', '." ', ".' ", '! ', '? ', '\n', '.\n  '];
    const INLINE = [' ', '  ', ', '];
    const GAP = [' ', '\n', '  '];

    const generate = (seed: number) => {
      const random = mulberry32(seed);
      const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
      let text = '';
      let boundary = true;
      let structural = 0;
      const count = 5 + Math.floor(random() * 40);
      for (let n = 0; n < count; n++) {
        const roll = random();
        if (roll < 0.25) {
          text += `Requirement ${n}:`;
          if (boundary) structural++;
          const gap = pick(GAP);
          text += gap;
          boundary = gap === '\n';
        } else if (roll < 0.35) {
          text += `see Requirement ${n}:`;
          const gap = pick(GAP);
          text += gap;
          boundary = gap === '\n';
        } else if (roll < 0.55) {
          text += pick(ABBREVIATIONS);
          text += pick([' ', ' ', '\n']);
          boundary = true;
        } else {
          text += pick(WORDS);
          const separator = pick([...STRUCTURAL, ...INLINE]);
          text += separator;
          boundary = STRUCTURAL.includes(separator);
        }
      }
      return { text, structural };
    };

    it('lose, duplicate and reorder nothing, and label exactly the structural markers', () => {
      const started = performance.now();
      for (let seed = 1; seed <= 2000; seed++) {
        const { text, structural } = generate(seed);
        expect(normalise(rejoin(text)), `seed ${seed}`).toBe(normalise(text));
        const labelled = splitSummaryBlocks(text).filter((block) => block.label).length;
        expect(labelled, `seed ${seed}: ${JSON.stringify(text)}`).toBe(structural);
      }
      expect(performance.now() - started).toBeLessThan(10_000);
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
