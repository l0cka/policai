import {
  COURT_REQUIREMENT_MODALITIES,
  COURT_REQUIREMENT_STATUSES,
  type CourtRequirement,
  type Policy,
} from '@/types';
import { isAllowedSourceHost, sourceUrlsEqual } from '@/lib/source-url';
import {
  SHA256,
  isNonEmptyString,
  isOneOf,
  isRecord,
  isTimestampString,
  type ValidationReport,
} from '@/lib/validate/primitives';

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
