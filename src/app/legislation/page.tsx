import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { PageIntro } from '@/components/layout';
import { ArrowUpRight } from 'lucide-react';
import { getPolicies } from '@/lib/data-service';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { jurisdictionRailStyle } from '@/lib/jurisdiction-accent';
import {
  beforeParliament,
  comingUp,
  isLegislativeRecord,
  LEGISLATIVE_STAGE_NAMES,
  madeLaws,
  recentlyMade,
  type BillInParliament,
  type DatedEntry,
  type MadeLaw,
} from '@/lib/legislation/overview';
import { pageAlternates, pageSocialMeta } from '@/lib/site-seo';
import { precisionDateTime } from '@/lib/this-week';
import { getJurisdictionName, getPolicyTypeName } from '@/types';

export const revalidate = 3600;

const RECENT_DAYS = 90;
const LEGISLATION_TITLE = 'AI legislation in Australian Parliaments';
const LEGISLATION_DESCRIPTION =
  'AI-related bills before each Australian Parliament, the commencements and deadlines coming up, and the Acts and instruments made recently, each from its official source.';

export const metadata: Metadata = {
  title: LEGISLATION_TITLE,
  description: LEGISLATION_DESCRIPTION,
  alternates: pageAlternates('/legislation'),
  ...pageSocialMeta({
    title: LEGISLATION_TITLE,
    description: LEGISLATION_DESCRIPTION,
    path: '/legislation',
  }),
};

function EntryDate({ entry }: { entry: DatedEntry }) {
  return (
    <time
      dateTime={precisionDateTime(entry.date, entry.precision)}
      className="font-mono text-[11px] font-medium uppercase text-muted-foreground tabular"
    >
      {formatPolicyDate({ type: 'published', date: entry.date, precision: entry.precision }, { short: true })}
    </time>
  );
}

function RecordLink({ entry }: { entry: Pick<DatedEntry, 'record'> }) {
  return (
    <Link href={`/policies/${entry.record.id}`} className="record-title hover:text-primary">
      {entry.record.title}
    </Link>
  );
}

function SourceLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      Source
      <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
    </a>
  );
}

function ChamberBar({ bill }: { bill: BillInParliament }) {
  const label = `Passed ${bill.chambersPassed} of ${bill.chambers} ${bill.chambers === 1 ? 'chamber' : 'chambers'}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {Array.from({ length: bill.chambers }, (_, index) => (
          <span
            key={index}
            className={
              index < bill.chambersPassed
                ? 'h-1.5 w-5 rounded-full bg-primary'
                : 'h-1.5 w-5 rounded-full border border-border'
            }
          />
        ))}
      </span>
      {label}
    </span>
  );
}

function BillRow({ bill }: { bill: BillInParliament }) {
  return (
    <article
      style={jurisdictionRailStyle(bill.record.jurisdiction)}
      className="ink-rail grid gap-1.5 border-b border-border py-3 pl-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-2 sm:py-4"
    >
      <EntryDate entry={bill.last} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {getJurisdictionName(bill.record.jurisdiction)}
        </p>
        <RecordLink entry={bill} />
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {bill.last.label}
          {bill.last.detail ? `. ${bill.last.detail}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
          <ChamberBar bill={bill} />
          <SourceLink href={bill.last.sourceUrl} />
        </div>
      </div>
    </article>
  );
}

function LawRow({ law }: { law: MadeLaw }) {
  return (
    <article
      style={jurisdictionRailStyle(law.record.jurisdiction)}
      className="ink-rail grid gap-1.5 border-b border-border py-3 pl-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-2 sm:py-4"
    >
      <EntryDate entry={law.last} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {LEGISLATIVE_STAGE_NAMES[law.stage]} · {getJurisdictionName(law.record.jurisdiction)} ·{' '}
          {getPolicyTypeName(law.record.type)}
        </p>
        <RecordLink entry={law} />
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {law.last.label}
          {law.last.detail ? `. ${law.last.detail}` : ''}
        </p>
        <div className="mt-1.5 text-xs">
          <SourceLink href={law.last.sourceUrl} />
        </div>
      </div>
    </article>
  );
}

function EntryRow({ entry }: { entry: DatedEntry }) {
  return (
    <article
      style={jurisdictionRailStyle(entry.record.jurisdiction)}
      className="ink-rail grid gap-1.5 border-b border-border py-3 pl-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-2 sm:py-4"
    >
      <EntryDate entry={entry} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {entry.label} · {getJurisdictionName(entry.record.jurisdiction)} ·{' '}
          {getPolicyTypeName(entry.record.type)}
        </p>
        <RecordLink entry={entry} />
        {entry.detail ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
        ) : null}
        <div className="mt-1.5 text-xs">
          <SourceLink href={entry.sourceUrl} />
        </div>
      </div>
    </article>
  );
}

function Section({
  id,
  title,
  count,
  intro,
  empty,
  children,
}: {
  id: string;
  title: string;
  count: number;
  intro: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-8 scroll-mt-20 sm:mt-10">
      <h2
        id={`${id}-heading`}
        className="border-b border-[var(--rule-heavy)] py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em]"
      >
        {title}{' '}
        <span className="ml-0.5 font-mono text-muted-foreground normal-case tracking-normal">{count}</span>
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{intro}</p>
      {count > 0 ? (
        <div>{children}</div>
      ) : (
        <p className="border-b border-border py-6 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export default async function LegislationPage() {
  const records = (await getPolicies()).filter(isLegislativeRecord);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const bills = beforeParliament(records);
  const upcoming = comingUp(records, today);
  const made = recentlyMade(records, today, RECENT_DAYS);
  const laws = madeLaws(records);

  return (
    <div className="container mx-auto px-4 py-7 sm:px-6 lg:px-8">
      <PageIntro
        title="Legislation"
        description="AI-related bills, Acts and legislative instruments in the register, tracked through Parliament from their official pages. Every stage links to its source."
      />
      <div className="reveal">
        <nav aria-label="On this page" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <a href="#before-parliament" className="text-primary underline underline-offset-4 hover:no-underline">
            {bills.length} before Parliament
          </a>
          <a href="#coming-up" className="text-primary underline underline-offset-4 hover:no-underline">
            {upcoming.length} coming up
          </a>
          <a href="#recently-made" className="text-primary underline underline-offset-4 hover:no-underline">
            {made.length} recently made
          </a>
          <a href="#laws" className="text-primary underline underline-offset-4 hover:no-underline">
            {laws.length} {laws.length === 1 ? 'law' : 'laws'} made
          </a>
          <a href="/api/legislation" className="text-muted-foreground underline underline-offset-4 hover:text-primary hover:no-underline">
            API
          </a>
        </nav>
      </div>

      <Section
        id="before-parliament"
        title="Before Parliament"
        count={bills.length}
        intro="Bills not yet passed, Commonwealth first, with each bill's latest stage."
        empty="No AI-related bill in the register is before a Parliament."
      >
        {bills.map((bill) => (
          <BillRow key={bill.record.id} bill={bill} />
        ))}
      </Section>

      <Section
        id="coming-up"
        title="Coming up"
        count={upcoming.length}
        intro="Committee report dates, disallowance window ends and scheduled commencements, soonest first."
        empty="No upcoming legislative dates in the register."
      >
        {upcoming.map((entry) => (
          <EntryRow key={`${entry.record.id}-${entry.label}-${entry.date}`} entry={entry} />
        ))}
      </Section>

      <Section
        id="recently-made"
        title="Recently made"
        count={made.length}
        intro={`Acts assented, instruments registered and laws commenced in the last ${RECENT_DAYS} days.`}
        empty={`Nothing assented, registered or commenced in the last ${RECENT_DAYS} days.`}
      >
        {made.map((entry) => (
          <EntryRow key={`${entry.record.id}-${entry.label}-${entry.date}`} entry={entry} />
        ))}
      </Section>

      <Section
        id="laws"
        title="Laws made"
        count={laws.length}
        intro="Every AI-related Act and instrument in the register that has been made, in force or awaiting commencement, Commonwealth first, with its latest stage."
        empty="No AI-related Act or instrument in the register has been made yet."
      >
        {laws.map((law) => (
          <LawRow key={law.record.id} law={law} />
        ))}
      </Section>
    </div>
  );
}
