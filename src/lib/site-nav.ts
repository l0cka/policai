/**
 * The site's information architecture. The header shows each section once;
 * a section's views are different ways of reading the same material, and the
 * footer lists them under their section.
 */
export type NavLink = { href: string; label: string };

export type NavSection = NavLink & {
  views: readonly NavLink[];
  /** Routes that belong to the section without being one of its views. */
  alsoMatches?: readonly string[];
};

export const PRIMARY_SECTIONS: readonly NavSection[] = [
  {
    href: '/',
    label: 'Register',
    views: [
      { href: '/', label: 'Records' },
      { href: '/timeline', label: 'Timeline' },
      { href: '/coverage', label: 'Coverage map' },
      { href: '/rule-finder', label: 'Rule finder' },
    ],
    alsoMatches: ['/policies'],
  },
  {
    href: '/this-week',
    label: 'Updates',
    views: [
      { href: '/this-week', label: 'This week' },
      { href: '/developments', label: 'Developments' },
    ],
  },
  { href: '/legislation', label: 'Legislation', views: [] },
  { href: '/courts', label: 'Courts', views: [] },
  { href: '/analysis', label: 'Analysis', views: [] },
];

export const ABOUT_SECTION: NavSection = {
  href: '/methodology',
  label: 'About',
  views: [
    { href: '/methodology', label: 'Methodology' },
    { href: '/status', label: 'Source status' },
    { href: '/status/refusals', label: 'Refusing sites' },
    { href: '/status/reuse', label: 'Reuse terms' },
  ],
};

export const A2J_URL = 'https://a2j.policai.org';

function routeMatches(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function sectionRoutes(section: NavSection): string[] {
  return [section.href, ...section.views.map((view) => view.href), ...(section.alsoMatches ?? [])];
}

export function isSectionActive(section: NavSection, pathname: string): boolean {
  return sectionRoutes(section).some((href) => routeMatches(pathname, href));
}

/** The section whose views include this exact page, for the section sub-nav. */
export function sectionForView(pathname: string): NavSection | null {
  return (
    [...PRIMARY_SECTIONS, ABOUT_SECTION].find(
      (section) => section.views.length > 1 && section.views.some((view) => view.href === pathname),
    ) ?? null
  );
}
