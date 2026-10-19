export interface PolicyTextDiff {
  added: string[];
  removed: string[];
}

/**
 * Prior instrument text stored beside the register, not on the policy.
 * `content` is optional: omit it, or leave it blank, when nothing is retained.
 * `policyRevisionHash` never reads this value.
 */
export interface PolicyPriorBody {
  policyId: string;
  content?: string;
}

/** The retained prior body for one record, or null when none is stored. */
export function retainedPriorBody(
  entries: readonly PolicyPriorBody[],
  policyId: string,
): string | null {
  const matches = entries.filter(
    (entry) =>
      entry.policyId === policyId &&
      typeof entry.content === 'string' &&
      entry.content.trim() !== '',
  );
  if (matches.length !== 1) return null;
  return matches[0].content ?? null;
}

/** Split on newlines. An empty body has no lines. */
function linesOf(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

/**
 * Line diff of two instrument bodies. Shared lines are omitted.
 * Does not call a model.
 */
export function diffPolicyText(before: string, after: string): PolicyTextDiff {
  if (before === after) return { added: [], removed: [] };

  const previous = linesOf(before);
  const next = linesOf(after);
  const previousCount = previous.length;
  const nextCount = next.length;
  const lengths: number[][] = Array.from({ length: previousCount + 1 }, () =>
    new Array<number>(nextCount + 1).fill(0),
  );

  for (let previousIndex = previousCount - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = nextCount - 1; nextIndex >= 0; nextIndex -= 1) {
      lengths[previousIndex][nextIndex] =
        previous[previousIndex] === next[nextIndex]
          ? lengths[previousIndex + 1][nextIndex + 1] + 1
          : Math.max(lengths[previousIndex + 1][nextIndex], lengths[previousIndex][nextIndex + 1]);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let previousIndex = 0;
  let nextIndex = 0;
  while (previousIndex < previousCount && nextIndex < nextCount) {
    if (previous[previousIndex] === next[nextIndex]) {
      previousIndex += 1;
      nextIndex += 1;
    } else if (lengths[previousIndex + 1][nextIndex] >= lengths[previousIndex][nextIndex + 1]) {
      removed.push(previous[previousIndex]);
      previousIndex += 1;
    } else {
      added.push(next[nextIndex]);
      nextIndex += 1;
    }
  }
  while (previousIndex < previousCount) {
    removed.push(previous[previousIndex]);
    previousIndex += 1;
  }
  while (nextIndex < nextCount) {
    added.push(next[nextIndex]);
    nextIndex += 1;
  }

  return { added, removed };
}
