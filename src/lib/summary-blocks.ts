export interface SummaryBlock {
  label: string | null;
  paragraphs: string[];
}

const MARKER = /\bRequirement \d+:/g;
const LABEL = /^(Requirement \d+:)\s*/;
const SENTENCE_END = /[.!?]\s+(?=[A-Z])/g;
const PARAGRAPH_LIMIT = 400;
const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'hon',
  'no', 'nos', 's', 'ss', 'cl', 'reg', 'regs', 'sch', 'pt', 'div', 'art', 'para', 'paras',
  'pty', 'ltd', 'inc', 'co', 'corp', 'st',
  'cth', 'v', 'vs', 'e.g', 'i.e', 'etc',
]);

function endsAbbreviation(text: string, stopIndex: number): boolean {
  if (text[stopIndex] !== '.') return false;
  const word = /(\S+)$/.exec(text.slice(Math.max(0, stopIndex - 12), stopIndex))?.[1];
  return word !== undefined && ABBREVIATIONS.has(word.replace(/^[("']+/, '').toLowerCase());
}

function sentenceStarts(text: string): number[] {
  const starts = [0];
  for (const match of text.matchAll(SENTENCE_END)) {
    if (!endsAbbreviation(text, match.index)) starts.push(match.index + match[0].length);
  }
  return starts;
}

function groupSentences(text: string): string[] {
  const starts = sentenceStarts(text);
  const paragraphs: string[] = [];
  let current = '';
  starts.forEach((start, index) => {
    const sentence = text.slice(start, starts[index + 1]).trimEnd();
    if (current && current.length + sentence.length + 1 > PARAGRAPH_LIMIT) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  });
  if (current) paragraphs.push(current);
  return paragraphs;
}

function markerOffsets(text: string): number[] {
  const starts = new Set(sentenceStarts(text));
  return [...text.matchAll(MARKER)]
    .map((match) => match.index)
    .filter((index) => starts.has(index) || /\n\s*$/.test(text.slice(0, index)));
}

export function splitSummaryBlocks(text: string): SummaryBlock[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const offsets = markerOffsets(trimmed);
  if (offsets.length === 0) return [{ label: null, paragraphs: [trimmed] }];

  return [0, ...offsets]
    .map((start, index, all) => trimmed.slice(start, all[index + 1]).trim())
    .filter(Boolean)
    .map((segment) => {
      const label = LABEL.exec(segment);
      const body = label ? segment.slice(label[0].length) : segment;
      return { label: label ? label[1] : null, paragraphs: groupSentences(body) };
    });
}
