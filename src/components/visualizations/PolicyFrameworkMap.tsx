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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

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

interface FrameworkData {
  id: string;
  title: string;
  version: string;
  effectiveDate: string;
  authority: string;
  sourceUrl: string;
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

function RequirementCard({ requirement }: { requirement: Requirement }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const typeStyles: Record<string, string> = {
    mandatory: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
    recommended: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    consideration: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  };

  const typeLabels: Record<string, string> = {
    mandatory: 'Mandatory',
    recommended: 'Recommended',
    consideration: 'Consider',
  };

  return (
    <div
      className={cn(
        'border rounded-lg p-3 transition-all cursor-pointer hover:shadow-md',
        isExpanded && 'ring-2 ring-primary/20'
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-sm">{requirement.title}</h4>
            <Badge className={cn('text-xs', typeStyles[requirement.type] || 'bg-gray-100 text-gray-800')}>
              {typeLabels[requirement.type] || requirement.type}
            </Badge>
            {requirement.deadline && (
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                {requirement.deadline}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{requirement.description}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
      {isExpanded && (
        <div className="mt-3 pt-3 border-t">
          <ul className="space-y-1">
            {requirement.details.map((detail, idx) => (
              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PillarCard({ pillar, isSelected, onSelect }: { pillar: Pillar; isSelected: boolean; onSelect: () => void }) {
  const Icon = iconMap[pillar.icon] || Globe;
  const mandatoryCount = pillar.requirements.filter((r) => r.type === 'mandatory').length;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-lg',
        isSelected && 'ring-2 ring-primary shadow-lg'
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-3">
        <div
          className="h-12 w-12 rounded-lg flex items-center justify-center mb-3"
          style={{ backgroundColor: `${pillar.color}20` }}
        >
          <Icon className="h-6 w-6" style={{ color: pillar.color }} />
        </div>
        <CardTitle className="text-lg">{pillar.title}</CardTitle>
        <CardDescription className="text-sm">{pillar.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{pillar.principles.length} Principles</Badge>
          <Badge variant="destructive">{mandatoryCount} Mandatory</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function PolicyAimCard({ aim }: { aim: PolicyAim }) {
  const Icon = iconMap[aim.icon] || Rocket;

  return (
    <div className="flex-1 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow">
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center mb-3"
        style={{ backgroundColor: `${aim.color}20` }}
      >
        <Icon className="h-5 w-5" style={{ color: aim.color }} />
      </div>
      <h3 className="font-semibold text-sm mb-1">{aim.title}</h3>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">{data.title}</h2>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">Version {data.version}</Badge>
            <Badge variant="secondary">Effective: {new Date(data.effectiveDate).toLocaleDateString('en-AU')}</Badge>
            <Badge>{data.authority}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('overview')}
          >
            Overview
          </Button>
          <Button
            variant={view === 'detailed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setView('detailed')}
          >
            Detailed
          </Button>
        </div>
      </div>

      {/* Policy Aims */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          Policy Aims
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.policyAims.map((aim) => (
            <PolicyAimCard key={aim.id} aim={aim} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Three Pillars */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-primary" />
          Principles and Requirements
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Click on a pillar to view its principles and requirements
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <Card className="mt-6 border-2" style={{ borderColor: selectedPillarData.color }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {(() => {
                const Icon = iconMap[selectedPillarData.icon] || Globe;
                return <Icon className="h-5 w-5" style={{ color: selectedPillarData.color }} />;
              })()}
              {selectedPillarData.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Principles */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Principles
              </h4>
              <ul className="space-y-2">
                {selectedPillarData.principles.map((principle, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: selectedPillarData.color }}
                    >
                      {idx + 1}
                    </span>
                    {principle}
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            {/* Requirements */}
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Requirements
              </h4>
              <div className="space-y-3">
                {selectedPillarData.requirements.map((req) => (
                  <RequirementCard key={req.id} requirement={req} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'detailed' && (
        <>
          <Separator />

          {/* In-Scope Criteria */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              In-Scope AI Use Case Criteria
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              An AI use case is in scope of this policy if any of the following apply:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.inScopeCriteria.map((criteria) => (
                <div key={criteria.id} className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50">
                  <p className="text-sm font-medium">{criteria.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {criteria.applicableTo.map((item) => (
                      <Badge key={item} variant="outline" className="text-xs">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Areas */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-500" />
              Areas Requiring Careful Consideration
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              While not automatically high-risk, these areas are more likely to involve risks requiring impact assessment:
            </p>
            <div className="flex flex-wrap gap-2">
              {data.riskAreas.map((area) => (
                <Badge key={area} variant="secondary" className="text-sm py-1 px-3">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PolicyFrameworkMap;
