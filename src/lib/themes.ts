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
export const MIN_PUBLIC_RECORDS_PER_THEME = 2;

const THEME_LABELS = Object.fromEntries(
  THEMES.map(({ key, label }) => [key, label]),
) as Record<ThemeId, string>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(THEME_LABELS, value);
}

export function getThemeLabel(id: ThemeId): string {
  return THEME_LABELS[id];
}
