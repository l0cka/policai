// Core domain types for Policai

export type Jurisdiction =
  | 'federal'
  | 'nsw'
  | 'vic'
  | 'qld'
  | 'wa'
  | 'sa'
  | 'tas'
  | 'act'
  | 'nt';

export type PolicyType =
  | 'legislation'
  | 'regulation'
  | 'guideline'
  | 'framework'
  | 'standard';

export type PolicyStatus =
  | 'proposed'
  | 'active'
  | 'amended'
  | 'repealed'
  | 'trashed';

export type AgencyLevel = 'federal' | 'state';

export interface Policy {
  id: string;
  title: string;
  description: string;
  jurisdiction: Jurisdiction;
  type: PolicyType;
  status: PolicyStatus;
  effectiveDate: Date | string;
  agencies: string[];
  sourceUrl: string;
  content: string;
  aiSummary: string;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Agency {
  id: string;
  name: string;
  acronym: string;
  level: AgencyLevel;
  jurisdiction: Jurisdiction;
  aiTransparencyStatement?: string;
  aiUsageDisclosure?: string;
  website: string;
  policies?: string[];
  transparencyStatementUrl?: string;
  lastUpdated?: string;
  hasPublishedStatement: boolean;
  accountableOfficial?: string;
  contactEmail?: string;
  auditFindings?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedDate: Date | string;
  relevanceScore: number;
  relatedPolicies: string[];
  tags: string[];
}

export interface TimelineEvent {
  id: string;
  date: Date | string;
  title: string;
  description: string;
  type: 'policy_introduced' | 'policy_amended' | 'policy_repealed' | 'announcement' | 'milestone';
  jurisdiction: Jurisdiction;
  relatedPolicyId?: string;
  sourceUrl?: string;
}

// Map visualization types
export interface JurisdictionStats {
  jurisdiction: Jurisdiction;
  policyCount: number;
  activePolicies: number;
  recentUpdates: number;
  agencies: number;
}

// Network/Graph visualization types
export interface PolicyNode {
  id: string;
  label: string;
  type: 'policy' | 'agency' | 'jurisdiction';
  data: Policy | Agency | { jurisdiction: Jurisdiction };
}

export interface PolicyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'governs' | 'related_to' | 'supersedes' | 'amends' | 'located_in';
}

// API response types
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Filter types for UI
export interface PolicyFilters {
  jurisdiction?: Jurisdiction[];
  type?: PolicyType[];
  status?: PolicyStatus[];
  search?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  tags?: string[];
}

// Display name mappings
export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  federal: 'Federal',
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  wa: 'Western Australia',
  sa: 'South Australia',
  tas: 'Tasmania',
  act: 'Australian Capital Territory',
  nt: 'Northern Territory',
};

export const POLICY_TYPE_NAMES: Record<PolicyType, string> = {
  legislation: 'Legislation',
  regulation: 'Regulation',
  guideline: 'Guideline',
  framework: 'Framework',
  standard: 'Standard',
};

export const POLICY_STATUS_NAMES: Record<PolicyStatus, string> = {
  proposed: 'Proposed',
  active: 'Active',
  amended: 'Amended',
  repealed: 'Repealed',
  trashed: 'Trashed',
};

// AI Review Pipeline Types

export type PipelineStage =
  | 'research'
  | 'research_complete'
  | 'verification'
  | 'verification_complete'
  | 'hitl_review'
  | 'implementation'
  | 'complete'
  | 'failed';

export type FindingStatus =
  | 'discovered'
  | 'verified'
  | 'rejected'
  | 'implemented';

export type VerificationOutcome =
  | 'confirmed'
  | 'partially_confirmed'
  | 'unverifiable'
  | 'contradicted';

export interface ResearchFinding {
  id: string;
  pipelineRunId: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceContent: string;
  discoveredAt: string;
  status: FindingStatus;
  relevanceScore: number;
  suggestedType: PolicyType | null;
  suggestedJurisdiction: Jurisdiction | null;
  tags: string[];
  agencies: string[];
  keyDates: string[];
  relatedTopics: string[];
  isNewPolicy: boolean;
  existingPolicyId?: string;
  changeDescription?: string;
}

export interface VerificationResult {
  id: string;
  findingId: string;
  pipelineRunId: string;
  verifiedAt: string;
  outcome: VerificationOutcome;
  confidenceScore: number;
  sourcesCrossReferenced: string[];
  verificationNotes: string;
  factualIssues: string[];
  suggestedCorrections: string[];
}

export interface ScraperRunLog {
  id: string;
  timestamp: string;
  sourceId: string;
  sourceName: string;
  linksFound: number;
  policiesCreated: number;
  errors: string[];
  durationMs: number;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  stage: PipelineStage;
  sourcesScanned: string[];
  findingsCount: number;
  verifiedCount: number;
  implementedCount: number;
  rejectedCount: number;
  hitlRequired: boolean;
  hitlApprovedAt?: string;
  hitlApprovedBy?: string;
  hitlNotes?: string;
  error?: string;
}

export const PIPELINE_STAGE_NAMES: Record<PipelineStage, string> = {
  research: 'Researching',
  research_complete: 'Research Complete',
  verification: 'Verifying',
  verification_complete: 'Verification Complete',
  hitl_review: 'Awaiting Review',
  implementation: 'Implementing',
  complete: 'Complete',
  failed: 'Failed',
};

export const VERIFICATION_OUTCOME_NAMES: Record<VerificationOutcome, string> = {
  confirmed: 'Confirmed',
  partially_confirmed: 'Partially Confirmed',
  unverifiable: 'Unverifiable',
  contradicted: 'Contradicted',
};
