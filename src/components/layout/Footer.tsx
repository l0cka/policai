import Link from 'next/link';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { A2J_URL, ABOUT_SECTION, PRIMARY_SECTIONS, type NavLink } from '@/lib/site-nav';

type FooterLink = NavLink & { external?: boolean };

const [register, updates, ...sections] = PRIMARY_SECTIONS;

// The footer mirrors the header's sections, with each section's views listed
// under it, and adds the machine-readable and off-site links.
const groups: Array<{ label: string; links: FooterLink[] }> = [
  { label: register.label, links: [...register.views] },
  { label: updates.label, links: [...updates.views, { href: '/feed.xml', label: 'RSS' }] },
  { label: 'Sections', links: sections.map(({ href, label }) => ({ href, label })) },
  {
    label: ABOUT_SECTION.label,
    links: [
      ...ABOUT_SECTION.views,
      { href: '/api/policies', label: 'API' },
      { href: 'https://github.com/l0cka/policai', label: 'GitHub', external: true },
      { href: 'https://github.com/l0cka/policai/issues', label: 'Feedback', external: true },
      { href: A2J_URL, label: 'Policai A2J' },
    ],
  },
];

const linkClass =
  'underline-grow transition-colors duration-[var(--dur-fast)] hover:text-foreground';

export function Footer() {
  return (
    <footer className="border-t border-[var(--rule-heavy)]">
      {/* Bottom padding keeps the last links clear of the fixed back-to-top
          button, so they are never hidden when focused. */}
      <div className="container mx-auto grid gap-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:px-8">
        <div className="flex max-w-md flex-col gap-3 text-xs leading-5 text-muted-foreground">
          <p>
            An open register of Australian AI policy for practitioners. Every
            record is checked against its official source, and the data is
            versioned in Git.
          </p>
          <p>
            A register, not legal advice. Check the official document for
            scope, commencement and current obligations.
          </p>
          <ThemeToggle className="mt-2 self-start" />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 text-xs sm:grid-cols-4">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2.5">
              <p className="page-eyebrow">{group.label}</p>
              {group.links.map((link) =>
                link.href.startsWith('http') ? (
                  <a
                    key={link.href}
                    href={link.href}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={`${linkClass} self-start text-muted-foreground`}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href} className={`${linkClass} self-start text-muted-foreground`}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
