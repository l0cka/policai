import {
  DEVELOPMENT_STATUSES,
  JURISDICTIONS,
  POLICY_STATUSES,
  POLICY_TYPES,
  TIMELINE_EVENT_TYPES,
  type Agency,
  type Development,
  type Policy,
  type TimelineEvent,
} from '@/types';

/**
 * Structural validation for the repo's canonical data files. Git is the
 * database, so this is the schema enforcement layer: it runs in CI, in the
 * collector workflow, and via `npm run validate:data`.
 */

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Hosts allowed as policy/development sources besides *.gov.au. */
const EXTRA_ALLOWED_HOSTS = new Set(['www.csiro.au', 'csiro.au']);

function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!ISO_DATE.test(value.slice(0, 10))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function isAllowedSourceHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return hostname.endsWith('.gov.au') || EXTRA_ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function validatePolicies(policies: Policy[]): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const sourceUrls = new Map<string, string>();

  policies.forEach((policy, index) => {
    const label = policy.id || `policies[${index}]`;

    if (!isNonEmptyString(policy.id)) errors.push(`${label}: missing id`);
    else if (ids.has(policy.id)) errors.push(`${label}: duplicate id`);
    else ids.add(policy.id);

    if (!isNonEmptyString(policy.title)) errors.push(`${label}: missing title`);
    if (!isNonEmptyString(policy.description))
      errors.push(`${label}: missing description`);
    if (!isOneOf(JURISDICTIONS, policy.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${policy.jurisdiction}"`);
    if (!isOneOf(POLICY_TYPES, policy.type))
      errors.push(`${label}: invalid type "${policy.type}"`);
    if (!isOneOf(POLICY_STATUSES, policy.status))
      errors.push(`${label}: invalid status "${policy.status}"`);
    if (!isIsoDateString(policy.effectiveDate))
      errors.push(`${label}: invalid effectiveDate "${policy.effectiveDate}"`);
    if (!Array.isArray(policy.tags)) errors.push(`${label}: tags must be an array`);
    if (!Array.isArray(policy.agencies))
      errors.push(`${label}: agencies must be an array`);

    if (!isNonEmptyString(policy.sourceUrl)) {
      errors.push(`${label}: missing sourceUrl`);
    } else {
      if (!isAllowedSourceHost(policy.sourceUrl)) {
        errors.push(
          `${label}: sourceUrl not an allowed https government host (${policy.sourceUrl})`,
        );
      }
      const existing = sourceUrls.get(policy.sourceUrl);
      if (existing) {
        errors.push(`${label}: duplicate sourceUrl (also on ${existing})`);
      } else {
        sourceUrls.set(policy.sourceUrl, label);
      }
    }

    if (policy.supersededBy && !isNonEmptyString(policy.supersededBy)) {
      errors.push(`${label}: supersededBy must be a policy id`);
    }
  });

  // Cross-reference supersededBy targets
  policies.forEach((policy) => {
    if (policy.supersededBy && !ids.has(policy.supersededBy)) {
      warnings.push(
        `${policy.id}: supersededBy "${policy.supersededBy}" does not match a policy id`,
      );
    }
  });

  return { errors, warnings };
}

export function validateAgencies(
  agencies: Agency[],
  fileLabel: string,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  agencies.forEach((agency, index) => {
    const label = `${fileLabel}:${agency.id || index}`;
    if (!isNonEmptyString(agency.id)) errors.push(`${label}: missing id`);
    else if (ids.has(agency.id)) errors.push(`${label}: duplicate id`);
    else ids.add(agency.id);

    if (!isNonEmptyString(agency.name)) errors.push(`${label}: missing name`);
    if (!isOneOf(JURISDICTIONS, agency.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${agency.jurisdiction}"`);
    if (!isOneOf(['federal', 'state'], agency.level))
      errors.push(`${label}: invalid level "${agency.level}"`);
  });

  return { errors, warnings };
}

export function validateTimeline(
  events: TimelineEvent[],
  policyIds: Set<string>,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  events.forEach((event, index) => {
    const label = event.id || `timeline[${index}]`;
    if (!isNonEmptyString(event.id)) errors.push(`${label}: missing id`);
    else if (ids.has(event.id)) errors.push(`${label}: duplicate id`);
    else ids.add(event.id);

    if (!isNonEmptyString(event.title)) errors.push(`${label}: missing title`);
    if (!isIsoDateString(event.date))
      errors.push(`${label}: invalid date "${event.date}"`);
    if (!isOneOf(TIMELINE_EVENT_TYPES, event.type))
      errors.push(`${label}: invalid type "${event.type}"`);
    if (!isOneOf(JURISDICTIONS, event.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${event.jurisdiction}"`);
    if (event.relatedPolicyId && !policyIds.has(event.relatedPolicyId)) {
      errors.push(
        `${label}: relatedPolicyId "${event.relatedPolicyId}" does not match a policy`,
      );
    }
    if (event.sourceUrl && !isAllowedSourceHost(event.sourceUrl)) {
      warnings.push(`${label}: sourceUrl is not an allowed government host`);
    }
  });

  return { errors, warnings };
}

export function validateDevelopments(
  developments: Development[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  developments.forEach((development, index) => {
    const label = development.id || `developments[${index}]`;
    if (!isNonEmptyString(development.id)) errors.push(`${label}: missing id`);
    else if (ids.has(development.id)) errors.push(`${label}: duplicate id`);
    else ids.add(development.id);

    if (!isNonEmptyString(development.title))
      errors.push(`${label}: missing title`);
    if (!isNonEmptyString(development.url)) errors.push(`${label}: missing url`);
    if (!isOneOf(JURISDICTIONS, development.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${development.jurisdiction}"`);
    if (!isOneOf(DEVELOPMENT_STATUSES, development.status))
      errors.push(`${label}: invalid status "${development.status}"`);
    if (!isOneOf(['ai', 'heuristic'], development.classification))
      errors.push(
        `${label}: invalid classification "${development.classification}"`,
      );
    if (
      typeof development.relevanceScore !== 'number' ||
      development.relevanceScore < 0 ||
      development.relevanceScore > 1
    ) {
      errors.push(`${label}: relevanceScore must be between 0 and 1`);
    }
    if (!isIsoDateString(development.detectedAt))
      errors.push(`${label}: invalid detectedAt "${development.detectedAt}"`);
    if (development.publishedAt && !isIsoDateString(development.publishedAt))
      errors.push(`${label}: invalid publishedAt "${development.publishedAt}"`);
  });

  return { errors, warnings };
}

export function mergeReports(
  ...reports: ValidationReport[]
): ValidationReport {
  return {
    errors: reports.flatMap((report) => report.errors),
    warnings: reports.flatMap((report) => report.warnings),
  };
}
