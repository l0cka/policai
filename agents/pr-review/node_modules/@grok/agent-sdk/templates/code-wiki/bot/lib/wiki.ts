export const WIKI_DIR = "wiki";

const PAGE = /^[A-Za-z0-9._-]+\.md$/;

export function isWikiPath(path: string): boolean {
  return path === WIKI_DIR || path.startsWith(`${WIKI_DIR}/`);
}

export function wikiPagePath(raw: string): string | undefined {
  const path = raw.replace(/^\/+/, "");
  if (path.includes("..") || path.includes("\\")) {
    return undefined;
  }
  if (!path.startsWith(`${WIKI_DIR}/`) || !path.endsWith(".md")) {
    return undefined;
  }
  const name = path.slice(WIKI_DIR.length + 1);
  if (!PAGE.test(name)) {
    return undefined;
  }
  return `${WIKI_DIR}/${name}`;
}
