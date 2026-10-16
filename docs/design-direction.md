# Design direction

The register, policy pages and feeds keep the editorial-index identity described in [ui-editorial-index.md](./ui-editorial-index.md): warm paper, forest ink, Georgia for titles, Arial for the interface, mono small caps for metadata, rules instead of shadows. The 2026-10-16 review (`~/Reports/2026-10-16-policai-design-review/`) found no defect in that identity. The weak spot is the newest surface, `/analysis`: its pieces are laid out with the register's interface typography, not a publication's reading typography.

## Principles

- **A publication first, a dashboard second.** Pages people read for minutes (analysis pieces, policy summaries) get reading typography. Pages people scan (register, developments) keep the dense interface type.
- **One voice per role.** Georgia carries titles and section heads. Arial carries interface and short text. Long-form body text is the one place the roles may change, and only for written pieces.
- **Quiet chrome on reading pages.** Collection status, pills and repeated labels belong to the data surfaces. A written piece shows its type once, its title, its byline and its text.
- **Calm colour.** Forest, paper and ink carry the identity. A second hue (the lavender "Analysis" pill borrows `--status-amended`) needs a reason, and status colours stay for status.
- **Images support the text.** A lead image never pushes the first paragraph below the fold at 1440 x 900 or 390 x 844.

## What to improve, in order

1. Article reading typography: serif body, a 66-character measure, Georgia section heads, and the unused `.article-title` token applied.
2. Article header: one type label, a capped lead image, no collection strip.
3. Analysis index on phone: full-width thumbnails; desktop gap between text and image.
4. Policy page summary: structured, wider column.

Each is filed as a `design` issue with options, states and browser checks.

## Constraints

- System fonts only, no web fonts and no external images. Images follow [editorial-policy.md](./editorial-policy.md#images).
- Token changes go in `design/tokens.css`, then `node scripts/sync-design-tokens.mjs`. A2J imports the same tokens, so a token that only the article needs stays in `src/app/globals.css`.
- Light and dark must both pass: AA contrast, no horizontal scroll at 390 px, long titles wrap.

## Review method

Playwright at 1440 x 900 and 390 x 844, light and dark, full-page and above-the-fold shots, console and response errors recorded. Replay with `node shoot.mjs` from the report folder against a running site.
