/**
 * Fits a pull request diff into the model's budget. Lockfiles are left out
 * because their changes follow from `package.json`. Any other file that does
 * not fit is reported as unread, so the review fails instead of passing on
 * code nobody read.
 */

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/;

export type FittedDiff = {
  patch: string;
  lockfiles: string[];
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
  const lockfiles: string[] = [];
  const unread: string[] = [];
  const kept: string[] = [];
  let size = 0;
  for (const section of splitDiff(text)) {
    const path = pathOf(section);
    if (LOCKFILE.test(path)) {
      lockfiles.push(path);
      continue;
    }
    if (size + section.length > maxChars) {
      unread.push(path === "" ? "(unnamed diff section)" : path);
      continue;
    }
    kept.push(section);
    size += section.length;
  }
  const header = lockfiles.length === 0
    ? ""
    : `# Lockfile changes left out: ${lockfiles.join(", ")}\n`;
  return { patch: header + kept.join(""), lockfiles, unread };
}
