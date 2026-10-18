export const THEMES = [
  { key: 'generative-ai', label: 'Generative AI' },
  { key: 'courts-tribunals', label: 'Courts and tribunals' },
  { key: 'ai-governance', label: 'AI governance' },
  { key: 'transparency-disclosure', label: 'Transparency and disclosure' },
  { key: 'public-sector', label: 'Public sector use' },
  { key: 'risk-assurance', label: 'Risk and assurance' },
  { key: 'responsible-ai', label: 'Responsible AI and ethics' },
  { key: 'cyber-security', label: 'Cyber security' },
  { key: 'privacy-data', label: 'Privacy and data' },
  { key: 'legal-practice', label: 'Evidence and legal practice' },
  { key: 'human-oversight', label: 'Human oversight and verification' },
  { key: 'self-represented-litigants', label: 'Self-represented litigants' },
  { key: 'strategy-adoption', label: 'Strategy and adoption' },
  { key: 'automated-decisions', label: 'Automated decision-making' },
  { key: 'procurement-supply', label: 'Procurement and supply chain' },
  { key: 'employment', label: 'Employment and workplace' },
  { key: 'standards', label: 'Standards and lifecycle' },
  { key: 'agentic-ai', label: 'Agentic AI' },
  { key: 'frontier-ai', label: 'Frontier AI' },
  { key: 'financial-sector', label: 'Financial sector' },
  { key: 'infrastructure', label: 'Infrastructure and energy' },
  { key: 'online-safety', label: 'Online safety and deepfakes' },
] as const satisfies readonly { key: string; label: string }[];

export type ThemeId = (typeof THEMES)[number]['key'];

export const MIN_THEMES_PER_RECORD = 1;
export const MAX_THEMES_PER_RECORD = 5;
/** Minimum non-trashed register records for a listed theme (error below). The same floor triggers a warning when public records drop below it. */
export const MIN_RECORDS_PER_THEME = 2;
/** @deprecated Use {@link MIN_RECORDS_PER_THEME}. Kept as an alias for older imports. */
export const MIN_PUBLIC_RECORDS_PER_THEME = MIN_RECORDS_PER_THEME;

/** Cap for a theme id or value shown in a validation message (issue #320). */
export const MAX_THEME_MESSAGE_VALUE_CHARS = 80;

/**
 * Characters that can sit inside a quoted string without a visible mark, or
 * that break a one-line ERROR log. `JSON.stringify` leaves most of these
 * literal (U+200B, U+200D, U+FEFF, U+202E, U+2028, U+0085, DEL, …).
 */
const THEME_MESSAGE_ESCAPE =
  /[\u0000-\u001F\u007F\u0085\u200B-\u200F\u2028-\u202E\u2060\uFEFF]/gu;

function escapeThemeMessageChars(text: string): string {
  return text.replace(THEME_MESSAGE_ESCAPE, (char) => {
    const code = char.codePointAt(0)!;
    return `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

function truncateThemeMessageValue(text: string): string {
  if (text.length <= MAX_THEME_MESSAGE_VALUE_CHARS) return text;
  return `${text.slice(0, MAX_THEME_MESSAGE_VALUE_CHARS - 1)}…`;
}

/** Quote a policy id for a theme validation line so newlines cannot fake a second ERROR. */
export function formatThemeMessageLabel(label: string): string {
  return truncateThemeMessageValue(escapeThemeMessageChars(label));
}

/**
 * Format an unknown or non-string theme entry for a validation message:
 * escape non-printing characters and bound length so a 10 KB string or a
 * zero-width suffix cannot look like a valid theme id.
 */
export function formatThemeMessageValue(value: unknown): string {
  if (typeof value === 'string') {
    // Escape `\`, `"`, then non-printing so `\u200b` stays one escape unit.
    const body = escapeThemeMessageChars(
      value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'),
    );
    return `"${truncateThemeMessageValue(body)}"`;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    // JSON.stringify(1e999) is "null"; String keeps Infinity / NaN readable.
    return truncateThemeMessageValue(String(value));
  }
  if (value === undefined) {
    return 'undefined';
  }
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) return 'undefined';
    return truncateThemeMessageValue(escapeThemeMessageChars(raw));
  } catch {
    return truncateThemeMessageValue(Object.prototype.toString.call(value));
  }
}

const THEME_LABELS = Object.fromEntries(
  THEMES.map(({ key, label }) => [key, label]),
) as Record<ThemeId, string>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEME_LABELS, value);
}

export function getThemeLabel(id: ThemeId): string {
  return THEME_LABELS[id];
}
