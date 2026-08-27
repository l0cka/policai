import path from "node:path";
import { withDataMutationLock } from "@/lib/data-lock";
import { readJsonFile, writeJsonFile } from "@/lib/file-store";
import { getPolicies } from "@/lib/data-service";
import { validateCourtRequirements } from "@/lib/validate-data";
import { sourceUrlsEqual } from "@/lib/source-url";
import type {
	CourtRequirement,
	CourtRequirementModality,
	CourtRequirementStatus,
	Jurisdiction,
	Policy,
	PublicCourtRequirement,
} from "@/types";

const COURT_REQUIREMENTS_FILE = path.join(
	process.cwd(),
	"data",
	"court-requirements.json",
);
const POLICIES_FILE = path.join(process.cwd(), "data", "policies.json");

export interface CourtRequirementFilters {
	search?: string;
	jurisdiction?: Jurisdiction;
	policyId?: string;
	actor?: string;
	modality?: CourtRequirementModality;
	topic?: string;
}

export interface CourtRequirementProposal {
	id: string;
	actor: string;
	modality: CourtRequirementModality;
	action: string;
	conditions?: string[];
	exceptions?: string[];
	topics?: string[];
	locator: string;
	quote: string;
}

export type CourtRequirementReviewDecision = Extract<
	CourtRequirementStatus,
	"verified" | "rejected"
>;
export type CourtRequirementRevision = Partial<
	Pick<
		CourtRequirement,
		| "actor"
		| "modality"
		| "action"
		| "conditions"
		| "exceptions"
		| "topics"
	>
>;

function normalizedEvidence(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

/** Bind model or manual proposals to the exact source bytes before review. */
export function stageCourtRequirementCandidates(input: {
	policyId: string;
	sourceUrl: string;
	contentHash: string;
	sourceText: string;
	extractedAt: string;
	extractedBy: string;
	method: "ai" | "manual";
	proposals: CourtRequirementProposal[];
}): CourtRequirement[] {
	const sourceText = normalizedEvidence(input.sourceText);
	const ids = new Set<string>();

	return input.proposals.map((proposal) => {
		if (ids.has(proposal.id)) {
			throw new Error(`Duplicate court requirement id: ${proposal.id}`);
		}
		ids.add(proposal.id);
		if (!normalizedEvidence(proposal.quote)) {
			throw new Error(`${proposal.id}: source quote is required`);
		}
		if (!sourceText.includes(normalizedEvidence(proposal.quote))) {
			throw new Error(`${proposal.id}: source quote was not found in the document`);
		}

		return {
			id: proposal.id,
			policyId: input.policyId,
			actor: proposal.actor.trim(),
			modality: proposal.modality,
			action: proposal.action.trim(),
			conditions: proposal.conditions ?? [],
			exceptions: proposal.exceptions ?? [],
			topics: proposal.topics ?? [],
			source: {
				url: input.sourceUrl,
				contentHash: input.contentHash,
				locator: proposal.locator.trim(),
				quote: normalizedEvidence(proposal.quote),
			},
			extraction: {
				method: input.method,
				extractedAt: input.extractedAt,
				extractedBy: input.extractedBy.trim(),
			},
			verification: { status: "pending_review" },
		};
	});
}

export function filterCourtRequirements(
	requirements: PublicCourtRequirement[],
	filters: CourtRequirementFilters = {},
): PublicCourtRequirement[] {
	const search = filters.search?.trim().toLowerCase();
	const actor = filters.actor?.trim().toLowerCase();
	const topic = filters.topic?.trim().toLowerCase();

	return requirements.filter((requirement) => {
		if (
			filters.jurisdiction &&
			requirement.policy.jurisdiction !== filters.jurisdiction
		) return false;
		if (filters.policyId && requirement.policyId !== filters.policyId) return false;
		if (filters.modality && requirement.modality !== filters.modality) return false;
		if (actor && !requirement.actor.toLowerCase().includes(actor)) return false;
		if (topic && !requirement.topics.some((value) => value.toLowerCase() === topic)) {
			return false;
		}
		if (!search) return true;

		return [
			requirement.actor,
			requirement.action,
			requirement.source.quote,
			requirement.policy.title,
			...requirement.policy.agencies,
			...requirement.conditions,
			...requirement.exceptions,
			...requirement.topics,
		]
			.join(" ")
			.toLowerCase()
			.includes(search);
	});
}

export async function getPublicCourtRequirements(
	filters: CourtRequirementFilters = {},
): Promise<PublicCourtRequirement[]> {
	const [requirements, policies] = await Promise.all([
		readJsonFile<CourtRequirement[]>(COURT_REQUIREMENTS_FILE, []),
		getPolicies({ type: "practice_note" }),
	]);
	const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
	const publicRequirements = requirements.flatMap((requirement) => {
		const policy = policiesById.get(requirement.policyId);
		const currentSource = policy?.verification?.source;
		if (
			requirement.verification.status !== "verified" ||
			!policy ||
			currentSource?.contentHash !== requirement.source.contentHash ||
			!sourceUrlsEqual(currentSource.url, requirement.source.url)
		) return [];
		return [{ ...requirement, policy } satisfies PublicCourtRequirement];
	});

	return filterCourtRequirements(publicRequirements, filters).sort(
		(left, right) =>
			left.policy.title.localeCompare(right.policy.title) ||
			left.source.locator.localeCompare(right.source.locator, undefined, {
				numeric: true,
			}),
	);
}

export async function getCourtRequirementsForReview(filters: {
	status?: CourtRequirementStatus;
	policyId?: string;
} = {}) {
	const [requirements, policies] = await Promise.all([
		readJsonFile<CourtRequirement[]>(COURT_REQUIREMENTS_FILE, []),
		readJsonFile<Policy[]>(POLICIES_FILE, []),
	]);
	const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
	const records = requirements
		.filter(
			(requirement) =>
				(!filters.status || requirement.verification.status === filters.status) &&
				(!filters.policyId || requirement.policyId === filters.policyId),
		)
		.map((requirement) => {
			const policy = policiesById.get(requirement.policyId);
			return {
				...requirement,
				policy: policy
					? {
							id: policy.id,
							title: policy.title,
							jurisdiction: policy.jurisdiction,
							agencies: policy.agencies,
							status: policy.status,
							lastReviewedAt: policy.lastReviewedAt,
						}
					: undefined,
			};
		});

	return { total: records.length, requirements: records };
}

export async function reviewCourtRequirement(input: {
	id: string;
	decision: CourtRequirementReviewDecision;
	reviewer: string;
	notes: string;
	revision?: CourtRequirementRevision;
}): Promise<CourtRequirement> {
	return withDataMutationLock(async () => {
		const reviewer = input.reviewer.trim();
		const notes = input.notes?.trim();
		if (!reviewer) throw new Error("A human reviewer identity is required");
		if (!notes) {
			throw new Error(
				input.decision === "rejected"
					? "A rejection reason is required"
					: "Review notes are required",
			);
		}
		if (input.decision === "rejected" && input.revision) {
			throw new Error("Rejected requirements cannot include a revision");
		}

		const [requirements, policies] = await Promise.all([
			readJsonFile<CourtRequirement[]>(COURT_REQUIREMENTS_FILE, []),
			readJsonFile<Policy[]>(POLICIES_FILE, []),
		]);
		const index = requirements.findIndex((requirement) => requirement.id === input.id);
		if (index < 0) throw new Error(`Court requirement not found: ${input.id}`);

		const current = requirements[index];
		if (current.verification.status !== "pending_review") {
			throw new Error(
				`${input.id}: only pending court requirements can be reviewed`,
			);
		}

		const reviewed: CourtRequirement = {
			...current,
			...(input.revision ?? {}),
			verification: {
				status: input.decision,
				reviewedAt: new Date().toISOString(),
				reviewedBy: reviewer,
				notes,
			},
		};
		const updated = requirements.with(index, reviewed);
		const validation = validateCourtRequirements(updated, policies);
		if (validation.errors.length > 0) {
			throw new Error(
				`Court requirement review failed validation: ${validation.errors.join("; ")}`,
			);
		}

		await writeJsonFile(COURT_REQUIREMENTS_FILE, updated);
		return reviewed;
	});
}
