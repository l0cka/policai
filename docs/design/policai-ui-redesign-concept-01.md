# Policai UI redesign — concept 01

Status: awaiting design approval before implementation.

Generated with the built-in `imagegen` workflow on 19 July 2026. The existing
Policai logo was supplied as a reference image. No application code was changed
for this concept pass.

## Design direction

The concept treats Policai as an editorial civic-data product rather than a
generic analytics dashboard:

- warm paper canvas with deep navy ink and a single decisive cobalt accent;
- an editorial serif for page-level statements, a clean sans-serif for the
  interface, and monospace metadata for dates and provenance;
- dense, ruled information layouts with restrained cards and shadows;
- verification and source provenance visible at the point of use;
- a clear distinction between verified developments and automated radar;
- compact mobile controls that put results above the fold.

Proposed palette:

- warm ivory: `#F4F1E8`
- ink: `#121820`
- deep navy: `#102A43`
- cobalt: `#3157E8`
- eucalyptus: `#146B5A`
- muted amber: `#B7791F`

## Approval artifacts

1. `policai-redesign-concept-01-register-desktop.png`
2. `policai-redesign-concept-01-policy-detail.png`
3. `policai-redesign-concept-01-developments.png`
4. `policai-redesign-concept-01-register-mobile.png`

The screens are representative system anchors. Once approved, the same shell,
type scale, colour tokens, controls, status language, responsive rules, and
provenance patterns will extend to Courts, Agencies, Map, Timeline, Network,
Framework, Methodology, and Blog.

## Final image-generation prompt set

### Desktop register

Create a high-fidelity, shippable 1440px desktop policy register for Policai,
using the existing logo. Present it as a serious Australian public-interest
research product, not a SaaS landing page. Use a compact masthead, the headline
“Australian AI policy, made legible.”, live freshness, a four-metric strip, a
left filter rail, a dense editorial policy table, visible verified-source
indicators, and a latest-developments rail. Use the palette and typography above,
crisp one-pixel rules, modest radii, strong contrast, and practical layouts for
real policy titles. Avoid stock imagery, government insignia, glassmorphism,
gradients, fake charts, giant empty heroes, excessive cards, and tiny text.

### Policy detail

Continue the desktop register’s exact design system for a 1440px policy detail
page titled “Policy for the Responsible Use of AI in Government”. Include the
same masthead, breadcrumb, status and metadata, official-source actions, tabs,
editorial overview, a clearly separated “What this means” explanation, numbered
requirements, policy-change timeline, an “At a glance” evidence rail, detailed
source verification, legal caution, and related policies. Keep official facts,
editorial explanation, and provenance visually distinct. Avoid a generic SaaS
detail page, excessive cards, large empty space, decorative art, and weak source
hierarchy.

### Developments and radar

Continue the same system for a 1440px “Policy developments” page. Make
“Verified developments 18” and “Automated radar 13” unmistakably different
without presenting normal unverified leads as errors. Use a chronological,
date-grouped editorial feed with event type, summary, jurisdiction, source,
verification, and register links. Add a compact collection-health and source-
coverage rail plus a “How to read this feed” legend. Avoid clickbait news styling,
dashboard clutter, alarming red, charts, and excessive card containers.

### Mobile register

Translate the desktop system into a 390px mobile register without squeezing the
desktop sidebar into the viewport. Use a slim data-current strip, compact brand
header, short introduction, trust summary, full-width search, two touch-friendly
filter/sort controls, removable chips, a small developments callout, and compact
policy result cards with status, date, and verified-source provenance. Keep
results visible early, use at least 44px touch targets, and prevent horizontal
overflow. Avoid the current large disclaimer/filter stack, a giant mobile hero,
tiny metadata, and unnecessary bottom navigation.
