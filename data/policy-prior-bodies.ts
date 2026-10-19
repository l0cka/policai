import type { PolicyPriorBody } from '@/lib/policy-diff';

/**
 * Prior instrument text, kept beside the register.
 * Leave this empty when no record has a retained body.
 * Do not copy these strings onto a policy: policyRevisionHash spreads the policy object.
 */
export const policyPriorBodies: readonly PolicyPriorBody[] = [];
