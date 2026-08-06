import Link from 'next/link';

const links = [
  { href: '/methodology', label: 'Methodology', external: false },
  { href: '/api/policies', label: 'API', external: false },
  { href: 'https://github.com/l0cka/policai', label: 'GitHub', external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-[var(--rule-heavy)]">
      <div className="container mx-auto flex flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          An open register of Australian AI policy. Every record is checked
          against its official source, and the data is versioned in Git.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-grow transition-colors duration-[var(--dur-fast)] hover:text-foreground"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="underline-grow transition-colors duration-[var(--dur-fast)] hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </footer>
  );
}
