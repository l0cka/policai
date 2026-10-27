/**
 * Fits a pull request diff into the model's budget. Lockfiles go last so
 * code is read first. Any file that does not fit, lockfile or not, is
 * reported as unread, so the review fails instead of passing on a change
 * nobody read.
 */

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/;

export type FittedDiff = {
  patch: string;
  unread: string[];
};

function pathOf(section: string): string {
  const match = /^diff --git a\/(.+?) b\/(.+)$/m.exec(section);
  return match?.[2] ?? "";
}

export function splitDiff(text: string): string[] {
  return text.split(/^(?=diff --git )/m).filter((section) => section.trim() !== "");
}

export function fitDiff(text: string, maxChars: number): FittedDiff {
  const sections = splitDiff(text);
  const ordered = [
    ...sections.filter((section) => !LOCKFILE.test(pathOf(section))),
    ...sections.filter((section) => LOCKFILE.test(pathOf(section))),
  ];
  const unread: string[] = [];
  const kept: string[] = [];
  let size = 0;
  for (const section of ordered) {
    if (size + section.length > maxChars) {
      unread.push(pathOf(section) || "(unnamed diff section)");
      continue;
    }
    kept.push(section);
    size += section.length;
  }
  return { patch: kept.join(""), unread };
}
