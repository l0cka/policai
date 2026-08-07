'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Globe,
  Wrench,
  CheckCircle,
  Rocket,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  FileCheck,
  Users,
  BookOpen,
  Building2,
} from 'lucide-react';
import type { RecordVerification } from '@/types';

// Types for the framework data
interface PolicyAim {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  outcomes: string[];
}

interface Requirement {
  id: string;
  title: string;
  type: string;
  deadline: string | null;
  description: string;
  details: string[];
}

interface Pillar {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  principles: string[];
  requirements: Requirement[];
}

interface InScopeCriteria {
  id: string;
  description: string;
  applicableTo: string[];
}

export interface FrameworkData {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  lastUpdated?: string;
  authority: string;
  sourceUrl: string;
  relatedPolicyId: string;
  verification: RecordVerification;
  policyAims: PolicyAim[];
  pillars: Pillar[];
  inScopeCriteria: InScopeCriteria[];
  riskAreas: string[];
}

interface PolicyFrameworkMapProps {
  data: FrameworkData;
  onPillarSelect?: (pillarId: string | null) => void;
}

const iconMap: Record<string, React.ElementType> = {
  globe: Globe,
  wrench: Wrench,
  'check-circle': CheckCircle,
  rocket: Rocket,
  shield: Shield,
  refresh: RefreshCw,
};

/**
 * Requirement obligation tiers, ordered by emphasis rather than colour —
 * colour is reserved for verification state elsewhere in the app.
 */
const typeStyles: Record<string, string> = {
  mandatory: 'border-[var(--rule-heavy)] bg-muted text-foreground font-semibold',
  recommended: 'border-border text-foreground',
  consideration: 'border-border text-muted-foreground',
};

const typeLabels: Record<string, string> = {
  mandatory: 'Mandatory',
  recommended: 'Recommended',
  consideration: 'Consider',
};

/** Overview/Detailed switch, styled like the register's ViewToggle. */
function ViewSwitch({
  value,
  onChange,
}: {
  value: 'overview' | 'detailed';
  onChange: (value: 'overview' | 'detailed') => void;
}) {
  return (
    <div className="inline-flex min-h-10 border border-input" aria-label="Framework detail">
      <button
        type="button"
        onClick={() => onChange('overview')}
        aria-pressed={value === 'overview'}
        className={cn(
          'inline-flex min-w-24 items-center justify-center px-3 text-xs font-medium transition-colors',
          value === 'overview' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Overview
      </button>
      <button
        type="button"
        onClick={() => onChange('detailed')}
        aria-pressed={value === 'detailed'}
        className={cn(
          'inline-flex min-w-24 items-center justify-center border-l border-input px-3 text-xs font-medium transition-colors',
          value === 'detailed' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Detailed
      </button>
    </div>
  );
}

function RequirementCard({ requirement }: { requirement: Requirement }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={cn(
        'border border-border p-3 transition-colors cursor-pointer hover:border-primary',
        isExpanded && 'border-primary',
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium">{requirement.title}</h4>
            <span
              className={cn(
                'inline-flex rounded-md border px-2 py-1 text-xs',
                typeStyles[requirement.type] || 'border-border text-muted-foreground',
              )}
            >
              {typeLabels[requirement.type] || requirement.type}
            </span>
            {requirement.deadline && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {requirement.deadline}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{requirement.description}</p>
        </div>
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {isExpanded && (
        <ul className="mt-3 space-y-1 border-t border-[var(--rule-hair)] pt-3">
          {requirement.details.map((detail, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="mt-0.5 text-primary">•</span>
              {detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PillarCard({ pillar, isSelected, onSelect }: { pillar: Pillar; isSelected: boolean; onSelect: () => void }) {
  const Icon = iconMap[pillar.icon] || Globe;
  const mandatoryCount = pillar.requirements.filter((r) => r.type === 'mandatory').length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        'hover-lift w-full border bg-card/35 p-4 text-left transition-colors hover:border-primary',
        isSelected ? 'border-primary' : 'border-border',
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center border border-border text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="section-title">{pillar.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{pillar.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{pillar.principles.length} principles</span>
        {mandatoryCount > 0 && (
          <span className="inline-flex rounded-md border border-[var(--rule-heavy)] bg-muted px-2 py-1 font-medium text-foreground">
            {mandatoryCount} mandatory
          </span>
        )}
      </div>
    </button>
  );
}

function PolicyAimCard({ aim }: { aim: PolicyAim }) {
  const Icon = iconMap[aim.icon] || Rocket;

  return (
    <div className="flex-1 border border-border bg-card/35 p-4 transition-colors hover:border-primary">
      <div className="mb-3 flex h-10 w-10 items-center justify-center border border-border text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1 text-sm font-semibold">{aim.title}</h3>
      <p className="text-xs text-muted-foreground">{aim.description}</p>
    </div>
  );
}

export function PolicyFrameworkMap({ data, onPillarSelect }: PolicyFrameworkMapProps) {
  const [selectedPillar, setSelectedPillar] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'detailed'>('overview');

  const handlePillarSelect = (pillarId: string) => {
    const newSelection = selectedPillar === pillarId ? null : pillarId;
    setSelectedPillar(newSelection);
    onPillarSelect?.(newSelection);
  };

  const selectedPillarData = data.pillars.find((p) => p.id === selectedPillar);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="page-eyebrow">
            Version {data.version} · {data.authority}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="section-title">{data.title}</h2>
          </div>
        </div>
        <ViewSwitch value={view} onChange={setView} />
      </div>

      {/* Policy Aims */}
      <div>
        <h3 className="page-eyebrow mb-3">Policy aims</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.policyAims.map((aim) => (
            <PolicyAimCard key={aim.id} aim={aim} />
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--rule-hair)]" />

      {/* Three Pillars */}
      <div>
        <h3 className="page-eyebrow mb-1">Principles and requirements</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Select a pillar to view its principles and requirements.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.pillars.map((pillar) => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              isSelected={selectedPillar === pillar.id}
              onSelect={() => handlePillarSelect(pillar.id)}
            />
          ))}
        </div>
      </div>

      {/* Selected Pillar Details */}
      {selectedPillarData && (
        <div className="border border-border bg-card/35 p-5">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = iconMap[selectedPillarData.icon] || Globe;
              return <Icon className="h-5 w-5 text-primary" />;
            })()}
            <h3 className="section-title">{selectedPillarData.title}</h3>
          </div>

          {/* Principles */}
          <div className="mt-5">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              Principles
            </h4>
            <ul className="space-y-2">
              {selectedPillarData.principles.map((principle, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {idx + 1}
                  </span>
                  {principle}
                </li>
              ))}
            </ul>
          </div>

          {/* Requirements */}
          <div className="mt-6 border-t border-[var(--rule-hair)] pt-6">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Requirements
            </h4>
            <div className="space-y-3">
              {selectedPillarData.requirements.map((req) => (
                <RequirementCard key={req.id} requirement={req} />
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'detailed' && (
        <>
          <div className="border-t border-[var(--rule-hair)]" />

          {/* In-Scope Criteria */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 page-eyebrow">
              <AlertTriangle className="h-4 w-4 text-primary" />
              In-scope AI use case criteria
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              An AI use case is in scope of this policy if any of the following apply:
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.inScopeCriteria.map((criteria) => (
                <div key={criteria.id} className="border border-border bg-card/35 p-4">
                  <p className="text-sm font-medium">{criteria.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {criteria.applicableTo.map((item) => (
                      <span
                        key={item}
                        className="inline-flex rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Areas */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 page-eyebrow">
              <Shield className="h-4 w-4 text-primary" />
              Areas requiring careful consideration
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              While not automatically high-risk, these areas are more likely to involve risks requiring impact assessment:
            </p>
            <div className="flex flex-wrap gap-2">
              {data.riskAreas.map((area) => (
                <span
                  key={area}
                  className="inline-flex rounded-md border border-border px-3 py-1 text-sm text-muted-foreground"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PolicyFrameworkMap;
