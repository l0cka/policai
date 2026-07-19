'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Info,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import {
  getJurisdictionName,
  getPolicyDateTypeName,
  getPolicyStatusName,
  getPolicyTypeName,
  getPrimaryPolicyDate,
  type Policy,
} from '@/types';
import { EmptyState } from '@/components/ui/empty-state';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'requirements' | 'content' | 'related';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Key requirements' },
  { id: 'content', label: 'Full text' },
  { id: 'related', label: 'Related' },
];

function humanDate(value: string): string {
  return new Date(value).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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
  const active = policy.status === 'active';
  return (
    <span
      className={cn(
        'inline-flex rounded-md border px-2.5 py-1 text-xs font-medium',
        active
          ? 'border-[var(--trust)]/25 bg-[var(--status-active-bg)] text-[var(--trust)]'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {getPolicyStatusName(policy.status)}
    </span>
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
      className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium hover:text-primary"
    >
      {copied ? <Check className="h-4 w-4 text-[var(--trust)]" /> : <Link2 className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

export function PolicyDetailTabs({
  policy,
  relatedPolicies,
}: {
  policy: Policy;
  relatedPolicies: Policy[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const requirements = useMemo(() => getRequirements(policy), [policy]);
  const primaryDate = getPrimaryPolicyDate(policy);
  const sourceHost = policy.sourceUrl
    ? new URL(policy.sourceUrl).hostname.replace(/^www\./, '')
    : null;

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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="text-primary">{getJurisdictionName(policy.jurisdiction)}</span>
            <span className="h-4 w-px bg-border" />
            <span>{getPolicyTypeName(policy.type)}</span>
            <span className="h-4 w-px bg-border" />
            <StatusBadge policy={policy} />
          </div>

          <h1 className="mt-5 max-w-5xl font-display text-[clamp(2.5rem,3.8vw,4rem)] leading-[1.02] tracking-[-0.035em]">
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
                className="inline-flex min-h-11 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <ExternalLink className="h-4 w-4" />
                View official source
              </a>
            ) : null}
            <CopyLinkButton />
            <button type="button" onClick={downloadPolicy} className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-medium hover:text-primary">
              <Download className="h-4 w-4" />
              Download data
            </button>
          </div>

          <div className="mt-5 overflow-x-auto border-b border-border">
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
              <h2 className="text-xl font-semibold">Overview</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6">{policy.description}</p>

              {policy.aiSummary ? (
                <div className="mt-5 max-w-4xl border border-[var(--trust)]/35 bg-[var(--status-active-bg)]/35 p-4">
                  <div className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--trust)] text-white">
                      <Info className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold">What this means</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{policy.aiSummary}</p>
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Machine-assisted editorial summary</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div>
                  <h2 className="text-lg font-semibold">Key requirements</h2>
                  <ol className="mt-3 border-y border-border">
                    {requirements.slice(0, 3).map((requirement, index) => (
                      <li key={`${requirement.slice(0, 30)}-${index}`} className="flex gap-3 border-b border-border px-2 py-3 last:border-b-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--status-active-bg)] text-xs font-semibold text-[var(--trust)]">
                          {index + 1}
                        </span>
                        <p className="text-sm leading-6">{requirement}</p>
                      </li>
                    ))}
                  </ol>
                  {requirements.length > 3 ? (
                    <button type="button" onClick={() => setActiveTab('requirements')} className="mt-3 inline-flex items-center gap-2 text-sm text-primary hover:underline">
                      View all requirements <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="border-l border-border pl-5">
                  <h2 className="text-sm font-semibold">Policy changes</h2>
                  <ol className="mt-4 space-y-5">
                    {policy.dates.slice(0, 4).map((date, index) => (
                      <li key={`${date.type}-${String(date.date)}`} className="relative pl-5">
                        <span className={cn('absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full', index === 0 ? 'bg-primary ring-4 ring-primary/15' : 'bg-input')} />
                        <p className="font-mono text-[9px] uppercase text-muted-foreground">{formatPolicyDate(date, { short: true })}</p>
                        <p className="mt-1 text-xs font-semibold">{getPolicyDateTypeName(date.type)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'requirements' ? (
            <div className="py-6">
              <h2 className="text-xl font-semibold">Key requirements</h2>
              <ol className="mt-4 max-w-4xl border-y border-border">
                {requirements.map((requirement, index) => (
                  <li key={`${requirement.slice(0, 30)}-${index}`} className="flex gap-4 border-b border-border py-4 last:border-b-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--status-active-bg)] text-sm font-semibold text-[var(--trust)]">{index + 1}</span>
                    <p className="text-sm leading-6">{requirement}</p>
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

          {activeTab === 'related' ? (
            <div className="py-6">
              <RelatedPolicies policies={relatedPolicies} />
            </div>
          ) : null}
        </div>

        <aside className="space-y-5 xl:pt-0">
          <section className="border border-border bg-card/40 p-5">
            <h2 className="font-display text-2xl">At a glance</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge policy={policy} /></dd></div>
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Jurisdiction</dt><dd>{getJurisdictionName(policy.jurisdiction)}</dd></div>
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Policy type</dt><dd>{getPolicyTypeName(policy.type)}</dd></div>
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Agency</dt><dd>{policy.agencies.join(', ') || 'Not specified'}</dd></div>
            </dl>
            <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
              {policy.dates.map((date) => (
                <div key={`${date.type}-${String(date.date)}`} className="grid grid-cols-[7rem_1fr] gap-3">
                  <dt className="text-muted-foreground">{getPolicyDateTypeName(date.type)}</dt>
                  <dd className="font-mono text-xs uppercase">{formatPolicyDate(date)}</dd>
                </div>
              ))}
              <div className="grid grid-cols-[7rem_1fr] gap-3"><dt className="text-muted-foreground">Key date</dt><dd className="font-mono text-xs uppercase">{formatPolicyDate(primaryDate)}</dd></div>
            </dl>
          </section>

          <section className="border border-border bg-card/40 p-5">
            <h2 className="font-display text-2xl">Source verification</h2>
            <p className="mt-4 flex items-center gap-2 border-b border-border pb-4 text-sm">
              <CheckCircle2 className="h-5 w-5 text-[var(--trust)]" fill="currentColor" />
              {policy.verification.status === 'verified' ? 'Verified against the official source' : 'Editorial verification required'}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              {sourceHost ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Official source</dt><dd>{sourceHost}</dd></div> : null}
              {policy.verification.checkedAt ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Checked</dt><dd className="font-mono text-[10px] uppercase">{humanDate(policy.verification.checkedAt)}</dd></div> : null}
              {policy.verification.source.retrievedAt ? <div className="grid grid-cols-[6.5rem_1fr] gap-3"><dt className="text-muted-foreground">Retrieved</dt><dd className="font-mono text-[10px] uppercase">{humanDate(policy.verification.source.retrievedAt)}</dd></div> : null}
            </dl>
            <div className="mt-5 flex gap-3 border border-[var(--trust)]/35 bg-[var(--status-active-bg)]/25 p-4 text-sm italic leading-5 text-[var(--trust)]">
              <ShieldCheck className="h-5 w-5 shrink-0" />
              Always check the official source before relying on this record.
            </div>
          </section>
        </aside>
      </div>

      <section className="mt-6 border-t border-border pt-5">
        <h2 className="font-display text-2xl">Related policies</h2>
        <div className="mt-3"><RelatedPolicies policies={relatedPolicies} /></div>
      </section>
    </div>
  );
}

function RelatedPolicies({ policies }: { policies: Policy[] }) {
  if (policies.length === 0) {
    return <p className="text-sm text-muted-foreground">No related policies are currently published.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {policies.map((related) => (
        <Link key={related.id} href={`/policies/${related.id}`} className="group flex min-h-24 items-center justify-between border border-border bg-card/35 p-4 transition-colors hover:border-primary">
          <span>
            <span className="block text-sm font-semibold group-hover:text-primary">{related.title}</span>
            <span className="mt-2 block font-mono text-[9px] uppercase text-muted-foreground">{getJurisdictionName(related.jurisdiction)} · {getPolicyTypeName(related.type)}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
        </Link>
      ))}
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
