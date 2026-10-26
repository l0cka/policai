/**
 * The review body the stamp workflow reads. The model supplies blockers.
 * This module owns the marker, the single-marker rule, and repeat handling.
 */

export const REVIEW_EVENT = "COMMENT" as const;

const MARKER = /<!--\s*cursor-review:\s*(success|failure)\s*-->/gi;

export type ReviewBlocker = {
  path: string;
  title: string;
  detail: string;
};

export type ComposedReview = {
  body: string;
  conclusion: "success" | "failure";
  event: typeof REVIEW_EVENT;
  dropped: string[];
  stillOpen: string[];
};

function oneLine(value: string): string {
  return value.replace(/<!--[\s\S]*?-->/g, " ").replace(/\s+/g, " ").trim();
}

function keyOf(path: string, title: string): string {
  return `${path.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** Lines this tool wrote on an earlier review. Prose mentions do not count. */
function priorKeys(bodies: readonly string[]): Set<string> {
  const keys = new Set<string>();
  const pattern = /^(?:- |Still open: )`([^`]+)`:?\s+(.+?)(?:\. |$)/gm;
  for (const body of bodies) {
    for (const match of body.matchAll(pattern)) {
      const path = match[1] ?? "";
      const title = (match[2] ?? "").replace(/\.\s+[\s\S]*$/, "").trim();
      if (path !== "" && title !== "") keys.add(keyOf(path, title));
    }
  }
  return keys;
}

export function markerLine(conclusion: "success" | "failure"): string {
  return `<!-- cursor-review: ${conclusion} -->`;
}

export function composeReview(
  blockers: readonly ReviewBlocker[],
  priorBodies: readonly string[],
): ComposedReview {
  const known = priorKeys(priorBodies);
  const seen = new Set<string>();
  const dropped: string[] = [];
  const stillOpen: string[] = [];
  const lines: string[] = [];

  for (const blocker of blockers) {
    const path = oneLine(blocker.path);
    const title = oneLine(blocker.title).replace(/\.+$/, "");
    const detail = oneLine(blocker.detail);
    if (path === "" || title === "") continue;
    if (/^(notes?|nit|style)\b/i.test(title)) {
      dropped.push(keyOf(path, title));
      continue;
    }
    const key = keyOf(path, title);
    if (seen.has(key)) {
      dropped.push(key);
      continue;
    }
    seen.add(key);
    if (known.has(key)) {
      stillOpen.push(title);
      lines.push(`Still open: \`${path}\` ${title}`);
      continue;
    }
    const sentence = detail === "" ? `${title}.` : `${title}. ${detail}`;
    lines.push(`- \`${path}\`: ${sentence}`);
  }

  const conclusion = lines.length === 0 ? "success" : "failure";
  const prose = lines.length === 0 ? "No blocking issues." : ["Blocking.", ...lines].join("\n");
  const body = `${prose}\n\n${markerLine(conclusion)}`;
  const markers = body.match(MARKER) ?? [];
  if (markers.length !== 1) {
    throw new Error(`review body must contain exactly one cursor-review marker, found ${markers.length}`);
  }
  return { body, conclusion, event: REVIEW_EVENT, dropped, stillOpen };
}
