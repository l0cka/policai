/**
 * The review body the stamp workflow reads. The model supplies blockers.
 * This module owns the marker, the single-marker rule, and repeat handling.
 */

export const REVIEW_EVENT = "COMMENT" as const;

/** Marks a review this agent wrote, so repeat handling ignores everyone else's. */
export const SIGNATURE = "<!-- policai-pr-review -->";

const MARKER = /<!--\s*cursor-review:\s*(success|failure)\s*-->/gi;

export type ReviewBlocker = {
  path: string;
  title: string;
  detail: string;
};

/** A blocker still open on this agent's latest review, as the model sees it. */
export type PriorBlocker = {
  id: string;
  path: string;
  title: string;
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

/** The body wraps paths in backticks and titles in `**`, so neither may hold its delimiter. */
function cleanPath(value: string): string {
  return oneLine(value).replace(/`/g, "");
}

function cleanTitle(value: string): string {
  return oneLine(value).replace(/\*\*/g, "").replace(/\.+$/, "").trim();
}

function keyOf(path: string, title: string): string {
  return `${path.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

export function isOwnReview(body: string): boolean {
  return body.includes(SIGNATURE);
}

/**
 * The blockers open on the newest review this agent wrote. A blocker fixed
 * since then is not on that review, so it is never raised again.
 */
export function priorBlockers(bodies: readonly string[]): PriorBlocker[] {
  const latest = bodies.filter(isOwnReview).at(-1);
  if (latest === undefined) return [];
  const pattern = /^(?:- |Still open: )`([^`]+)`:? \*\*(.+?)\*\*/gm;
  const found: PriorBlocker[] = [];
  const seen = new Set<string>();
  for (const match of latest.matchAll(pattern)) {
    const path = match[1] ?? "";
    const title = match[2] ?? "";
    const key = keyOf(path, title);
    if (path === "" || title === "" || seen.has(key)) continue;
    seen.add(key);
    found.push({ id: `P${found.length + 1}`, path, title });
  }
  return found;
}

export function markerLine(conclusion: "success" | "failure"): string {
  return `<!-- cursor-review: ${conclusion} -->`;
}

export function composeReview(
  blockers: readonly ReviewBlocker[],
  input: {
    prior?: readonly PriorBlocker[];
    stillOpenIds?: readonly string[];
    unreadPaths?: readonly string[];
  } = {},
): ComposedReview {
  const prior = input.prior ?? [];
  const priorByKey = new Map(prior.map((item) => [keyOf(item.path, item.title), item]));
  const priorById = new Map(prior.map((item) => [item.id, item]));
  const open = new Map<string, PriorBlocker>();
  const seen = new Set<string>();
  const dropped: string[] = [];
  const fresh: string[] = [];

  for (const id of input.stillOpenIds ?? []) {
    const item = priorById.get(id.trim());
    if (item !== undefined) open.set(item.id, item);
  }

  for (const blocker of blockers) {
    const path = cleanPath(blocker.path) || "(no path)";
    const title = cleanTitle(blocker.title) || "(untitled blocker)";
    const detail = oneLine(blocker.detail);
    const key = keyOf(path, title);
    if (seen.has(key)) {
      dropped.push(key);
      continue;
    }
    seen.add(key);
    const earlier = priorByKey.get(key);
    if (earlier !== undefined) {
      open.set(earlier.id, earlier);
      continue;
    }
    fresh.push(`- \`${path}\`: **${title}**${detail === "" ? "" : ` ${detail}`}`);
  }

  const lines = [
    ...fresh,
    ...[...open.values()].map((item) => `Still open: \`${item.path}\` **${item.title}**`),
  ];
  const unread = (input.unreadPaths ?? []).map((path) => cleanPath(path) || "(unnamed file)");
  if (unread.length > 0) {
    const list = unread.map((path) => `\`${path}\``).join(", ");
    lines.push(`Not reviewed: the diff was too large to read in full. Unread files: ${list}.`);
  }

  const conclusion = lines.length === 0 ? "success" : "failure";
  const prose = lines.length === 0 ? "No blocking issues." : ["Blocking.", ...lines].join("\n");
  const body = `${SIGNATURE}\n${prose}\n\n${markerLine(conclusion)}`;
  const markers = body.match(MARKER) ?? [];
  if (markers.length !== 1) {
    throw new Error(`review body must contain exactly one cursor-review marker, found ${markers.length}`);
  }
  return {
    body,
    conclusion,
    event: REVIEW_EVENT,
    dropped,
    stillOpen: [...open.values()].map((item) => item.title),
  };
}
