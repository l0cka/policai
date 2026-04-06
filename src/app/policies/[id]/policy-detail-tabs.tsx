'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Copy, Check, FileText } from 'lucide-react';
import {
  JURISDICTION_NAMES,
  POLICY_TYPE_NAMES,
  POLICY_STATUS_NAMES,
  type Policy,
  type Jurisdiction,
  type PolicyType,
  type PolicyStatus,
} from '@/types';
import { STATUS_COLORS } from '@/lib/design-tokens';
import { EmptyState } from '@/components/ui/empty-state';

interface PolicyDetailTabsProps {
  policy: Policy;
  relatedPolicies: Policy[];
}

export function PolicyDetailTabs({ policy, relatedPolicies }: PolicyDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'related'>('overview');

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'content' as const, label: 'Content' },
    { id: 'related' as const, label: 'Related' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">{policy.title}</h1>

      <div className="font-mono text-sm text-muted-foreground mb-6 flex flex-wrap gap-x-2">
        <span>{JURISDICTION_NAMES[policy.jurisdiction as Jurisdiction]}</span>
        <span>&middot;</span>
        <span>{POLICY_TYPE_NAMES[policy.type as PolicyType]}</span>
        <span>&middot;</span>
        <span className={STATUS_COLORS[policy.status] || ''}>
          {POLICY_STATUS_NAMES[policy.status as PolicyStatus]}
        </span>
        {policy.effectiveDate && (
          <>
            <span>&middot;</span>
            <span>
              {new Date(policy.effectiveDate).toLocaleDateString('en-AU', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </>
        )}
      </div>

      <div className="border-b border-border mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 max-w-[720px]">
          <p className="text-sm leading-relaxed">{policy.description}</p>

          {policy.aiSummary && (
            <div className="border-l-2 border-primary/30 pl-4 py-3">
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                AI Summary
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{policy.aiSummary}</p>
            </div>
          )}

          {policy.tags && policy.tags.length > 0 && (
            <div>
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Tags
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {policy.tags.join(', ')}
              </div>
            </div>
          )}

          {policy.agencies && policy.agencies.length > 0 && (
            <div>
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Agencies
              </div>
              <div className="text-sm">{policy.agencies.join(', ')}</div>
            </div>
          )}

          {policy.sourceUrl && (
            <a
              href={policy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          )}
        </div>
      )}

      {activeTab === 'content' && (
        <div className="max-w-[720px]">
          {policy.content ? (
            <div className="relative group">
              <CopyButton text={policy.content} />
              <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif">
                {policy.content}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No content available"
              description="Detailed policy content has not been added yet."
            />
          )}
        </div>
      )}

      {activeTab === 'related' && (
        <div>
          {relatedPolicies.length === 0 ? (
            <EmptyState
              title="No related policies"
              description="No other policies share the same jurisdiction and tags."
            />
          ) : (
            <div className="border-t border-border">
              {relatedPolicies.map((rp) => (
                <Link
                  key={rp.id}
                  href={`/policies/${rp.id}`}
                  className="flex items-baseline justify-between py-3 border-b border-border hover:bg-muted/50 transition-colors -mx-1 px-1"
                >
                  <div>
                    <div className="text-sm font-medium text-primary">{rp.title}</div>
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">
                      {JURISDICTION_NAMES[rp.jurisdiction as Jurisdiction]}
                      {' \u00b7 '}
                      {POLICY_TYPE_NAMES[rp.type as PolicyType]}
                    </div>
                  </div>
                  <span className={`font-mono text-xs ${STATUS_COLORS[rp.status] || 'text-muted-foreground'}`}>
                    {POLICY_STATUS_NAMES[rp.status as PolicyStatus]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-muted-foreground hover:text-foreground"
      aria-label="Copy content"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
