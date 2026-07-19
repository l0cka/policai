import {
  COLLECTION_HEALTH_STATUSES,
  DATE_PRECISIONS,
  DEVELOPMENT_STATUSES,
  JURISDICTIONS,
  MANUAL_SOURCE_REVIEW_STATUSES,
  MANUAL_EXTRACTION_METHODS,
  POLICY_STATUSES,
  POLICY_DATE_TYPES,
  POLICY_TYPES,
  SOURCE_REVIEW_ENTRY_KINDS,
  SOURCE_REVIEW_STATUSES,
  SOURCE_RUN_STATUSES,
  TIMELINE_EVENT_TYPES,
  VERIFICATION_STATUSES,
  type Agency,
  type CollectionMeta,
  type Development,
  type Policy,
  type RecordVerification,
  type SourceEvidence,
  type SourceMonitoringState,
  type SourceReview,
  type TimelineEvent,
} from '@/types';
import type { WatchState } from '@/lib/pipeline/collect';
import type { WatchSource } from '@/lib/pipeline/sources';
import { isValidCalendarDate } from '@/lib/calendar-date';
import { VERIFICATION_CLOCK_SKEW_TOLERANCE_MS } from '@/lib/verification';
export { isAllowedSourceHost } from '@/lib/source-url';
import {
  canonicalizeSourceUrl,
  isAllowedSourceHost,
  isSafePublicHttpsUrl,
  sourceUrlIdentity,
  sourceUrlsEqual,
} from '@/lib/source-url';

/**
 * Structural validation for the repo's canonical data files. Git is the
 * database, so this is the schema enforcement layer: it runs in CI, in the
 * collector workflow, and via `npm run validate:data`.
 */

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

export interface SourceReviewTargets {
  policies: readonly Policy[];
  timelineEvents: readonly TimelineEvent[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const SHA256 = /^[a-f0-9]{64}$/;

function isOneOf(values: readonly string[], value: unknown): boolean {
  return typeof value === 'string' && values.includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCalendarDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_DATE.test(value) &&
    isValidCalendarDate(value)
  );
}

function isTimestampString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    RFC3339_TIMESTAMP.test(value) &&
    isValidCalendarDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

function isReviewDate(value: unknown): value is string {
  // Legacy reviews recorded only a source-backed day; newer reviews retain
  // their RFC 3339 audit timestamp. Both representations are unambiguous.
  return isCalendarDateString(value) || isTimestampString(value);
}

function validateManualExtractionEvidence(
  label: string,
  source: SourceEvidence | undefined,
  errors: string[],
): void {
  const extraction = source?.manualExtraction;
  if (!extraction) return;
  if (!isOneOf(MANUAL_EXTRACTION_METHODS, extraction.method)) {
    errors.push(`${label}: invalid manual extraction method`);
  }
  if (!isTimestampString(extraction.extractedAt)) {
    errors.push(`${label}: invalid manual extraction timestamp`);
  }
  if (!isNonEmptyString(extraction.extractedBy)) {
    errors.push(`${label}: manual extraction requires an editor`);
  }
  if (!isNonEmptyString(extraction.notes)) {
    errors.push(`${label}: manual extraction requires notes`);
  }
  if (!SHA256.test(extraction.textHash)) {
    errors.push(`${label}: manual extraction textHash must be SHA-256`);
  }
  if (
    !Number.isInteger(extraction.characterCount) ||
    extraction.characterCount < 20
  ) {
    errors.push(
      `${label}: manual extraction characterCount must be at least 20`,
    );
  }
  if (!source?.contentHash) {
    errors.push(`${label}: manual extraction requires a source contentHash`);
  }
}

function validateBrowserCaptureEvidence(
  label: string,
  source: SourceEvidence | undefined,
  errors: string[],
): void {
  const capture = source?.browserCapture;
  if (!capture) return;
  if (capture.method !== 'browser') {
    errors.push(`${label}: invalid browser capture method`);
  }
  if (!isTimestampString(capture.capturedAt)) {
    errors.push(`${label}: invalid browser capture timestamp`);
  }
  if (!isNonEmptyString(capture.capturedBy)) {
    errors.push(`${label}: browser capture requires a reviewer`);
  }
  if (
    !isNonEmptyString(capture.notes) ||
    capture.notes.trim().length < 20
  ) {
    errors.push(`${label}: browser capture requires substantive notes`);
  }
  if (!SHA256.test(capture.pageContentHash)) {
    errors.push(`${label}: browser capture pageContentHash must be SHA-256`);
  }
  if (
    !Number.isInteger(capture.characterCount) ||
    capture.characterCount < 20 ||
    capture.characterCount > 500_000
  ) {
    errors.push(
      `${label}: browser capture characterCount must be between 20 and 500000`,
    );
  }
  if (!source?.contentHash) {
    errors.push(`${label}: browser capture requires a source contentHash`);
  }
  if (
    source?.retrievedAt &&
    capture.capturedAt !== source.retrievedAt
  ) {
    errors.push(
      `${label}: browser capture timestamp must match source retrieval`,
    );
  }
}

function validateReviewedDateEvidence(
  label: string,
  source: SourceEvidence | undefined,
  errors: string[],
): void {
  const reviewedDate = source?.reviewedDate;
  if (!reviewedDate) return;
  if (!isCalendarDateString(reviewedDate.date)) {
    errors.push(`${label}: reviewed date must be an exact calendar date`);
  }
  if (!isOneOf(DATE_PRECISIONS, reviewedDate.precision)) {
    errors.push(`${label}: invalid reviewed date precision`);
  }
  if (!isTimestampString(reviewedDate.reviewedAt)) {
    errors.push(`${label}: invalid reviewed date timestamp`);
  }
  if (!isNonEmptyString(reviewedDate.reviewedBy)) {
    errors.push(`${label}: reviewed date requires an editor`);
  }
  if (
    !isNonEmptyString(reviewedDate.notes) ||
    reviewedDate.notes.trim().length < 20
  ) {
    errors.push(`${label}: reviewed date requires substantive notes`);
  }
  if (!source?.contentHash) {
    errors.push(`${label}: reviewed date requires a source contentHash`);
  }
  if (occursAfter(source?.retrievedAt, reviewedDate.reviewedAt)) {
    errors.push(`${label}: reviewed date cannot predate source retrieval`);
  }
}

function occursAfter(
  earlier: unknown,
  later: unknown,
): boolean {
  return (
    isTimestampString(earlier) &&
    isTimestampString(later) &&
    new Date(earlier).getTime() > new Date(later).getTime()
  );
}

function dateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function sourceBacksRecordDate(
  source: SourceEvidence | undefined,
  date: Date | string,
  precision: string,
  allowPublishedMetadata: boolean,
): boolean {
  const normalizedDate = dateOnly(date);
  return Boolean(
    source &&
      SHA256.test(source.contentHash ?? '') &&
      ((allowPublishedMetadata &&
        source.publishedAt === normalizedDate &&
        source.publishedAtPrecision === precision) ||
        (source.reviewedDate?.date === normalizedDate &&
          source.reviewedDate.precision === precision)),
  );
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function validateCanonicalSourceUrl(
  label: string,
  value: string,
  errors: string[],
): void {
  try {
    if (canonicalizeSourceUrl(value) !== value) {
      errors.push(`${label}: URL must use the canonical source representation`);
    }
  } catch {
    // The caller reports malformed URLs in its domain-specific validation.
  }
}

function validateVerification(
  label: string,
  canonicalUrl: string,
  verification: RecordVerification | undefined,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(verification)) {
    return {
      errors: [`${label}: missing verification metadata`],
      warnings,
    };
  }
  const source = isRecord(verification.source)
    ? (verification.source as unknown as SourceEvidence)
    : undefined;
  if (!isOneOf(VERIFICATION_STATUSES, verification.status)) {
    errors.push(`${label}: invalid verification status`);
  }
  if (!source || !isNonEmptyString(source.url)) {
    errors.push(`${label}: verification source URL is required`);
  } else {
    validateCanonicalSourceUrl(`${label}: verification source`, source.url, errors);
    if (!sourceUrlsEqual(source.url, canonicalUrl)) {
      errors.push(`${label}: verification source URL must match canonical URL`);
    }
    if (!isAllowedSourceHost(source.url)) {
      errors.push(`${label}: verification source is not an allowed host`);
    }
  }
  if (
    source?.finalUrl &&
    !isAllowedSourceHost(source.finalUrl)
  ) {
    errors.push(`${label}: verification final URL is not an allowed host`);
  } else if (source?.finalUrl) {
    validateCanonicalSourceUrl(
      `${label}: verification final source`,
      source.finalUrl,
      errors,
    );
  }
  if (
    source?.contentHash &&
    !SHA256.test(source.contentHash)
  ) {
    errors.push(`${label}: verification contentHash must be SHA-256`);
  }
  validateManualExtractionEvidence(
    `${label}: verification source`,
    source,
    errors,
  );
  validateBrowserCaptureEvidence(
    `${label}: verification source`,
    source,
    errors,
  );
  validateReviewedDateEvidence(
    `${label}: verification source`,
    source,
    errors,
  );
  if (source?.linkedDocuments !== undefined) {
    if (!Array.isArray(source.linkedDocuments)) {
      errors.push(`${label}: linkedDocuments must be an array`);
    } else {
      if (!source.contentHash) {
        errors.push(
          `${label}: linkedDocuments require a composite verification contentHash`,
        );
      }
      const linkedUrls = new Set<string>();
      source.linkedDocuments.forEach((document, index) => {
        const documentLabel = `${label}: linkedDocuments[${index}]`;
        if (!isRecord(document)) {
          errors.push(`${documentLabel}: document evidence must be an object`);
          return;
        }
        if (!isSafePublicHttpsUrl(String(document.url ?? ''))) {
          errors.push(`${documentLabel}: URL must be public HTTPS`);
        } else if (linkedUrls.has(sourceUrlIdentity(String(document.url)))) {
          errors.push(`${documentLabel}: duplicate URL`);
        } else {
          linkedUrls.add(sourceUrlIdentity(String(document.url)));
          validateCanonicalSourceUrl(
            documentLabel,
            String(document.url),
            errors,
          );
        }
        if (
          document.finalUrl &&
          !isSafePublicHttpsUrl(String(document.finalUrl))
        ) {
          errors.push(`${documentLabel}: final URL must be public HTTPS`);
        } else if (document.finalUrl) {
          validateCanonicalSourceUrl(
            `${documentLabel}: final URL`,
            String(document.finalUrl),
            errors,
          );
        }
        if (!SHA256.test(String(document.contentHash ?? ''))) {
          errors.push(`${documentLabel}: contentHash must be SHA-256`);
        }
        if (
          document.retrievedAt &&
          !isTimestampString(document.retrievedAt)
        ) {
          errors.push(`${documentLabel}: invalid retrievedAt`);
        }
      });
    }
  }
  for (const [field, value] of [
    ['retrievedAt', source?.retrievedAt],
    ['checkedAt', verification.checkedAt],
    ['lastSourceAuditAt', verification.lastSourceAuditAt],
  ] as const) {
    if (value && !isTimestampString(value)) {
      errors.push(`${label}: invalid verification ${field} "${value}"`);
    }
  }
  if (source?.publishedAt && !isCalendarDateString(source.publishedAt)) {
    errors.push(
      `${label}: invalid verification publishedAt "${source.publishedAt}"`,
    );
  }
  if (
    source?.publishedAtPrecision &&
    !isOneOf(
      DATE_PRECISIONS,
      source.publishedAtPrecision,
    )
  ) {
    errors.push(`${label}: invalid source publishedAtPrecision`);
  }
  if (
    source?.publishedAtPrecision &&
    !source.publishedAt
  ) {
    errors.push(
      `${label}: source publishedAtPrecision requires publishedAt`,
    );
  }

  if (verification.status === 'verified') {
    if (!SHA256.test(source?.contentHash ?? '')) {
      errors.push(
        `${label}: verified records require a SHA-256 source fingerprint`,
      );
    }
    if (!isTimestampString(verification.checkedAt)) {
      errors.push(`${label}: verified records require checkedAt`);
    }
    if (!isNonEmptyString(verification.checkedBy)) {
      errors.push(`${label}: verified records require checkedBy`);
    }
    if (verification.method !== 'manual') {
      errors.push(
        `${label}: verified records require manual editorial verification`,
      );
    }
    if (
      isTimestampString(verification.checkedAt) &&
      new Date(verification.checkedAt).getTime() >
        Date.now() + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
    ) {
      errors.push(`${label}: verification checkedAt cannot be in the future`);
    }
    if (
      isTimestampString(source?.retrievedAt) &&
      isTimestampString(verification.checkedAt) &&
      new Date(source.retrievedAt).getTime() >
        new Date(verification.checkedAt).getTime() +
          VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
    ) {
      if (
        !isTimestampString(verification.lastSourceAuditAt) ||
        new Date(verification.lastSourceAuditAt).getTime() <
          new Date(source.retrievedAt).getTime()
      ) {
        errors.push(
          `${label}: verification source retrieval cannot follow editorial verification without lastSourceAuditAt`,
        );
      }
    }
  }

  return { errors, warnings };
}

export function validatePolicies(policies: Policy[]): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const sourceUrls = new Map<string, string>();
  let unverifiedCount = 0;

  policies.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      errors.push(`policies[${index}]: policy must be an object`);
      return;
    }
    const policy = candidate as unknown as Policy;
    const label = isNonEmptyString(policy.id)
      ? policy.id
      : `policies[${index}]`;

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
    if (!isCalendarDateString(policy.effectiveDate))
      errors.push(`${label}: invalid effectiveDate "${policy.effectiveDate}"`);
    if (!Array.isArray(policy.dates) || policy.dates.length === 0) {
      errors.push(`${label}: at least one structured policy date is required`);
    } else {
      const primaryDates = policy.dates.filter(
        (date) => isRecord(date) && date.primary === true,
      );
      if (primaryDates.length !== 1) {
        errors.push(`${label}: exactly one structured date must be primary`);
      }
      const seenDateTypes = new Set<string>();
      policy.dates.forEach((candidateDate, dateIndex) => {
        const dateLabel = `${label}:dates[${dateIndex}]`;
        if (!isRecord(candidateDate)) {
          errors.push(`${dateLabel}: structured date must be an object`);
          return;
        }
        const date = candidateDate;
        if (!isOneOf(POLICY_DATE_TYPES, date.type))
          errors.push(`${dateLabel}: invalid date type`);
        else if (seenDateTypes.has(String(date.type)))
          errors.push(`${dateLabel}: duplicate date type`);
        else seenDateTypes.add(String(date.type));
        if (!isCalendarDateString(date.date))
          errors.push(`${dateLabel}: invalid date`);
        if (!isOneOf(DATE_PRECISIONS, date.precision))
          errors.push(`${dateLabel}: invalid precision`);
        if (
          date.precision === 'year' &&
          isCalendarDateString(date.date) &&
          !dateOnly(date.date).endsWith('-01-01')
        ) {
          errors.push(`${dateLabel}: year precision must use 1 January`);
        }
        if (
          date.precision === 'month' &&
          isCalendarDateString(date.date) &&
          !dateOnly(date.date).endsWith('-01')
        ) {
          errors.push(`${dateLabel}: month precision must use the first day`);
        }
        if (date.primary !== undefined && typeof date.primary !== 'boolean') {
          errors.push(`${dateLabel}: primary must be boolean`);
        }
        if (date.source !== undefined) {
          if (!isRecord(date.source)) {
            errors.push(`${dateLabel}: source evidence must be an object`);
          } else if (
            !isNonEmptyString(date.source.url) ||
            !isAllowedSourceHost(date.source.url)
          ) {
            errors.push(`${dateLabel}: source is not an allowed official host`);
          } else {
            const dateSource = date.source as unknown as SourceEvidence;
            validateManualExtractionEvidence(dateLabel, dateSource, errors);
            validateBrowserCaptureEvidence(dateLabel, dateSource, errors);
            validateReviewedDateEvidence(dateLabel, dateSource, errors);
            if (
              dateSource.reviewedDate &&
              isCalendarDateString(date.date) &&
              (dateSource.reviewedDate.date !== dateOnly(date.date) ||
                dateSource.reviewedDate.precision !== date.precision)
            ) {
              errors.push(
                `${dateLabel}: reviewed date evidence must match the structured date`,
              );
            }
          }
        }
      });
      if (
        primaryDates[0] &&
        isCalendarDateString(primaryDates[0].date) &&
        isCalendarDateString(policy.effectiveDate) &&
        dateOnly(primaryDates[0].date) !== dateOnly(policy.effectiveDate)
      ) {
        errors.push(
          `${label}: effectiveDate compatibility field must match the primary structured date`,
        );
      }
      const primaryDate = primaryDates[0];
      if (
        policy.verification?.status === 'verified' &&
        primaryDate &&
        isCalendarDateString(primaryDate.date) &&
        isOneOf(DATE_PRECISIONS, primaryDate.precision)
      ) {
        const primarySource = isRecord(primaryDate.source)
          ? (primaryDate.source as unknown as SourceEvidence)
          : undefined;
        if (
          !sourceBacksRecordDate(
            primarySource,
            primaryDate.date,
            String(primaryDate.precision),
            primaryDate.type === 'published',
          )
        ) {
          errors.push(
            `${label}: verified primary date requires matching source publication metadata or reviewed date evidence`,
          );
        }
      }
    }
    if (!Array.isArray(policy.tags)) {
      errors.push(`${label}: tags must be an array`);
    } else if (policy.tags.some((tag) => !isNonEmptyString(tag))) {
      errors.push(`${label}: tags must contain non-empty strings`);
    }
    if (!Array.isArray(policy.agencies)) {
      errors.push(`${label}: agencies must be an array`);
    } else if (
      policy.agencies.some((agency) => !isNonEmptyString(agency))
    ) {
      errors.push(`${label}: agencies must contain non-empty strings`);
    }
    if (!isNonEmptyString(policy.content))
      errors.push(`${label}: missing verified content`);
    if (!isNonEmptyString(policy.aiSummary))
      errors.push(`${label}: missing AI summary`);
    if (!isTimestampString(policy.createdAt))
      errors.push(`${label}: invalid createdAt "${policy.createdAt}"`);
    if (!isTimestampString(policy.updatedAt))
      errors.push(`${label}: invalid updatedAt "${policy.updatedAt}"`);
    if (policy.lastReviewedAt && !isReviewDate(policy.lastReviewedAt))
      errors.push(
        `${label}: invalid lastReviewedAt "${policy.lastReviewedAt}"`,
      );
    if (occursAfter(policy.createdAt, policy.updatedAt)) {
      errors.push(`${label}: createdAt cannot be later than updatedAt`);
    }

    if (!isNonEmptyString(policy.sourceUrl)) {
      errors.push(`${label}: missing sourceUrl`);
    } else {
      if (!isAllowedSourceHost(policy.sourceUrl)) {
        errors.push(
          `${label}: sourceUrl not an allowed https government host (${policy.sourceUrl})`,
        );
      }
      validateCanonicalSourceUrl(`${label}: sourceUrl`, policy.sourceUrl, errors);
      const sourceIdentity = sourceUrlIdentity(policy.sourceUrl);
      const existing = sourceUrls.get(sourceIdentity);
      if (existing) {
        errors.push(`${label}: duplicate sourceUrl (also on ${existing})`);
      } else {
        sourceUrls.set(sourceIdentity, label);
      }
    }

    const verificationReport = validateVerification(
      label,
      isNonEmptyString(policy.sourceUrl) ? policy.sourceUrl : '',
      policy.verification,
    );
    errors.push(...verificationReport.errors);
    warnings.push(...verificationReport.warnings);
    if (policy.verification?.status !== 'verified') {
      unverifiedCount++;
    }

    if (policy.supersededBy && !isNonEmptyString(policy.supersededBy)) {
      errors.push(`${label}: supersededBy must be a policy id`);
    }
  });

  // Cross-reference supersededBy targets
  policies.forEach((policy) => {
    if (!isRecord(policy)) return;
    if (policy.supersededBy && !ids.has(policy.supersededBy)) {
      warnings.push(
        `${policy.id}: supersededBy "${policy.supersededBy}" does not match a policy id`,
      );
    }
  });

  if (unverifiedCount > 0) {
    warnings.push(
      `policies: ${unverifiedCount} register records await fingerprinted editorial review and are withheld from public reads`,
    );
  }

  return { errors, warnings };
}

export function validateAgencies(
  agencies: Agency[],
  fileLabel: string,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  let unverifiedCount = 0;

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
    if (typeof agency.hasPublishedStatement !== 'boolean')
      errors.push(`${label}: hasPublishedStatement must be boolean`);
    if (!isAllowedSourceHost(agency.website))
      errors.push(`${label}: website is not an allowed official source`);

    const evidenceUrl =
      agency.transparencyStatementUrl || agency.website;
    const verificationReport = validateVerification(
      label,
      evidenceUrl,
      agency.verification,
    );
    errors.push(...verificationReport.errors);
    warnings.push(...verificationReport.warnings);
    if (agency.verification?.status !== 'verified') {
      unverifiedCount++;
    }
  });

  if (unverifiedCount > 0) {
    warnings.push(
      `${fileLabel}: ${unverifiedCount} agency records await editorial review; unverified narrative is withheld from public reads`,
    );
  }

  return { errors, warnings };
}

export function validateTimeline(
  events: TimelineEvent[],
  policyIds: Set<string>,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  let unverifiedCount = 0;

  events.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      errors.push(`timeline[${index}]: event must be an object`);
      return;
    }
    const event = candidate as unknown as TimelineEvent;
    const label = isNonEmptyString(event.id)
      ? event.id
      : `timeline[${index}]`;
    if (!isNonEmptyString(event.id)) errors.push(`${label}: missing id`);
    else if (ids.has(event.id)) errors.push(`${label}: duplicate id`);
    else ids.add(event.id);

    if (!isNonEmptyString(event.title)) errors.push(`${label}: missing title`);
    if (!isNonEmptyString(event.description))
      errors.push(`${label}: missing description`);
    if (!isCalendarDateString(event.date))
      errors.push(`${label}: invalid date "${event.date}"`);
    if (
      event.verification?.status === 'verified' &&
      !event.datePrecision
    ) {
      errors.push(
        `${label}: verified timeline records require datePrecision`,
      );
    }
    if (
      event.datePrecision &&
      !isOneOf(DATE_PRECISIONS, event.datePrecision)
    ) {
      errors.push(`${label}: invalid datePrecision`);
    }
    if (
      event.datePrecision === 'year' &&
      isCalendarDateString(event.date) &&
      !dateOnly(event.date).endsWith('-01-01')
    ) {
      errors.push(`${label}: year precision must use 1 January`);
    }
    if (
      event.datePrecision === 'month' &&
      isCalendarDateString(event.date) &&
      !dateOnly(event.date).endsWith('-01')
    ) {
      errors.push(`${label}: month precision must use the first day`);
    }
    if (
      event.verification?.status === 'verified' &&
      isCalendarDateString(event.date) &&
      event.datePrecision &&
      isOneOf(DATE_PRECISIONS, event.datePrecision) &&
      !sourceBacksRecordDate(
        event.verification.source,
        event.date,
        event.datePrecision,
        true,
      )
    ) {
      errors.push(
        `${label}: verified timeline date requires matching source publication metadata or reviewed date evidence`,
      );
    }
    if (!isOneOf(TIMELINE_EVENT_TYPES, event.type))
      errors.push(`${label}: invalid type "${event.type}"`);
    if (!isOneOf(JURISDICTIONS, event.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${event.jurisdiction}"`);
    if (
      event.relatedPolicyId !== undefined &&
      !isNonEmptyString(event.relatedPolicyId)
    ) {
      errors.push(`${label}: relatedPolicyId must be a policy id`);
    } else if (
      event.relatedPolicyId &&
      !policyIds.has(event.relatedPolicyId)
    ) {
      errors.push(
        `${label}: relatedPolicyId "${event.relatedPolicyId}" does not match a policy`,
      );
    }
    if (!isNonEmptyString(event.sourceUrl)) {
      errors.push(`${label}: missing sourceUrl`);
    } else if (!isAllowedSourceHost(event.sourceUrl)) {
      errors.push(`${label}: sourceUrl is not an allowed official host`);
    } else {
      validateCanonicalSourceUrl(`${label}: sourceUrl`, event.sourceUrl, errors);
    }
    const verificationReport = validateVerification(
      label,
      isNonEmptyString(event.sourceUrl) ? event.sourceUrl : '',
      event.verification,
    );
    errors.push(...verificationReport.errors);
    warnings.push(...verificationReport.warnings);
    if (event.verification?.status !== 'verified') unverifiedCount++;
  });

  if (unverifiedCount > 0) {
    warnings.push(
      `timeline: ${unverifiedCount} events await editorial review and are withheld from public reads`,
    );
  }

  return { errors, warnings };
}

export function validateDevelopments(
  developments: Development[],
  policyIds: Set<string> = new Set(),
  timelineEventIds: Set<string> = new Set(),
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
    else if (!isAllowedSourceHost(development.url))
      errors.push(`${label}: URL is not an allowed official source`);
    else validateCanonicalSourceUrl(label, development.url, errors);
    if (!isNonEmptyString(development.sourceId))
      errors.push(`${label}: missing sourceId`);
    if (!isNonEmptyString(development.sourceName))
      errors.push(`${label}: missing sourceName`);
    if (!isOneOf(JURISDICTIONS, development.jurisdiction))
      errors.push(`${label}: invalid jurisdiction "${development.jurisdiction}"`);
    if (!isOneOf(DEVELOPMENT_STATUSES, development.status))
      errors.push(`${label}: invalid status "${development.status}"`);
    if (
      development.status === 'dismissed' &&
      !isNonEmptyString(development.dismissalReason)
    ) {
      errors.push(`${label}: dismissed developments require dismissalReason`);
    }
    if (
      development.relatedPolicyId &&
      policyIds.size > 0 &&
      !policyIds.has(development.relatedPolicyId)
    ) {
      errors.push(
        `${label}: relatedPolicyId "${development.relatedPolicyId}" does not match a policy`,
      );
    }
    if (
      development.relatedTimelineEventId &&
      timelineEventIds.size > 0 &&
      !timelineEventIds.has(development.relatedTimelineEventId)
    ) {
      errors.push(
        `${label}: relatedTimelineEventId "${development.relatedTimelineEventId}" does not match a timeline event`,
      );
    }
    if (!isOneOf(['ai', 'heuristic', 'curated'], development.classification))
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
    if (!isTimestampString(development.detectedAt))
      errors.push(`${label}: invalid detectedAt "${development.detectedAt}"`);
    if (
      development.publishedAt &&
      !isCalendarDateString(development.publishedAt)
    )
      errors.push(`${label}: invalid publishedAt "${development.publishedAt}"`);
    if (
      development.publishedAtPrecision &&
      !isOneOf(DATE_PRECISIONS, development.publishedAtPrecision)
    ) {
      errors.push(`${label}: invalid publishedAtPrecision`);
    }
    if (
      development.publishedAtPrecision &&
      !development.publishedAt
    ) {
      errors.push(`${label}: publishedAtPrecision requires publishedAt`);
    }

    if (!development.assessment) {
      errors.push(`${label}: missing assessment provenance`);
    } else {
      if (!isOneOf(['ai', 'heuristic', 'editorial'], development.assessment.method))
        errors.push(`${label}: invalid assessment method`);
      if (!isTimestampString(development.assessment.assessedAt))
        errors.push(`${label}: invalid assessment assessedAt`);
      if (!isNonEmptyString(development.assessment.promptVersion))
        errors.push(`${label}: missing assessment promptVersion`);
      if (
        development.classification !== 'curated' &&
        development.assessment.method !== development.classification
      ) {
        errors.push(`${label}: assessment method does not match classification`);
      }
      if (
        development.classification === 'curated' &&
        development.assessment.method !== 'editorial'
      ) {
        errors.push(`${label}: curated developments require editorial assessment`);
      }
    }

    const verificationReport = validateVerification(
      label,
      development.url,
      development.verification,
    );
    errors.push(...verificationReport.errors);
    warnings.push(...verificationReport.warnings);
  });

  return { errors, warnings };
}

export function validateCollectionMeta(meta: CollectionMeta): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const collector = meta.collector;

  if (meta.lastCollectedAt && !isTimestampString(meta.lastCollectedAt))
    errors.push('meta: invalid lastCollectedAt');
  if (meta.lastHealthyAt && !isTimestampString(meta.lastHealthyAt))
    errors.push('meta: invalid lastHealthyAt');
  if (meta.lastReviewedAt && !isTimestampString(meta.lastReviewedAt))
    errors.push('meta: invalid lastReviewedAt');
  if (!isOneOf(COLLECTION_HEALTH_STATUSES, collector.health))
    errors.push('meta: invalid collector health');
  if (
    typeof collector.successRate !== 'number' ||
    collector.successRate < 0 ||
    collector.successRate > 1
  ) {
    errors.push('meta: collector successRate must be between 0 and 1');
  }
  for (const field of ['automaticSourceCount', 'manualSourceCount'] as const) {
    if (!Number.isInteger(collector[field]) || collector[field] < 0) {
      errors.push(`meta: collector ${field} must be a non-negative integer`);
    }
  }

  const coverageResults = collector.sourceResults.filter(
    (result) => result.coverageEligible !== false,
  );
  const successCount = coverageResults.filter(
    (result) => result.status === 'success',
  ).length;
  const failureCount = coverageResults.filter(
    (result) => result.status === 'error',
  ).length;
  const skippedCount = collector.sourceResults.filter(
    (result) => result.status === 'skipped',
  ).length;
  if (collector.dueSourceCount !== successCount + failureCount)
    errors.push('meta: dueSourceCount does not match source results');
  if (collector.successfulSourceCount !== successCount)
    errors.push('meta: successfulSourceCount does not match source results');
  if (collector.failedSourceCount !== failureCount)
    errors.push('meta: failedSourceCount does not match source results');
  if (collector.skippedSourceCount !== skippedCount)
    errors.push('meta: skippedSourceCount does not match source results');

  collector.sourceResults.forEach((result, index) => {
    const label = `meta:sourceResults[${index}]`;
    if (!isNonEmptyString(result.sourceId))
      errors.push(`${label}: missing sourceId`);
    if (!isOneOf(SOURCE_RUN_STATUSES, result.status))
      errors.push(`${label}: invalid status`);
    if (
      result.coverageEligible !== undefined &&
      typeof result.coverageEligible !== 'boolean'
    ) {
      errors.push(`${label}: invalid coverageEligible`);
    }
    if (!isTimestampString(result.checkedAt))
      errors.push(`${label}: invalid checkedAt`);
    if (!Number.isFinite(result.durationMs) || result.durationMs < 0)
      errors.push(`${label}: invalid durationMs`);
    if (
      result.itemCount !== null &&
      (!Number.isInteger(result.itemCount) || result.itemCount < 0)
    ) {
      errors.push(`${label}: invalid itemCount`);
    }
    if (!Number.isInteger(result.candidateCount) || result.candidateCount < 0)
      errors.push(`${label}: invalid candidateCount`);
    if (
      !Number.isInteger(result.newCandidateCount) ||
      result.newCandidateCount < 0
    )
      errors.push(`${label}: invalid newCandidateCount`);
    if (result.status === 'error' && !isNonEmptyString(result.error))
      errors.push(`${label}: failed result requires an error`);
  });

  if (collector.health !== 'healthy') {
    warnings.push(
      `meta: latest collection health is ${collector.health} (${collector.successfulSourceCount}/${collector.dueSourceCount} due sources successful)`,
    );
  }
  return { errors, warnings };
}

export function validateSourceReviews(
  reviews: SourceReview[],
  targets: SourceReviewTargets = { policies: [], timelineEvents: [] },
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const sourceUrls = new Map<string, string>();
  const policyIds = new Set(targets.policies.map((policy) => policy.id));
  const policiesById = new Map(
    targets.policies.map((policy) => [policy.id, policy]),
  );
  const timelineEventsById = new Map(
    targets.timelineEvents.map((event) => [event.id, event]),
  );
  const timelineEventIds = new Set(timelineEventsById.keys());

  reviews.forEach((review, index) => {
    const label = review.id || `sourceReviews[${index}]`;
    if (!isNonEmptyString(review.id)) errors.push(`${label}: missing id`);
    else if (ids.has(review.id)) errors.push(`${label}: duplicate id`);
    else ids.add(review.id);
    if (!isHttpsUrl(review.sourceUrl)) {
      errors.push(`${label}: sourceUrl must be https`);
    } else if (!isAllowedSourceHost(review.sourceUrl)) {
      if (review.status === 'approved' || review.status === 'published') {
        errors.push(
          `${label}: approved or published reviews require an allowed official source`,
        );
      } else {
        warnings.push(
          `${label}: discovery source is not official and cannot be approved without replacement`,
        );
      }
    }
    if (isHttpsUrl(review.sourceUrl)) {
      validateCanonicalSourceUrl(`${label}: sourceUrl`, review.sourceUrl, errors);
      if (
        review.status !== 'rejected' &&
        !review.targetPolicyId &&
        !review.targetTimelineEventId &&
        !review.targetTimelineRevisionHash
      ) {
        const sourceIdentity = sourceUrlIdentity(review.sourceUrl);
        const existing = sourceUrls.get(sourceIdentity);
        if (existing) {
          errors.push(`${label}: duplicate sourceUrl (also on ${existing})`);
        } else {
          sourceUrls.set(sourceIdentity, label);
        }
      }
    }
    if (!isOneOf(SOURCE_REVIEW_ENTRY_KINDS, review.entryKind))
      errors.push(`${label}: invalid entryKind`);
    if (review.targetPolicyId) {
      if (review.entryKind !== 'policy') {
        errors.push(`${label}: targetPolicyId is only valid for policy reviews`);
      }
      if (review.proposedRecord?.id !== review.targetPolicyId) {
        errors.push(
          `${label}: proposed record id must match targetPolicyId`,
        );
      }
      const targetPolicy = policiesById.get(review.targetPolicyId);
      if (!targetPolicy) {
        errors.push(`${label}: targetPolicyId does not match a policy`);
      } else if (review.targetPolicyPreviousSourceUrl) {
        const proposedSourceMatchesReview = sourceUrlsEqual(
          review.proposedRecord?.sourceUrl,
          review.sourceUrl,
        );
        const targetStillUsesPreviousSource =
          sourceUrlsEqual(
            targetPolicy.sourceUrl,
            review.targetPolicyPreviousSourceUrl,
          ) && !sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl);
        const targetUsesPublishedReplacement =
          (review.status === 'approved' || review.status === 'published') &&
          sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl) &&
          !sourceUrlsEqual(
            targetPolicy.sourceUrl,
            review.targetPolicyPreviousSourceUrl,
          );
        if (
          !proposedSourceMatchesReview ||
          (!targetStillUsesPreviousSource && !targetUsesPublishedReplacement)
        ) {
          errors.push(`${label}: invalid target policy source replacement`);
        }
      } else if (!sourceUrlsEqual(targetPolicy.sourceUrl, review.sourceUrl)) {
        errors.push(`${label}: sourceUrl does not match the target policy source`);
      }
      if (!SHA256.test(review.targetPolicyBaseRevisionHash ?? '')) {
        errors.push(
          `${label}: update review requires a target policy base revision hash`,
        );
      }
      if (
        (review.status === 'approved' || review.status === 'published') &&
        !SHA256.test(review.targetPolicyRevisionHash ?? '')
      ) {
        errors.push(
          `${label}: approved update review requires a target policy revision hash`,
        );
      }
      if (
        review.sourceVersionSequence !== undefined &&
        (!Number.isInteger(review.sourceVersionSequence) ||
          review.sourceVersionSequence < 1)
      ) {
        errors.push(`${label}: invalid sourceVersionSequence`);
      }
    } else {
      if (review.targetPolicyPreviousSourceUrl) {
        errors.push(
          `${label}: targetPolicyPreviousSourceUrl requires targetPolicyId`,
        );
      }
      if (review.targetPolicyBaseRevisionHash) {
        errors.push(
          `${label}: targetPolicyBaseRevisionHash requires targetPolicyId`,
        );
      }
      if (review.targetPolicyRevisionHash) {
        errors.push(
          `${label}: targetPolicyRevisionHash requires targetPolicyId`,
        );
      }
    }
    if (review.sourceVersionSequence !== undefined && !review.targetPolicyId) {
      errors.push(`${label}: sourceVersionSequence requires targetPolicyId`);
    }
    if (
      review.targetPolicyBaseRevisionHash &&
      !SHA256.test(review.targetPolicyBaseRevisionHash)
    ) {
      errors.push(`${label}: invalid targetPolicyBaseRevisionHash`);
    }
    if (
      review.targetPolicyRevisionHash &&
      !SHA256.test(review.targetPolicyRevisionHash)
    ) {
      errors.push(`${label}: invalid targetPolicyRevisionHash`);
    }
    if (review.targetTimelineRevisionHash) {
      if (review.entryKind !== 'timeline_event') {
        errors.push(
          `${label}: targetTimelineRevisionHash requires a timeline review`,
        );
      }
      if (!SHA256.test(review.targetTimelineRevisionHash)) {
        errors.push(`${label}: invalid targetTimelineRevisionHash`);
      }
      if (!review.targetTimelineEventId) {
        errors.push(
          `${label}: targetTimelineRevisionHash requires targetTimelineEventId`,
        );
      }
    }
    if (review.targetTimelineEventId) {
      if (review.entryKind !== 'timeline_event') {
        errors.push(
          `${label}: targetTimelineEventId requires a timeline review`,
        );
      }
      if (review.proposedRecord?.id !== review.targetTimelineEventId) {
        errors.push(
          `${label}: proposed record id must match targetTimelineEventId`,
        );
      }
      const targetTimelineEvent = timelineEventsById.get(
        review.targetTimelineEventId,
      );
      if (!targetTimelineEvent) {
        errors.push(
          `${label}: targetTimelineEventId does not match a timeline event`,
        );
      } else if (
        !sourceUrlsEqual(targetTimelineEvent.sourceUrl, review.sourceUrl)
      ) {
        errors.push(
          `${label}: sourceUrl does not match the target timeline event source`,
        );
      }
      if (!review.targetTimelineRevisionHash) {
        errors.push(
          `${label}: targetTimelineEventId requires a target timeline revision hash`,
        );
      }
    }
    if (!isOneOf(SOURCE_REVIEW_STATUSES, review.status))
      errors.push(`${label}: invalid status`);
    if (!isTimestampString(review.discoveredAt))
      errors.push(`${label}: invalid discoveredAt`);
    if (!isTimestampString(review.updatedAt))
      errors.push(`${label}: invalid updatedAt`);
    const rawSourceEvidence = review.sourceEvidence as unknown;
    const sourceEvidence = isRecord(rawSourceEvidence)
      ? (rawSourceEvidence as unknown as SourceEvidence)
      : undefined;
    if (!sourceEvidence || !isNonEmptyString(sourceEvidence.url)) {
      errors.push(`${label}: sourceEvidence requires a non-empty URL`);
    } else {
      if (!sourceUrlsEqual(sourceEvidence.url, review.sourceUrl)) {
        errors.push(`${label}: source evidence URL must match sourceUrl`);
      }
      validateCanonicalSourceUrl(
        `${label}: source evidence URL`,
        sourceEvidence.url,
        errors,
      );
    }
    validateManualExtractionEvidence(
      `${label}: source evidence`,
      sourceEvidence,
      errors,
    );
    validateBrowserCaptureEvidence(
      `${label}: source evidence`,
      sourceEvidence,
      errors,
    );
    validateReviewedDateEvidence(
      `${label}: source evidence`,
      sourceEvidence,
      errors,
    );
    if (
      sourceEvidence?.retrievedAt &&
      !isTimestampString(sourceEvidence.retrievedAt)
    ) {
      errors.push(`${label}: invalid source evidence retrievedAt`);
    }
    if (
      sourceEvidence?.publishedAt &&
      !isCalendarDateString(sourceEvidence.publishedAt)
    ) {
      errors.push(`${label}: invalid source evidence publishedAt`);
    }
    if (
      sourceEvidence?.publishedAtPrecision &&
      !isOneOf(
        DATE_PRECISIONS,
        sourceEvidence.publishedAtPrecision,
      )
    ) {
      errors.push(`${label}: invalid source evidence date precision`);
    }
    if (review.linkedDevelopment) {
      const derivedDevelopmentId = review.id.replace(/^source-review-/, '');
      if (
        !review.linkedDevelopment.id.startsWith('dev-') ||
        (derivedDevelopmentId.startsWith('dev-') &&
          review.linkedDevelopment.id !== derivedDevelopmentId)
      ) {
        errors.push(
          `${label}: linked development id is invalid or does not match the source review id`,
        );
      }
      if (
        !sourceUrlsEqual(review.linkedDevelopment.url, review.sourceUrl) ||
        !sourceUrlsEqual(
          review.linkedDevelopment.verification.source.url,
          review.sourceUrl,
        )
      ) {
        errors.push(
          `${label}: linked development source must match sourceUrl`,
        );
      }
      const developmentReport = validateDevelopments(
        [review.linkedDevelopment],
        policyIds,
        timelineEventIds,
      );
      errors.push(
        ...developmentReport.errors.map(
          (error) => `${label}: linkedDevelopment: ${error}`,
        ),
      );
    }
    if (review.status === 'approved' || review.status === 'published') {
      if (!isTimestampString(review.reviewedAt))
        errors.push(`${label}: approved/published review requires reviewedAt`);
      if (!isNonEmptyString(review.reviewedBy))
        errors.push(`${label}: approved/published review requires reviewedBy`);
      if (occursAfter(review.discoveredAt, review.reviewedAt)) {
        errors.push(`${label}: reviewedAt cannot precede discoveredAt`);
      }
      if (
        occursAfter(review.sourceEvidence?.retrievedAt, review.reviewedAt)
      ) {
        errors.push(
          `${label}: reviewedAt cannot precede source retrieval`,
        );
      }
      if (
        review.entryKind === 'policy' &&
        occursAfter(
          (review.proposedRecord as Policy).createdAt,
          review.reviewedAt,
        )
      ) {
        errors.push(`${label}: reviewedAt cannot precede record creation`);
      }
      if (
        review.proposedRecord?.sourceUrl &&
        !sourceUrlsEqual(review.proposedRecord.sourceUrl, review.sourceUrl)
      ) {
        errors.push(
          `${label}: approved/published proposed record sourceUrl must match sourceUrl`,
        );
      }
      const proposedRecordReport =
        review.entryKind === 'policy'
          ? validatePolicies([review.proposedRecord as Policy])
          : validateTimeline(
              [review.proposedRecord as TimelineEvent],
              policyIds ??
                new Set(
                  (review.proposedRecord as TimelineEvent).relatedPolicyId
                    ? [
                        (review.proposedRecord as TimelineEvent)
                          .relatedPolicyId as string,
                      ]
                    : [],
                ),
            );
      errors.push(
        ...proposedRecordReport.errors.map(
          (error) => `${label}: proposedRecord: ${error}`,
        ),
      );
    }
    if (
      review.status === 'published' &&
      !isTimestampString(review.publishedAt)
    ) {
      errors.push(`${label}: published review requires publishedAt`);
    }
    if (
      review.status === 'published' &&
      occursAfter(review.reviewedAt, review.publishedAt)
    ) {
      errors.push(`${label}: publishedAt cannot precede reviewedAt`);
    }
  });

  return { errors, warnings };
}

export function validateWatchState(state: WatchState): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [url, entry] of Object.entries(state.seen)) {
    const label = `watchState:${url}`;
    if (!isAllowedSourceHost(url))
      errors.push(`${label}: URL is not an allowed official source`);
    if (!isTimestampString(entry.firstSeenAt))
      errors.push(`${label}: invalid firstSeenAt`);
    if (
      entry.status &&
      !isOneOf(
        [
          'pending',
          'awaiting_review',
          'approved',
          'processed',
          'dismissed',
          'failed',
        ],
        entry.status,
      )
    )
      errors.push(`${label}: invalid status`);
    if (
      (entry.status === 'pending' ||
        entry.status === 'awaiting_review' ||
        entry.status === 'approved') &&
      !entry.candidate
    )
      errors.push(`${label}: unresolved entry requires candidate details`);
    if (entry.status === 'failed' && !isNonEmptyString(entry.lastError))
      errors.push(`${label}: failed entry requires lastError`);
    if (entry.attempts !== undefined && (!Number.isInteger(entry.attempts) || entry.attempts < 0))
      errors.push(`${label}: invalid attempts`);
    if (entry.candidate) {
      validateCanonicalSourceUrl(
        `${label}: candidate URL`,
        entry.candidate.url,
        errors,
      );
      const expectedKey = new URL(
        canonicalizeSourceUrl(entry.candidate.url),
      );
      if (entry.candidate.changeFingerprint) {
        expectedKey.hash = `policai-change=${entry.candidate.changeFingerprint}`;
      }
      if (expectedKey.toString() !== url) {
        errors.push(`${label}: state key must match the canonical candidate URL`);
      }
    }
  }

  for (const [sourceId, checkedAt] of Object.entries(
    state.lastCheckedBySource,
  )) {
    if (!isNonEmptyString(sourceId) || !isTimestampString(checkedAt))
      errors.push(`watchState:lastCheckedBySource:${sourceId}: invalid value`);
  }

  for (const [sourceId, snapshot] of Object.entries(state.sourceSnapshots)) {
    if (!SHA256.test(snapshot.contentHash))
      errors.push(`watchState:sourceSnapshots:${sourceId}: invalid contentHash`);
    if (!isTimestampString(snapshot.firstCheckedAt))
      errors.push(`watchState:sourceSnapshots:${sourceId}: invalid firstCheckedAt`);
    if (!isTimestampString(snapshot.lastCheckedAt))
      errors.push(`watchState:sourceSnapshots:${sourceId}: invalid lastCheckedAt`);
    if (
      snapshot.changeCount !== undefined &&
      (!Number.isInteger(snapshot.changeCount) || snapshot.changeCount < 0)
    ) {
      errors.push(`watchState:sourceSnapshots:${sourceId}: invalid changeCount`);
    }
  }

  return { errors, warnings };
}

export function validateWatchSources(
  sources: WatchSource[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const sourceUrls = new Map<string, string>();

  sources.forEach((source) => {
    const label = `watchSources:${source.id}`;
    if (!isNonEmptyString(source.id)) errors.push(`${label}: missing id`);
    else if (ids.has(source.id)) errors.push(`${label}: duplicate id`);
    else ids.add(source.id);
    if (!isAllowedSourceHost(source.url))
      errors.push(`${label}: URL is not an allowed official source`);
    else {
      validateCanonicalSourceUrl(label, source.url, errors);
      const sourceIdentity = sourceUrlIdentity(source.url);
      const existing = sourceUrls.get(sourceIdentity);
      if (existing) {
        errors.push(`${label}: duplicate source URL (also on ${existing})`);
      } else {
        sourceUrls.set(sourceIdentity, label);
      }
    }
    if (!isOneOf(['html-index', 'rss', 'document'], source.kind))
      errors.push(`${label}: invalid kind`);
    if (!isOneOf(['daily', 'weekly'], source.schedule))
      errors.push(`${label}: invalid schedule`);
    if (!isOneOf(['automatic', 'manual'], source.automation))
      errors.push(`${label}: invalid automation mode`);
  });

  return { errors, warnings };
}

export function validateSourceMonitoring(
  monitoring: SourceMonitoringState,
  sources: WatchSource[],
  now: Date = new Date(),
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seen = new Set<string>();

  if (!Array.isArray(monitoring.manualReviews)) {
    return {
      errors: ['sourceMonitoring: manualReviews must be an array'],
      warnings,
    };
  }

  for (const review of monitoring.manualReviews) {
    const label = `sourceMonitoring:${review.sourceId}`;
    if (seen.has(review.sourceId)) {
      errors.push(`${label}: duplicate manual source review`);
      continue;
    }
    seen.add(review.sourceId);
    const source = sourceById.get(review.sourceId);
    if (!source) {
      errors.push(`${label}: unknown source id`);
    } else if (source.automation !== 'manual') {
      errors.push(`${label}: source is not configured for manual review`);
    }
    if (!isOneOf(MANUAL_SOURCE_REVIEW_STATUSES, review.status))
      errors.push(`${label}: invalid status`);
    if (!isTimestampString(review.reviewedAt))
      errors.push(`${label}: invalid reviewedAt`);
    else if (
      new Date(review.reviewedAt).getTime() >
      now.getTime() + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
    ) {
      errors.push(`${label}: reviewedAt cannot be in the future`);
    }
    if (!isNonEmptyString(review.reviewedBy))
      errors.push(`${label}: reviewedBy is required`);
    if (!isNonEmptyString(review.notes) || review.notes.trim().length < 20) {
      errors.push(
        `${label}: substantive inspection notes of at least 20 characters are required`,
      );
    }
    if (!review.evidence || !isNonEmptyString(review.evidence.url)) {
      errors.push(`${label}: source evidence URL is required`);
    }
    if (
      review.evidence?.url &&
      source &&
      !sourceUrlsEqual(review.evidence.url, source.url)
    ) {
      errors.push(`${label}: evidence URL must match the source catalogue`);
    }
    if (review.evidence?.url) {
      validateCanonicalSourceUrl(
        `${label}: evidence URL`,
        review.evidence.url,
        errors,
      );
    }
    if (review.evidence?.finalUrl) {
      if (!isAllowedSourceHost(review.evidence.finalUrl)) {
        errors.push(`${label}: evidence final URL must be an allowed source`);
      } else {
        validateCanonicalSourceUrl(
          `${label}: evidence final URL`,
          review.evidence.finalUrl,
          errors,
        );
      }
    }
    if (
      review.evidence?.retrievedAt &&
      !isTimestampString(review.evidence.retrievedAt)
    ) {
      errors.push(`${label}: invalid evidence retrievedAt`);
    }
    if (
      review.evidence?.contentHash &&
      !SHA256.test(review.evidence.contentHash)
    ) {
      errors.push(`${label}: evidence contentHash must be SHA-256`);
    }
    if (
      review.evidence?.publishedAt &&
      !isCalendarDateString(review.evidence.publishedAt)
    ) {
      errors.push(`${label}: invalid evidence publishedAt`);
    }
    if (
      review.evidence?.publishedAtPrecision &&
      !isOneOf(DATE_PRECISIONS, review.evidence.publishedAtPrecision)
    ) {
      errors.push(`${label}: invalid evidence date precision`);
    }
    if (
      review.evidence?.publishedAtPrecision &&
      !review.evidence.publishedAt
    ) {
      errors.push(`${label}: evidence date precision requires publishedAt`);
    }
    for (const field of ['title', 'publisher', 'contentType'] as const) {
      if (
        review.evidence?.[field] !== undefined &&
        !isNonEmptyString(review.evidence[field])
      ) {
        errors.push(`${label}: evidence ${field} cannot be blank`);
      }
    }
  }

  for (const source of sources.filter(
    (candidate) => candidate.enabled && candidate.automation === 'manual',
  )) {
    if (!seen.has(source.id)) {
      warnings.push(
        `sourceMonitoring:${source.id}: no manual source review has been recorded`,
      );
    }
  }

  return { errors, warnings };
}

export function validatePolicyFrameworkArtifact(
  artifact: Record<string, unknown>,
  policies: Policy[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = 'dta-ai-policy-framework';
  const relatedPolicyId = artifact.relatedPolicyId;
  const relatedPolicy =
    typeof relatedPolicyId === 'string'
      ? policies.find((policy) => policy.id === relatedPolicyId)
      : undefined;

  if (!isNonEmptyString(artifact.id)) errors.push(`${label}: missing id`);
  if (!isNonEmptyString(artifact.title))
    errors.push(`${label}: missing title`);
  if (!isNonEmptyString(artifact.version))
    errors.push(`${label}: missing version`);
  if (!isNonEmptyString(artifact.authority))
    errors.push(`${label}: missing authority`);
  if (!isNonEmptyString(artifact.sourceUrl))
    errors.push(`${label}: missing sourceUrl`);
  if (!isCalendarDateString(artifact.effectiveDate))
    errors.push(`${label}: invalid effectiveDate`);
  if (!isCalendarDateString(artifact.lastUpdated))
    errors.push(`${label}: invalid lastUpdated`);
  if (!Array.isArray(artifact.pillars) || artifact.pillars.length === 0) {
    errors.push(`${label}: pillars must be a non-empty array`);
  } else {
    const pillarIds = new Set<string>();
    artifact.pillars.forEach((candidate, pillarIndex) => {
      const pillarLabel = `${label}: pillars[${pillarIndex}]`;
      if (!isRecord(candidate)) {
        errors.push(`${pillarLabel} must be an object`);
        return;
      }
      for (const field of ['id', 'title', 'icon', 'color', 'description'] as const) {
        if (!isNonEmptyString(candidate[field])) {
          errors.push(`${pillarLabel}.${field} must be a non-empty string`);
        }
      }
      if (isNonEmptyString(candidate.id)) {
        if (pillarIds.has(candidate.id)) {
          errors.push(`${pillarLabel}.id must be unique`);
        }
        pillarIds.add(candidate.id);
      }
      if (
        !Array.isArray(candidate.principles) ||
        candidate.principles.length === 0 ||
        candidate.principles.some((value) => !isNonEmptyString(value))
      ) {
        errors.push(
          `${pillarLabel}.principles must be a non-empty string array`,
        );
      }
      if (
        !Array.isArray(candidate.requirements) ||
        candidate.requirements.length === 0
      ) {
        errors.push(
          `${pillarLabel}.requirements must be a non-empty array`,
        );
      } else {
        const requirementIds = new Set<string>();
        candidate.requirements.forEach((requirement, requirementIndex) => {
          const requirementLabel =
            `${pillarLabel}.requirements[${requirementIndex}]`;
          if (!isRecord(requirement)) {
            errors.push(`${requirementLabel} must be an object`);
            return;
          }
          for (const field of ['id', 'title', 'description'] as const) {
            if (!isNonEmptyString(requirement[field])) {
              errors.push(
                `${requirementLabel}.${field} must be a non-empty string`,
              );
            }
          }
          if (isNonEmptyString(requirement.id)) {
            if (requirementIds.has(requirement.id)) {
              errors.push(`${requirementLabel}.id must be unique within its pillar`);
            }
            requirementIds.add(requirement.id);
          }
          if (
            !isOneOf(
              ['mandatory', 'recommended', 'consideration'] as const,
              requirement.type,
            )
          ) {
            errors.push(`${requirementLabel}.type is invalid`);
          }
          if (
            requirement.deadline !== null &&
            !isNonEmptyString(requirement.deadline)
          ) {
            errors.push(
              `${requirementLabel}.deadline must be null or a non-empty string`,
            );
          }
          if (
            !Array.isArray(requirement.details) ||
            requirement.details.length === 0 ||
            requirement.details.some((value) => !isNonEmptyString(value))
          ) {
            errors.push(
              `${requirementLabel}.details must be a non-empty string array`,
            );
          }
        });
      }
    });
  }
  if (!Array.isArray(artifact.policyAims) || artifact.policyAims.length === 0) {
    errors.push(`${label}: policyAims must be a non-empty array`);
  } else {
    const aimIds = new Set<string>();
    artifact.policyAims.forEach((candidate, aimIndex) => {
      const aimLabel = `${label}: policyAims[${aimIndex}]`;
      if (!isRecord(candidate)) {
        errors.push(`${aimLabel} must be an object`);
        return;
      }
      for (const field of ['id', 'title', 'icon', 'color', 'description'] as const) {
        if (!isNonEmptyString(candidate[field])) {
          errors.push(`${aimLabel}.${field} must be a non-empty string`);
        }
      }
      if (isNonEmptyString(candidate.id)) {
        if (aimIds.has(candidate.id)) errors.push(`${aimLabel}.id must be unique`);
        aimIds.add(candidate.id);
      }
      if (
        !Array.isArray(candidate.outcomes) ||
        candidate.outcomes.length === 0 ||
        candidate.outcomes.some((value) => !isNonEmptyString(value))
      ) {
        errors.push(`${aimLabel}.outcomes must be a non-empty string array`);
      }
    });
  }
  if (
    !Array.isArray(artifact.inScopeCriteria) ||
    artifact.inScopeCriteria.length === 0
  ) {
    errors.push(`${label}: inScopeCriteria must be a non-empty array`);
  } else {
    const criteriaIds = new Set<string>();
    artifact.inScopeCriteria.forEach((candidate, criteriaIndex) => {
      const criteriaLabel = `${label}: inScopeCriteria[${criteriaIndex}]`;
      if (!isRecord(candidate)) {
        errors.push(`${criteriaLabel} must be an object`);
        return;
      }
      if (!isNonEmptyString(candidate.id)) {
        errors.push(`${criteriaLabel}.id must be a non-empty string`);
      } else {
        if (criteriaIds.has(candidate.id)) {
          errors.push(`${criteriaLabel}.id must be unique`);
        }
        criteriaIds.add(candidate.id);
      }
      if (!isNonEmptyString(candidate.description)) {
        errors.push(`${criteriaLabel}.description must be a non-empty string`);
      }
      if (
        !Array.isArray(candidate.applicableTo) ||
        candidate.applicableTo.length === 0 ||
        candidate.applicableTo.some((value) => !isNonEmptyString(value))
      ) {
        errors.push(
          `${criteriaLabel}.applicableTo must be a non-empty string array`,
        );
      }
    });
  }
  if (
    !Array.isArray(artifact.riskAreas) ||
    artifact.riskAreas.length === 0 ||
    artifact.riskAreas.some((value) => !isNonEmptyString(value))
  ) {
    errors.push(`${label}: riskAreas must be a non-empty string array`);
  }
  if (!relatedPolicy) {
    errors.push(`${label}: relatedPolicyId does not match a policy`);
  } else {
    if (artifact.title !== relatedPolicy.title)
      errors.push(`${label}: title must match the related policy`);
    if (artifact.sourceUrl !== relatedPolicy.sourceUrl)
      errors.push(`${label}: sourceUrl must match the related policy`);
    if (
      dateOnly(artifact.effectiveDate as string) !==
      dateOnly(relatedPolicy.effectiveDate)
    ) {
      errors.push(`${label}: effectiveDate must match the related policy`);
    }
    const artifactVerification =
      artifact.verification as RecordVerification | undefined;
    const artifactCheckedAt = new Date(
      artifactVerification?.checkedAt ?? '',
    ).getTime();
    const policyCheckedAt = new Date(
      relatedPolicy.verification.checkedAt ?? '',
    ).getTime();
    if (
      Number.isFinite(artifactCheckedAt) &&
      Number.isFinite(policyCheckedAt) &&
      artifactCheckedAt < policyCheckedAt
    ) {
      errors.push(
        `${label}: verification must not predate the related policy verification`,
      );
    }
    const artifactHash = artifactVerification?.source?.contentHash;
    const policyHash = relatedPolicy.verification.source.contentHash;
    if (artifactHash && policyHash && artifactHash !== policyHash) {
      errors.push(
        `${label}: verification contentHash must match the related policy`,
      );
    }
  }

  const verificationReport = validateVerification(
    label,
    String(artifact.sourceUrl ?? ''),
    artifact.verification as RecordVerification | undefined,
  );
  errors.push(...verificationReport.errors);
  warnings.push(...verificationReport.warnings);
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
