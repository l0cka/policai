'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Info,
  Link2,
} from 'lucide-react';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyTypeName,
  getPrimaryPolicyDate,
  isDeadlineDateType,
  type Policy,
  type PublicCourtRequirement,
} from '@/types';
import { jurisdictionAccent } from '@/lib/jurisdiction-accent';
import { parseSourceUrl } from '@/lib/source-url';
import { reuseLabel, type SiteReuse } from '@/lib/watch-coverage/site-reuse';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { precisionDateTime } from '@/lib/this-week';
import { FollowControl } from '@/components/follow-control';
import { CourtRequirementsList } from "@/components/court-requirements-list";
import { StatusPill } from "@/components/policy-indicators";
import { policyPriorBodies } from '../../../../data/policy-prior-bodies';
import { diffPolicyText, retainedPriorBody } from '@/lib/policy-diff';
import { splitSummaryBlocks } from '@/lib/summary-blocks';
import { cn } from '@/lib/utils';
import { auDate } from '@/lib/au-date';

type TabId = 'overview' | 'requirements' | 'content';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Key requirements' },
  { id: 'content', label: 'Full text' },
];

function humanDate(value: string): string {
  return auDate(new Date(value), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

function getRequirements(policy: Policy): string[] {
  const contentRequirements = (policy.content ?? '')
    .split(/\n{2,}|\n(?=[A-Z0-9])/)
    .map((item) => item.replace(/^[-•\d.)\s]+/, '').trim())
    .filter((item) => item.length >= 35);

  if (contentRequirements.length > 0) return contentRequirements.slice(0, 6);
  if (policy.aiSummary) return [policy.aiSummary];
  return [policy.description];
}

function StatusBadge({ policy }: { policy: Policy }) {
  return <StatusPill status={policy.status} dates={policy.dates} />;
}

function WhatChanged({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => diffPolicyText(before, after), [before, after]);
  const unchanged = diff.added.length === 0 && diff.removed.length === 0;

  return (
    <section className="mt-6 min-w-0 max-w-4xl border border-border p-4" aria-labelledby="what-changed-heading">
      <h2 id="what-changed-heading" className="section-title">What changed</h2>
      {unchanged ? (
        <p className="mt-3 text-sm leading-6">The text is unchanged.</p>
      ) : (
        <ul className="mt-3 min-w-0 space-y-2">
          {diff.removed.map((line, index) => (
            <li
              key={`removed-${index}`}
              className="min-w-0 bg-[var(--status-repealed-bg)] px-3 py-2 text-sm leading-6 text-[var(--status-repealed)]"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Removed</span>
              <del className="mt-1 block whitespace-pre-wrap break-words">{line.length > 0 ? line : ' '}</del>
            </li>
          ))}
          {diff.added.map((line, index) => (
            <li
              key={`added-${index}`}
              className="min-w-0 bg-[var(--status-active-bg)] px-3 py-2 text-sm leading-6 text-[var(--status-active)]"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Added</span>
              <span className="mt-1 block whitespace-pre-wrap break-words">{line.length > 0 ? line : ' '}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SummaryText({ text }: { text: string }) {
  return (
    <div className="min-w-0 flex-1 break-words text-base leading-[1.7]">
      {splitSummaryBlocks(text).map((block, blockIndex) => (
        <div key={blockIndex} className="max-w-[66ch] space-y-3 [&:not(:first-child)]:mt-4">
          {block.paragraphs.map((paragraph, index) => (
            <p key={index}>
              {index === 0 && block.label ? <strong className="font-semibold">{block.label} </strong> : null}
              {paragraph}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:text-primary"
    >
      {copied ? <Check className="h-4 w-4 text-[var(--trust)]" /> : <Link2 className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

export function PolicyDetailTabs({
  policy,
  progress,
  related,
  courtRequirements = [],
  sourceReuse,
}: {
  policy: Policy;
  progress?: ReactNode;
  related?: ReactNode;
  courtRequirements?: PublicCourtRequirement[];
  sourceReuse?: SiteReuse;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const requirements = useMemo(() => getRequirements(policy), [policy]);
  const primaryDate = getPrimaryPolicyDate(policy);
  // Deadlines fall due on the instrument; they are not changes to it.
  const instrumentDates = policy.dates.filter((date) => !isDeadlineDateType(date.type));
  const deadlineDates = policy.dates.filter((date) => isDeadlineDateType(date.type));
  const sourceHost = policy.sourceUrl
    ? parseSourceUrl(policy.sourceUrl).hostname.replace(/^www\./, '')
    : null;
  const priorBody = retainedPriorBody(policyPriorBodies, policy.id);

  const downloadPolicy = () => {
    const blob = new Blob([JSON.stringify(policy, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${policy.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {(policy.status === 'superseded' || policy.status === 'closed') ? (
        <div className="mb-5 border-l-2 border-[var(--caution)] bg-[var(--status-proposed-bg)] px-4 py-3 text-sm">
          {policy.status === 'superseded'
            ? 'This instrument has been superseded and is retained for the historical record.'
            : 'This consultation or proposal is closed and no longer active.'}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-[var(--space-10)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]">
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: jurisdictionAccent(policy.jurisdiction) }}
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              {getJurisdictionName(policy.jurisdiction)}
            </span>
            <span className="h-4 w-px bg-border" />
            <span>{getPolicyTypeName(policy.type)}</span>
            <span className="h-4 w-px bg-border" />
            <span className="font-sans normal-case tracking-normal">
              <StatusBadge policy={policy} />
            </span>
          </div>

          <h1 className="article-title mt-5 max-w-4xl">
            {policy.title}
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-muted-foreground">
            {policy.description}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-1">
            {policy.sourceUrl ? (
              <a
                href={policy.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <ExternalLink className="h-4 w-4" />
                View official source
              </a>
            ) : null}
            <FollowControl follow={{ kind: 'policy', id: policy.id }} label={policy.title} short />
            <details
              className="relative"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }}
            >
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:text-primary [&::-webkit-details-marker]:hidden">
                More
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 flex min-w-56 flex-col border border-border bg-popover p-1 shadow-[var(--shadow-lift)]">
                <CopyLinkButton />
                <button type="button" onClick={downloadPolicy} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:text-primary">
                  <Download className="h-4 w-4" />
                  Download data
                </button>
                <a
                  href={`/api/policies/${encodeURIComponent(policy.id)}/markdown`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:text-primary"
                >
                  <FileText className="h-4 w-4" />
                  Markdown with sources
                </a>
              </div>
            </details>
          </div>

          {priorBody !== null ? <WhatChanged before={priorBody} after={policy.content} /> : null}

          {progress}

          <div className="no-scrollbar mt-5 overflow-x-auto border-b border-border">
            <div className="flex min-w-max gap-8" role="tablist" aria-label="Policy sections">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    '-mb-px min-h-12 border-b-[3px] px-2 text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'overview' ? (
            <div className="py-6">
              {policy.aiSummary ? (
                <div className="max-w-4xl border border-[var(--trust)]/35 bg-[var(--status-active-bg)]/35 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--trust)] text-[var(--background)]">
                      <Info className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="section-title">What this means</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{policy.aiSummary}</p>
                      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Machine-assisted editorial summary</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-7 min-w-0">
                <h2 className="section-title">Editorial summary</h2>
                <ol className="mt-3 border-y border-border">
                  {requirements.slice(0, 3).map((requirement, index) => (
                    <li key={`${requirement.slice(0, 30)}-${index}`} className="flex gap-3 border-b border-border px-2 py-4 last:border-b-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--status-active-bg)] text-xs font-semibold text-[var(--trust)]">
                        {index + 1}
                      </span>
                      <SummaryText text={requirement} />
                    </li>
                  ))}
                </ol>
                {courtRequirements.length > 0 || requirements.length > 3 ? (
                  <button type="button" onClick={() => setActiveTab('requirements')} className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline">
                    View all requirements <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {activeTab === 'requirements' ? (
            <div className="py-6">
              <CourtRequirementsList title={policy.title} requirements={courtRequirements} />
              <h2 className="section-title">Editorial summary</h2>
              <ol className="mt-4 max-w-4xl border-y border-border">
                {requirements.map((requirement, index) => (
                  <li key={`${requirement.slice(0, 30)}-${index}`} className="flex gap-4 border-b border-border py-4 last:border-b-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--status-active-bg)] text-sm font-semibold text-[var(--trust)]">{index + 1}</span>
                    <SummaryText text={requirement} />
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {activeTab === 'content' ? (
            <div className="py-6">
              {policy.content ? (
                <div className="relative max-w-4xl">
                  <CopyContentButton text={policy.content} />
                  <div className="whitespace-pre-wrap font-display text-[17px] leading-8 text-foreground/90">{policy.content}</div>
                </div>
              ) : (
                <EmptyState icon={FileText} title="No full text available" description="Detailed policy content has not been added yet." />
              )}
            </div>
          ) : null}

          {related}
        </div>

        <aside className="space-y-5 xl:pt-0">
          <section className="border border-border bg-card/40 p-5">
            <h2 className="section-title">At a glance</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Jurisdiction</dt><dd>{getJurisdictionName(policy.jurisdiction)}</dd></div>
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Policy type</dt><dd>{getPolicyTypeName(policy.type)}</dd></div>
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Agency</dt><dd>{policy.agencies.join(', ') || 'Not specified'}</dd></div>
            </dl>
            <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
              {instrumentDates.map((date) => (
                <div key={`${date.type}-${String(date.date)}`} className="grid grid-cols-[7rem_1fr] gap-3">
                  <dt className="text-muted-foreground">{getPolicyDateTypeName(date.type)}</dt>
                  <dd className="tabular">{formatPolicyDate(date, { short: true })}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Key date</dt><dd className="tabular">{formatPolicyDate(primaryDate, { short: true })}</dd></div>
            </dl>
            {deadlineDates.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-xs font-semibold">Deadlines</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  {deadlineDates.map((date) => (
                    <div key={`${date.type}-${String(date.date)}`} className="grid grid-cols-[7rem_1fr] gap-3">
                      <dt className="text-muted-foreground">{getPolicyDateTypeName(date.type)}</dt>
                      <dd className="tabular">
                        <time dateTime={precisionDateTime(date.date, date.precision)}>
                          {formatPolicyDate(date, { short: true })}
                        </time>
                        {date.precision !== 'day' ? (
                          <span className="block text-xs text-muted-foreground">Exact day not recorded</span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <p className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-sm">
              <CheckCircle2
                className={policy.verification.status === 'verified' ? 'h-5 w-5 text-[var(--trust)]' : 'h-5 w-5 text-[var(--caution)]'}
                fill="currentColor"
              />
              {policy.verification.status === 'verified'
                ? 'Verified against the official source'
                : policy.verification.status === 'stale'
                  ? 'Verified earlier; editorial re-check due'
                  : 'Editorial verification required'}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              {sourceHost ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Official source</dt><dd>{sourceHost}</dd></div> : null}
              {sourceReuse ? (
                <div className="grid grid-cols-[6.5rem_1fr] gap-3">
                  <dt className="text-muted-foreground">Site reuse terms</dt>
                  <dd>
                    {sourceReuse.status === 'stated' ? (
                      <a href={sourceReuse.termsUrl} className="text-primary underline underline-offset-4 hover:no-underline">
                        {reuseLabel(sourceReuse)}
                      </a>
                    ) : (
                      reuseLabel(sourceReuse)
                    )}
                  </dd>
                </div>
              ) : null}
              {policy.verification.checkedAt ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Checked</dt><dd className="tabular">{humanDate(policy.verification.checkedAt)}</dd></div> : null}
              {policy.verification.source.retrievedAt ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Retrieved</dt><dd className="tabular">{humanDate(policy.verification.source.retrievedAt)}</dd></div> : null}
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Always check the official source before relying on this record.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function CopyContentButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
      className="float-right ml-4 inline-flex min-h-10 items-center gap-2 border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-4 w-4 text-[var(--trust)]" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy text'}
    </button>
  );
}
