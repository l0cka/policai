export interface SummaryBlock {
  label: string | null;
  paragraphs: string[];
}

const MARKER = /(?=\bRequirement \d+:)/;
const LABEL = /^(Requirement \d+:)\s*/;
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z])/;
const PARAGRAPH_LIMIT = 400;

function groupSentences(text: string): string[] {
  const paragraphs: string[] = [];
  let current = '';
  for (const sentence of text.split(SENTENCE_END)) {
    if (current && current.length + sentence.length + 1 > PARAGRAPH_LIMIT) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

export function splitSummaryBlocks(text: string): SummaryBlock[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!MARKER.test(trimmed)) return [{ label: null, paragraphs: [trimmed] }];

  return trimmed
    .split(MARKER)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const label = LABEL.exec(segment);
      const body = label ? segment.slice(label[0].length) : segment;
      return { label: label ? label[1] : null, paragraphs: groupSentences(body) };
    });
}
