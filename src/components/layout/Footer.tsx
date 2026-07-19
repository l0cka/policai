import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container mx-auto flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p className="max-w-3xl font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground lg:text-[10px]">
          Policai is a public interest research project. Data is collected from official sources and verified by human review.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href="/methodology" className="transition-colors hover:text-foreground">Methodology</Link>
          <Link href="/api/policies" className="transition-colors hover:text-foreground">API</Link>
          <Link href="/blog" className="transition-colors hover:text-foreground">About</Link>
          <a
            href="https://github.com/l0cka/policai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
