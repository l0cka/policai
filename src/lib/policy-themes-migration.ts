import { THEMES, type ThemeId } from '@/lib/themes';

export type ThemeMapping = Readonly<Record<string, readonly string[]>>;

const THEME_IDS_BY_LABEL: ReadonlyMap<string, ThemeId> = new Map(
  THEMES.map(({ key, label }) => [label, key]),
);

function withThemesAfterTags(
  record: Record<string, unknown>,
  themes: ThemeId[],
): Record<string, unknown> {
  const entries = Object.entries(record).filter(([key]) => key !== 'themes');
  const tagsIndex = entries.findIndex(([key]) => key === 'tags');
  entries.splice(tagsIndex + 1, 0, ['themes', themes]);
  return Object.fromEntries(entries);
}

export function applyThemeMapping(
  registerJson: string,
  mapping: ThemeMapping,
): string {
  const records = JSON.parse(registerJson) as Record<string, unknown>[];
  const recordIds = new Set(records.map((record) => String(record.id)));
  const problems = [
    ...[...recordIds]
      .filter((id) => !Object.hasOwn(mapping, id))
      .map((id) => `${id}: record has no row in the mapping`),
    ...Object.keys(mapping)
      .filter((id) => !recordIds.has(id))
      .map((id) => `${id}: mapping row has no record`),
    ...Object.entries(mapping).flatMap(([id, labels]) =>
      labels
        .filter((label) => !THEME_IDS_BY_LABEL.has(label))
        .map((label) => `${id}: unknown theme label "${label}"`),
    ),
  ];
  if (problems.length > 0) {
    throw new Error(
      ['theme mapping does not match data/policies.json:', ...problems].join('\n'),
    );
  }

  const themed = records.map((record) =>
    withThemesAfterTags(
      record,
      mapping[String(record.id)].map(
        (label) => THEME_IDS_BY_LABEL.get(label) as ThemeId,
      ),
    ),
  );
  const trailingNewline = registerJson.endsWith('\n') ? '\n' : '';
  return `${JSON.stringify(themed, null, 2)}${trailingNewline}`;
}
