import {
  COLLECTION_HEALTH_STATUSES,
  COURT_REQUIREMENT_MODALITIES,
  COURT_REQUIREMENT_STATUSES,
  DATE_PRECISIONS,
  DEADLINE_DATE_TYPES,
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
  type Article,
  type CollectionMeta,
  type CourtRequirement,
  type Development,
  type Policy,
  type RecordVerification,
  type SourceEvidence,
  type SourceMonitoringState,
  type SourceReview,
  type TimelineEvent,
} from '@/types';
import {
  citationState,
  type CitationState,
  parseArticle,
  type ArticleSource,
} from '@/lib/articles';
import { registerChartErrors } from '@/lib/article-figures';
import {
  validateArticleImages,
  type ArticleImageFiles,
} from '@/lib/article-images';
import type { WatchState } from '@/lib/pipeline/collect';
import {
  isHostKey,
  isRobotsRuleList,
  isStoredSitemapList,
} from '@/lib/pipeline/host-gate';
import { hostOf } from '@/lib/pipeline/host';
import { refusedHosts, type WatchSource } from '@/lib/pipeline/sources';
import { parseBodies, type Body } from '@/lib/watch-coverage/bodies';
import { isFailureClass, publicFailureUrl } from '@/lib/pipeline/failure';
import { identityExceptionState } from '@/lib/pipeline/identity';
import { isValidCalendarDate } from '@/lib/calendar-date';
import { VERIFICATION_CLOCK_SKEW_TOLERANCE_MS } from '@/lib/verification';
import {
  MAX_THEMES_PER_RECORD,
  MIN_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
  THEMES,
  formatThemeMessageLabel,
  formatThemeMessageValue,
  isThemeId,
} from '@/lib/themes';
export { isAllowedSourceHost } from '@/lib/source-url';
import {
  canonicalizeSourceUrl,
  isAllowedSourceHost,
  isSafePublicHttpsUrl,
  parseSourceUrl,
  sourceIdentityUrls,
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

export function dateEvidenceMatches(
  evidence: { date?: string; precision?: string } | undefined,
  date: Date | string,
  precision: string,
): boolean {
  return evidence?.date === dateOnly(date) && evidence.precision === precision;
}

function sourceBacksRecordDate(
  source: SourceEvidence | undefined,
  date: Date | string,
  precision: string,
  allowPublishedMetadata: boolean,
): boolean {
  return Boolean(
    source &&
      SHA256.test(source.contentHash ?? '') &&
      ((allowPublishedMetadata &&
        dateEvidenceMatches(
          { date: source.publishedAt, precision: source.publishedAtPrecision },
          date,
          precision,
        )) ||
        dateEvidenceMatches(source.reviewedDate, date, precision)),
  );
}

function proposedDateEvidenceErrors(policy: Policy): string[] {
  if (!Array.isArray(policy.dates)) return [];
  const errors: string[] = [];
  policy.dates.forEach((candidateDate, index) => {
    if (
      !isRecord(candidateDate) ||
      !isCalendarDateString(candidateDate.date) ||
      !isOneOf(DATE_PRECISIONS, candidateDate.precision)
    ) {
      return;
    }
    const source = isRecord(candidateDate.source)
      ? (candidateDate.source as unknown as SourceEvidence)
      : undefined;
    if (
      candidateDate.primary === true &&
      !sourceBacksRecordDate(
        source,
        candidateDate.date,
        candidateDate.precision,
        candidateDate.type === 'published',
      )
    ) {
      errors.push(
        'primary date requires matching source publication metadata or reviewed date evidence',
      );
    }
    if (
      source?.reviewedDate &&
      !dateEvidenceMatches(
        source.reviewedDate,
        candidateDate.date,
        candidateDate.precision,
      )
    ) {
      errors.push(
        `dates[${index}] reviewedDate must match the date and precision`,
      );
    }
  });
  return errors;
}

/**
 * Count verified records whose secondary (non-primary) structured dates lack
 * the same per-entry evidence the primary gate requires. Secondary dates are
 * not blocked by this count — the budget ratchet is the gate, so historical
 * records stay valid while any growth in unevidenced dates fails validation.
 *
 * A date counts as evidenced when its source carries a SHA-256 fingerprint and
 * either matching publication metadata (`publishedAt` equal to the date; the
 * optional `publishedAtPrecision` must match the structured precision when it
 * is present) or a matching `reviewedDate` record. Malformed dates are
 * reported by the structural gates and are not counted here.
 */
export function countUnsubstantiatedSecondaryDates(
  policies: Policy[],
): Array<{ policyId: string; dateIndex: number }> {
  const unevidenced: Array<{ policyId: string; dateIndex: number }> = [];
  policies.forEach((policy) => {
    if (!isRecord(policy)) return;
    // SAFETY: isRecord establishes the object boundary; fields are read below.
    if (policy.verification?.status !== 'verified') return;
    const policyId = isNonEmptyString(policy.id)
      ? policy.id
      : `policies[${unevidenced.length}]`;
    (policy.dates ?? []).forEach((candidateDate, dateIndex) => {
      if (!isRecord(candidateDate)) return;
      // SAFETY: isRecord establishes the object boundary; fields are read below.
      if (candidateDate.primary === true) return;
      if (
        !isCalendarDateString(candidateDate.date) ||
        !isOneOf(DATE_PRECISIONS, candidateDate.precision)
      ) {
        return; // Malformed dates are reported by the structural gate.
      }
      // SAFETY: isRecord establishes the object boundary; fields are read below.
      const source = isRecord(candidateDate.source)
        ? (candidateDate.source as unknown as SourceEvidence)
        : undefined;
      const normalizedDate = dateOnly(candidateDate.date);
      const publicationBacked = Boolean(
        source &&
          source.publishedAt === normalizedDate &&
          (!source.publishedAtPrecision ||
            source.publishedAtPrecision === candidateDate.precision),
      );
      const reviewedBacked = Boolean(
        source?.reviewedDate?.date === normalizedDate &&
          source.reviewedDate.precision === candidateDate.precision,
      );
      if (
        !(
          SHA256.test(source?.contentHash ?? '') &&
          (publicationBacked || reviewedBacked)
        )
      ) {
        unevidenced.push({ policyId, dateIndex });
      }
    });
  });
  return unevidenced;
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
  // SAFETY: isRecord establishes the object boundary; fields are validated below.
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

export function validatePolicies(
  policies: Policy[],
  registerIds: ReadonlySet<string> = new Set(),
): ValidationReport {
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
    // SAFETY: isRecord establishes the object boundary; fields are validated below.
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
        // The primary date backs effectiveDate and the register key date; a
        // deadline belongs to the instrument but is not its own date.
        if (date.primary === true && isOneOf(DEADLINE_DATE_TYPES, date.type)) {
          errors.push(`${dateLabel}: a deadline date cannot be the primary date`);
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
            // SAFETY: isRecord establishes the object boundary; fields are validated below.
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
        // SAFETY: isRecord establishes the object boundary; source fields were validated above.
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
    if (policy.status === 'superseded' && !policy.supersededBy) {
      errors.push(`${label}: superseded status requires supersededBy`);
    }
    if (policy.supersededBy && policy.status !== 'superseded') {
      errors.push(
        `${label}: supersededBy requires superseded status, not "${policy.status}"`,
      );
    }
    if (policy.supersededBy && policy.supersededBy === policy.id) {
      errors.push(`${label}: supersededBy cannot reference the policy itself`);
    }
  });

  policies.forEach((policy) => {
    if (!isRecord(policy) || !isNonEmptyString(policy.supersededBy)) return;
    if (!ids.has(policy.supersededBy) && !registerIds.has(policy.supersededBy)) {
      errors.push(
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

function recordThemeErrors(label: string, themes: unknown): string[] {
  if (!Array.isArray(themes)) {
    return [`${label}: themes must be an array of theme ids`];
  }
  const errors: string[] = [];
  if (
    themes.length < MIN_THEMES_PER_RECORD ||
    themes.length > MAX_THEMES_PER_RECORD
  ) {
    errors.push(
      `${label}: themes must list ${MIN_THEMES_PER_RECORD} to ${MAX_THEMES_PER_RECORD} themes, not ${themes.length}`,
    );
  }
  const seen = new Set<unknown>();
  for (const theme of themes) {
    if (typeof theme !== 'string') {
      errors.push(
        `${label}: theme entries must be theme id strings, not ${typeof theme} ${formatThemeMessageValue(theme)}`,
      );
    } else if (!isThemeId(theme)) {
      errors.push(`${label}: unknown theme ${formatThemeMessageValue(theme)}`);
    } else if (seen.has(theme)) {
      errors.push(`${label}: duplicate theme ${formatThemeMessageValue(theme)}`);
    }
    seen.add(theme);
  }
  return errors;
}

export function validatePolicyThemes(policies: readonly Policy[]): ValidationReport {
  const errors = policies.flatMap((policy, index) => {
    const rawLabel = isNonEmptyString(policy.id)
      ? policy.id
      : `policies[${index}]`;
    const label = formatThemeMessageLabel(rawLabel);
    const recordErrors = recordThemeErrors(label, policy.themes);
    if (recordErrors.length === 0) return [];
    const last = recordErrors.length - 1;
    recordErrors[last] +=
      `; valid theme ids are ${THEMES.map(({ key }) => key).join(', ')}`;
    return recordErrors;
  });
  return { errors, warnings: [] };
}

function countThemeUse(policies: readonly Policy[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const policy of policies) {
    if (policy.status === 'trashed' || !Array.isArray(policy.themes)) continue;
    for (const theme of new Set(policy.themes)) {
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return counts;
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function validateThemeCoverage(
  policies: readonly Policy[],
  publicPolicies: readonly Policy[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const registerUse = countThemeUse(policies);
  const publicUse = countThemeUse(publicPolicies);
  for (const { key, label } of THEMES) {
    const registerCount = registerUse.get(key) ?? 0;
    const publicCount = publicUse.get(key) ?? 0;
    if (registerCount < MIN_RECORDS_PER_THEME) {
      errors.push(
        `themes: "${key}" (${label}) is used by ${countOf(registerCount, 'register record')}; a listed theme needs at least ${MIN_RECORDS_PER_THEME}`,
      );
    } else if (publicCount < MIN_RECORDS_PER_THEME) {
      warnings.push(
        `themes: "${key}" (${label}) is on ${countOf(publicCount, 'public record')}; fewer than ${MIN_RECORDS_PER_THEME} until enough of those records are public again`,
      );
    }
  }
  return { errors, warnings };
}

export function validateCourtRequirements(
  requirements: CourtRequirement[],
  policies: readonly Policy[],
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  let pendingCount = 0;

  requirements.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      errors.push(`court-requirements[${index}]: requirement must be an object`);
      return;
    }
    const requirement = candidate as unknown as CourtRequirement;
    const label = isNonEmptyString(requirement.id)
      ? requirement.id
      : `court-requirements[${index}]`;
    const requirementStatus = isRecord(requirement.verification)
      ? requirement.verification.status
      : undefined;

    if (!isNonEmptyString(requirement.id)) errors.push(`${label}: missing id`);
    else if (ids.has(requirement.id)) errors.push(`${label}: duplicate id`);
    else ids.add(requirement.id);

    const policy = policiesById.get(requirement.policyId);
    if (!isNonEmptyString(requirement.policyId) || !policy) {
      errors.push(`${label}: policyId must match a policy record`);
    } else if (policy.type !== 'practice_note') {
      errors.push(`${label}: policyId must reference a court practice note`);
    }
    if (!isNonEmptyString(requirement.actor)) errors.push(`${label}: missing actor`);
    if (!isOneOf(COURT_REQUIREMENT_MODALITIES, requirement.modality)) {
      errors.push(`${label}: invalid modality`);
    }
    if (!isNonEmptyString(requirement.action)) errors.push(`${label}: missing action`);
    for (const field of ['conditions', 'exceptions', 'topics'] as const) {
      if (
        !Array.isArray(requirement[field]) ||
        requirement[field].some((value) => !isNonEmptyString(value))
      ) {
        errors.push(`${label}: ${field} must contain non-empty strings`);
      }
    }

    if (!isRecord(requirement.source)) {
      errors.push(`${label}: source evidence must be an object`);
    } else {
      if (!isAllowedSourceHost(requirement.source.url)) {
        errors.push(`${label}: source URL must be an allowed official host`);
      }
      const policySourceUrls = policy
        ? [
            policy.sourceUrl,
            policy.verification?.source?.url,
            policy.verification?.source?.finalUrl,
          ].filter(isNonEmptyString)
        : [];
      if (
        policySourceUrls.length > 0 &&
        !policySourceUrls.some((url) => sourceUrlsEqual(url, requirement.source.url))
      ) {
        if (requirementStatus === 'verified') {
          errors.push(`${label}: source URL must match the policy source evidence`);
        } else if (requirementStatus === 'pending_review') {
          warnings.push(`${label}: source URL differs from the current policy evidence`);
        }
      }
      if (!SHA256.test(requirement.source.contentHash)) {
        errors.push(`${label}: source contentHash must be SHA-256`);
      } else if (
        policy?.verification?.source?.contentHash !== requirement.source.contentHash
      ) {
        if (requirementStatus === 'verified') {
          errors.push(`${label}: source contentHash must match the verified policy source`);
        } else if (requirementStatus === 'pending_review') {
          warnings.push(`${label}: source contentHash differs from the current policy evidence`);
        }
      }
      if (!isNonEmptyString(requirement.source.locator)) {
        errors.push(`${label}: source locator is required`);
      }
      if (!isNonEmptyString(requirement.source.quote)) {
        errors.push(`${label}: exact source quote is required`);
      }
    }

    if (!isRecord(requirement.extraction)) {
      errors.push(`${label}: extraction evidence must be an object`);
    } else {
      if (!isOneOf(['ai', 'manual'], requirement.extraction.method)) {
        errors.push(`${label}: invalid extraction method`);
      }
      if (!isTimestampString(requirement.extraction.extractedAt)) {
        errors.push(`${label}: invalid extraction timestamp`);
      }
      if (!isNonEmptyString(requirement.extraction.extractedBy)) {
        errors.push(`${label}: extractor identity is required`);
      }
    }

    if (!isRecord(requirement.verification)) {
      errors.push(`${label}: verification must be an object`);
      return;
    }
    if (!isOneOf(COURT_REQUIREMENT_STATUSES, requirement.verification.status)) {
      errors.push(`${label}: invalid verification status`);
      return;
    }
    if (requirement.verification.status === 'pending_review') {
      pendingCount++;
      return;
    }
    if (!isTimestampString(requirement.verification.reviewedAt)) {
      errors.push(`${label}: reviewed requirement needs a review timestamp`);
    }
    if (!isNonEmptyString(requirement.verification.reviewedBy)) {
      errors.push(`${label}: reviewed requirement needs a reviewer identity`);
    }
  });

  if (pendingCount > 0) {
    warnings.push(
      `court-requirements: ${pendingCount} extracted requirements await editorial review and are withheld from public reads`,
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
    // SAFETY: isRecord establishes the object boundary; fields are validated below.
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
  if (meta.lastUsableAt && !isTimestampString(meta.lastUsableAt))
    errors.push('meta: invalid lastUsableAt');
  if (meta.lastReviewedAt && !isTimestampString(meta.lastReviewedAt))
    errors.push('meta: invalid lastReviewedAt');
  const runOrder = [
    ['lastHealthyAt', meta.lastHealthyAt],
    ['lastUsableAt', meta.lastUsableAt],
    ['lastCollectedAt', meta.lastCollectedAt],
  ] as const;
  runOrder.forEach(([earlierName, earlier], index) => {
    for (const [laterName, later] of runOrder.slice(index + 1)) {
      if (
        isTimestampString(earlier) &&
        isTimestampString(later) &&
        Date.parse(earlier) > Date.parse(later)
      )
        errors.push(`meta: ${earlierName} is after ${laterName}`);
    }
  });
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
  if (
    collector.robotsUnverified !== undefined &&
    !(
      Array.isArray(collector.robotsUnverified) &&
      collector.robotsUnverified.every((host) => typeof host === 'string' && isHostKey(host))
    )
  )
    errors.push('meta: invalid collector robotsUnverified');

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
    if (result.failureClass !== undefined && !isFailureClass(result.failureClass))
      errors.push(`${label}: invalid failureClass`);
    if (
      result.failedUrl !== undefined &&
      !(isNonEmptyString(result.failedUrl) && publicFailureUrl(result.failedUrl) === result.failedUrl)
    )
      errors.push(`${label}: invalid failedUrl`);
    if (
      result.status !== 'error' &&
      (result.failureClass !== undefined || result.failedUrl !== undefined)
    )
      errors.push(`${label}: failure fields require a failed result`);
    else if ((result.failureClass === undefined) !== (result.failedUrl === undefined))
      errors.push(`${label}: failureClass and failedUrl must appear together`);
    if (result.skippedLinked !== undefined) {
      if (!Array.isArray(result.skippedLinked) || result.skippedLinked.length === 0)
        errors.push(`${label}: skippedLinked must be a non-empty array`);
      else
        result.skippedLinked.forEach((skipped, index) => {
          if (
            !isNonEmptyString(skipped?.url) ||
            !skipped.url.startsWith('https://') ||
            publicFailureUrl(skipped.url) !== skipped.url
          )
            errors.push(`${label}: skippedLinked[${index}] has an invalid url`);
          if (!isNonEmptyString(skipped?.decidedBy))
            errors.push(`${label}: skippedLinked[${index}] requires decidedBy`);
        });
    }
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
        const supersededByPublishedSourceReplacement =
          review.status === 'published' &&
          reviews.some(
            (candidate) =>
              candidate.id !== review.id &&
              candidate.status === 'published' &&
              candidate.targetPolicyId === review.targetPolicyId &&
              typeof candidate.targetPolicyPreviousSourceUrl === 'string' &&
              sourceUrlsEqual(
                candidate.targetPolicyPreviousSourceUrl,
                review.sourceUrl,
              ) &&
              sourceUrlsEqual(candidate.sourceUrl, targetPolicy.sourceUrl),
          );
        if (!supersededByPublishedSourceReplacement) {
          errors.push(`${label}: sourceUrl does not match the target policy source`);
        }
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
    if (
      review.sourceVersionSequence !== undefined &&
      (!Number.isInteger(review.sourceVersionSequence) ||
        review.sourceVersionSequence < 1)
    ) {
      errors.push(`${label}: invalid sourceVersionSequence`);
    }
    if (
      review.sourceVersionSequence !== undefined &&
      !review.targetPolicyId &&
      !review.targetTimelineEventId
    ) {
      errors.push(
        `${label}: sourceVersionSequence requires targetPolicyId or targetTimelineEventId`,
      );
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
    if (review.targetTimelineEventPreviousSourceUrl && !review.targetTimelineEventId) {
      errors.push(`${label}: targetTimelineEventPreviousSourceUrl requires targetTimelineEventId`);
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
      } else if (review.targetTimelineEventPreviousSourceUrl) {
        const proposedSourceMatchesReview = sourceUrlsEqual(
          review.proposedRecord?.sourceUrl, review.sourceUrl,
        );
        const targetStillUsesPreviousSource = sourceUrlsEqual(
          targetTimelineEvent.sourceUrl, review.targetTimelineEventPreviousSourceUrl,
        ) && !sourceUrlsEqual(targetTimelineEvent.sourceUrl, review.sourceUrl);
        const targetUsesPublishedReplacement =
          (review.status === 'approved' || review.status === 'published') &&
          sourceUrlsEqual(targetTimelineEvent.sourceUrl, review.sourceUrl) &&
          !sourceUrlsEqual(targetTimelineEvent.sourceUrl, review.targetTimelineEventPreviousSourceUrl);
        if (!proposedSourceMatchesReview ||
          (!targetStillUsesPreviousSource && !targetUsesPublishedReplacement)) {
          errors.push(`${label}: invalid target timeline event source replacement`);
        }
      } else if (!sourceUrlsEqual(targetTimelineEvent.sourceUrl, review.sourceUrl)) {
        // Unlike the policy rule, retain rejected old-URL history because timeline publication rejects older unresolved reviews.
        const supersededByPublishedSourceReplacement =
          (review.status === 'published' || review.status === 'rejected') &&
          reviews.some((candidate) =>
            candidate.id !== review.id &&
            candidate.status === 'published' &&
            candidate.entryKind === 'timeline_event' &&
            candidate.targetTimelineEventId === review.targetTimelineEventId &&
            typeof candidate.targetTimelineEventPreviousSourceUrl === 'string' &&
            sourceUrlsEqual(candidate.targetTimelineEventPreviousSourceUrl, review.sourceUrl) &&
            sourceUrlsEqual(candidate.sourceUrl, targetTimelineEvent.sourceUrl),
          );
        if (!supersededByPublishedSourceReplacement) {
          errors.push(`${label}: sourceUrl does not match the target timeline event source`);
        }
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
    const targetRecord = review.targetPolicyId
      ? policiesById.get(review.targetPolicyId)
      : review.targetTimelineEventId
        ? timelineEventsById.get(review.targetTimelineEventId)
        : undefined;
    const reviewSourceUrls =
      targetRecord && sourceUrlsEqual(targetRecord.sourceUrl, review.sourceUrl)
        ? sourceIdentityUrls(
            targetRecord.sourceUrl,
            targetRecord.verification?.source,
          )
        : [sourceUrlIdentity(review.sourceUrl)];
    const identifiesReviewSource = (url: string) =>
      reviewSourceUrls.includes(sourceUrlIdentity(url));
    const rawSourceEvidence = review.sourceEvidence as unknown;
    // SAFETY: isRecord establishes the object boundary; fields are validated below.
    const sourceEvidence = isRecord(rawSourceEvidence)
      ? (rawSourceEvidence as unknown as SourceEvidence)
      : undefined;
    if (!sourceEvidence || !isNonEmptyString(sourceEvidence.url)) {
      errors.push(`${label}: sourceEvidence requires a non-empty URL`);
    } else {
      if (!identifiesReviewSource(sourceEvidence.url)) {
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
        !identifiesReviewSource(review.linkedDevelopment.url) ||
        !identifiesReviewSource(
          review.linkedDevelopment.verification.source.url,
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
          ? validatePolicies([review.proposedRecord as Policy], policyIds)
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
      review.status === 'pending_review' &&
      review.entryKind === 'policy' &&
      isRecord(review.proposedRecord)
    ) {
      errors.push(
        ...proposedDateEvidenceErrors(review.proposedRecord as Policy).map(
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
      const expectedKey = parseSourceUrl(
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

  for (const [host, record] of Object.entries(state.hosts ?? {})) {
    const label = `watchState:hosts:${host}`;
    if (!isHostKey(host)) errors.push(`${label}: invalid host`);
    if (!isTimestampString(record.seenAt)) errors.push(`${label}: invalid seenAt`);
    const robots = record.robots;
    if (robots !== null) {
      if (!isTimestampString(robots.fetchedAt)) errors.push(`${label}: invalid robots.fetchedAt`);
      if (!isOneOf(['parsed', 'absent', 'unreachable'], robots.status))
        errors.push(`${label}: invalid robots.status`);
      for (const field of ['allow', 'disallow'] as const) {
        if (!isRobotsRuleList(robots[field])) errors.push(`${label}: invalid robots.${field}`);
      }
      if (
        robots.crawlDelaySec !== null &&
        !(typeof robots.crawlDelaySec === 'number' && Number.isFinite(robots.crawlDelaySec) && robots.crawlDelaySec >= 0)
      )
        errors.push(`${label}: invalid robots.crawlDelaySec`);
      if (!isStoredSitemapList(robots.sitemaps)) errors.push(`${label}: invalid robots.sitemaps`);
    }
    if (record.backoffUntil !== null && !isTimestampString(record.backoffUntil))
      errors.push(`${label}: invalid backoffUntil`);
    if (record.backoffStatus !== null && record.backoffStatus !== 429 && record.backoffStatus !== 503)
      errors.push(`${label}: invalid backoffStatus`);
    if (!Number.isInteger(record.backoffCount) || record.backoffCount < 0)
      errors.push(`${label}: invalid backoffCount`);
    if (!Number.isInteger(record.robotsUnreachableRuns) || record.robotsUnreachableRuns < 0)
      errors.push(`${label}: invalid robotsUnreachableRuns`);
  }

  for (const [sourceId, record] of Object.entries(state.sourceHealth ?? {})) {
    const label = `watchState:sourceHealth:${sourceId}`;
    if (!isNonEmptyString(sourceId)) errors.push(`${label}: empty source id`);
    if (record.lastSuccessAt !== null && !isTimestampString(record.lastSuccessAt))
      errors.push(`${label}: invalid lastSuccessAt`);
    if (!Number.isInteger(record.consecutiveFailures) || record.consecutiveFailures < 0)
      errors.push(`${label}: invalid consecutiveFailures`);
    const failing = record.consecutiveFailures > 0;
    if (failing ? !isTimestampString(record.firstFailureAt) : record.firstFailureAt !== null)
      errors.push(`${label}: firstFailureAt must be set exactly while failing`);
    if (failing ? !isFailureClass(record.lastFailureClass) : record.lastFailureClass !== null)
      errors.push(`${label}: lastFailureClass must be set exactly while failing`);
    if (
      failing &&
      isTimestampString(record.lastSuccessAt) &&
      isTimestampString(record.firstFailureAt) &&
      Date.parse(record.lastSuccessAt) >= Date.parse(record.firstFailureAt)
    )
      errors.push(`${label}: lastSuccessAt must precede firstFailureAt`);
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
  now: Date = new Date(),
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
    validateAutomation(label, source.automation, now, errors);
    if (source.admittedAt !== undefined && !isCalendarDateString(source.admittedAt))
      errors.push(`${label}: admittedAt must be YYYY-MM-DD`);
    if (
      source.minimumItemCount !== undefined &&
      (!Number.isInteger(source.minimumItemCount) ||
        source.minimumItemCount < 0)
    ) {
      errors.push(`${label}: minimumItemCount must be a non-negative integer`);
    }
    if (
      source.minimumItemCount !== undefined &&
      source.kind === 'document'
    ) {
      errors.push(`${label}: document sources cannot set minimumItemCount`);
    }
    // E24: a warning, not an error, so an expiry surfaces without failing CI.
    if (identityExceptionState(source, now) === 'expired') {
      warnings.push(
        `${label}: identity exception expired on ${source.identityException?.until}; the collector now presents its declared identity, so remove the exception or move the source to manual tracking`,
      );
    }
  });

  const refused = refusedHosts(sources);
  for (const source of sources) {
    if (source.automation !== 'automatic' || !URL.canParse(source.url)) continue;
    const decidedBy = refused.get(hostOf(new URL(source.url)));
    if (decidedBy) {
      errors.push(
        `watchSources:${source.id}: automatic source on ${hostOf(new URL(source.url))}, which ${decidedBy} records as refusing the declared identity; move it to manual tracking or reverse that decision`,
      );
    }
  }

  return { errors, warnings };
}

const MANUAL_BECAUSE = [
  'identity_refused',
  'bot_blocked',
  'robots_disallowed',
  'not_found',
] as const;

function validateAutomation(
  label: string,
  automation: unknown,
  now: Date,
  errors: string[],
): void {
  if (automation === 'automatic') return;
  if (!isRecord(automation) || automation.mode !== 'manual') {
    errors.push(`${label}: automation must be 'automatic' or a manual decision`);
    return;
  }
  if (!isOneOf(MANUAL_BECAUSE, automation.because))
    errors.push(`${label}: invalid manual because`);
  if (!isOneOf(['manual', 'await_allowlist'], automation.decision))
    errors.push(`${label}: invalid manual decision`);
  if (!isCalendarDateString(automation.since))
    errors.push(`${label}: manual decision since must be YYYY-MM-DD`);
  else if (
    new Date(`${automation.since}T00:00:00Z`).getTime() >
    now.getTime() + VERIFICATION_CLOCK_SKEW_TOLERANCE_MS
  )
    errors.push(`${label}: manual decision since cannot be in the future`);
  if (!isNonEmptyString(automation.decidedBy))
    errors.push(`${label}: manual decision needs decidedBy`);
  if (!isNonEmptyString(automation.evidence) || automation.evidence.trim().length < 20)
    errors.push(`${label}: manual decision needs evidence of at least 20 characters`);
}

/**
 * Cross-file rules for `data/bodies.json`: every source and directory record
 * resolves to a body in its jurisdiction, and a source's host belongs to its
 * body. A directory record names its body, or a part of it after " - ".
 */
export function validateBodies(
  raw: unknown,
  sources: readonly WatchSource[],
  directories: Readonly<Record<string, readonly Agency[]>>,
): ValidationReport {
  const errors: string[] = [];
  let bodies: Body[];
  try {
    bodies = parseBodies(raw);
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], warnings: [] };
  }
  const byId = new Map<string, Body>(bodies.map((body) => [body.id, body]));
  for (const jurisdiction of JURISDICTIONS) {
    if (!bodies.some((body) => body.jurisdiction === jurisdiction && body.tier === 'A'))
      errors.push(`bodies: no tier A body for ${jurisdiction}`);
  }
  for (const body of bodies) {
    if (new Set(body.hosts).size !== body.hosts.length)
      errors.push(`bodies:${body.id}: duplicate host`);
  }

  const resolve = (label: string, bodyId: string, jurisdiction: string, url: string) => {
    const body = byId.get(bodyId);
    if (!body) {
      errors.push(`${label}: unknown bodyId ${bodyId}`);
      return undefined;
    }
    if (body.jurisdiction !== jurisdiction)
      errors.push(`${label}: jurisdiction ${jurisdiction} differs from body ${body.id} (${body.jurisdiction})`);
    if (URL.canParse(url)) {
      const host = hostOf(new URL(url));
      if (!body.hosts.includes(host))
        errors.push(`${label}: host ${host} is not one of body ${body.id}'s hosts`);
    }
    return body;
  };

  for (const source of sources) {
    resolve(`watchSources:${source.id}`, source.bodyId, source.jurisdiction, source.url);
  }
  for (const [file, records] of Object.entries(directories)) {
    for (const record of records) {
      const label = `${file}:${record.id}`;
      const body = resolve(label, record.bodyId, record.jurisdiction, record.website);
      if (body && record.name !== body.name && !record.name.startsWith(`${body.name} - `))
        errors.push(`${label}: name "${record.name}" differs from body ${body.id} ("${body.name}")`);
    }
  }
  return { errors, warnings: [] };
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
    } else if (source.automation === 'automatic') {
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
    (candidate) => candidate.enabled && candidate.automation !== 'automatic',
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

export interface ArticleValidationContext {
  policies: readonly Policy[];
  publicPolicies: readonly Policy[];
  images: ArticleImageFiles;
}

function articleTransitionErrors(
  label: string,
  previous: Article,
  next: Article | undefined,
): string[] {
  if (previous.status === 'draft') return [];
  if (!next) {
    return [`${label}: a ${previous.status} piece cannot be deleted; withdraw it instead`];
  }
  const errors: string[] = [];
  if (next.status === 'draft') {
    errors.push(`${label}: a ${previous.status} piece cannot return to draft`);
  }
  if (previous.status === 'withdrawn' && next.status !== 'withdrawn') {
    errors.push(`${label}: a withdrawn piece stays withdrawn`);
  }
  if (next.status !== 'draft' && next.publishedAt !== previous.publishedAt) {
    errors.push(`${label}: publishedAt cannot change after publication`);
  }
  const kept = previous.corrections.every(
    (correction, index) =>
      next.corrections[index]?.date === correction.date &&
      next.corrections[index]?.text === correction.text,
  );
  if (!kept) {
    errors.push(`${label}: corrections are append-only; an earlier correction was changed or removed`);
  }
  return errors;
}

export type CitedRecordState = 'missing' | 'trashed' | CitationState;

const CITATION_PROBLEMS: Record<
  Exclude<CitedRecordState, 'current'>,
  { always: boolean; message: (policyId: string) => string }
> = {
  missing: {
    always: true,
    message: (policyId) => `cites unknown register record "${policyId}"`,
  },
  trashed: {
    always: true,
    message: (policyId) => `cites trashed register record "${policyId}"`,
  },
  not_public: {
    always: false,
    message: (policyId) =>
      `cites "${policyId}", which is withheld or unverified (Source under review)`,
  },
  review_due: {
    always: false,
    message: (policyId) =>
      `cites "${policyId}", which is past its review interval (Source under review)`,
  },
};

export function articleCitationReport(
  label: string,
  baseCites: readonly string[],
  headCites: readonly string[],
  states: ReadonlyMap<string, CitedRecordState>,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const existing = new Set(baseCites);
  for (const policyId of headCites) {
    const state = states.get(policyId) ?? 'missing';
    if (state === 'current') continue;
    const problem = CITATION_PROBLEMS[state];
    const report = problem.always || !existing.has(policyId) ? errors : warnings;
    report.push(`${label}: ${problem.message(policyId)}`);
  }
  return { errors, warnings };
}

function citedRecordStates(targets: Pick<ArticleValidationContext, 'policies' | 'publicPolicies'>): Map<string, CitedRecordState> {
  const publicPolicies = new Map(
    targets.publicPolicies.map((policy) => [policy.id, policy]),
  );
  return new Map(
    targets.policies.map((policy): [string, CitedRecordState] => [
      policy.id,
      policy.status === 'trashed' ? 'trashed' : citationState(publicPolicies, policy.id),
    ]),
  );
}

export function validateArticles(
  current: readonly ArticleSource[],
  base: readonly ArticleSource[] | null,
  targets: ArticleValidationContext,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const states = citedRecordStates(targets);
  const previous = new Map<string, Article>();
  for (const entry of base ?? []) {
    const result = parseArticle(entry);
    if (result.ok) previous.set(entry.slug, result.article);
  }
  const parsed = new Map<string, Article>();

  for (const entry of current) {
    const label = `data/articles/${entry.slug}.md`;
    const result = parseArticle(entry);
    if (!result.ok) {
      errors.push(...result.errors.map((error) => `${label}: ${error}`));
      continue;
    }
    const article = result.article;
    parsed.set(entry.slug, article);
    if (article.status !== 'published') continue;
    const before = previous.get(entry.slug);
    const report = articleCitationReport(
      label,
      before?.status === 'published' ? before.cites : [],
      article.cites,
      states,
    );
    errors.push(...report.errors);
    warnings.push(...report.warnings);
    for (const block of article.blocks) {
      if (block.kind !== 'figure' || block.figure.kind !== 'chart') continue;
      errors.push(
        ...registerChartErrors(block.figure, targets.publicPolicies).map(
          (error) => `${label}: figure ${block.number}: ${error}`,
        ),
      );
    }
  }

  errors.push(...validateArticleImages(parsed, targets.images));

  const currentSlugs = new Set(current.map((entry) => entry.slug));
  for (const [slug, article] of previous) {
    const next = parsed.get(slug);
    if (currentSlugs.has(slug) && !next) continue;
    errors.push(
      ...articleTransitionErrors(`data/articles/${slug}.md`, article, next),
    );
  }

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
