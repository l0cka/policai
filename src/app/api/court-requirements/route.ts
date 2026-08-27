import { getPublicCourtRequirements } from "@/lib/court-requirements";
import {
	checkPublicApiRequest,
	publicApiError,
	publicApiJson,
	publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import {
	COURT_REQUIREMENT_MODALITIES,
	JURISDICTIONS,
	type CourtRequirementModality,
	type Jurisdiction,
} from "@/types";

export async function GET(request: Request) {
	const limited = checkPublicApiRequest(request);
	if (limited) return limited;

	const { searchParams } = parseSourceUrl(request.url);
	const jurisdiction = searchParams.get("jurisdiction") || undefined;
	const modality = searchParams.get("modality") || undefined;
	const search = searchParams.get("search") || undefined;
	const policyId = searchParams.get("policyId") || undefined;
	const actor = searchParams.get("actor") || undefined;
	const topic = searchParams.get("topic") || undefined;
	const limit = Number(searchParams.get("limit") || "50");

	if (jurisdiction && !JURISDICTIONS.includes(jurisdiction as Jurisdiction)) {
		return publicApiError(
			`Invalid jurisdiction. Allowed values: ${JURISDICTIONS.join(", ")}`,
		);
	}
	if (
		modality &&
		!COURT_REQUIREMENT_MODALITIES.includes(
			modality as CourtRequirementModality,
		)
	) {
		return publicApiError(
			`Invalid modality. Allowed values: ${COURT_REQUIREMENT_MODALITIES.join(", ")}`,
		);
	}
	if (
		[search, policyId, actor, topic].some(
			(value) => value !== undefined && value.length > 200,
		)
	) {
		return publicApiError("Filters must be 200 characters or fewer.");
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
		return publicApiError("Limit must be an integer from 1 to 100.");
	}

	const requirements = await getPublicCourtRequirements({
		search,
		jurisdiction: jurisdiction as Jurisdiction | undefined,
		policyId,
		actor,
		modality: modality as CourtRequirementModality | undefined,
		topic,
	});

	return publicApiJson({
		data: requirements.slice(0, limit),
		total: requirements.length,
		success: true,
	});
}

export function OPTIONS() {
	return publicApiOptions();
}
