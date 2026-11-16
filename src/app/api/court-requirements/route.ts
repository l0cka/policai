import {
	getPublicCourtRequirements,
	toShownRequirement,
} from "@/lib/court-requirements";
import {
	checkPublicApiRequest,
	enumParam,
	publicApiError,
	publicApiJson,
	publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import {
	COURT_REQUIREMENT_MODALITIES,
	type ApiCourtRequirement,
	JURISDICTIONS,
} from "@/types";

export async function GET(request: Request) {
	const limited = await checkPublicApiRequest(request);
	if (limited) return limited;

	const { searchParams } = parseSourceUrl(request.url);
	const search = searchParams.get("search") || undefined;
	const policyId = searchParams.get("policyId") || undefined;
	const actor = searchParams.get("actor") || undefined;
	const topic = searchParams.get("topic") || undefined;
	const limit = Number(searchParams.get("limit") || "50");

	const jurisdiction = enumParam(searchParams, "jurisdiction", JURISDICTIONS);
	if (jurisdiction.error) return jurisdiction.error;
	const modality = enumParam(
		searchParams,
		"modality",
		COURT_REQUIREMENT_MODALITIES,
	);
	if (modality.error) return modality.error;
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
		jurisdiction: jurisdiction.value,
		policyId,
		actor,
		modality: modality.value,
		topic,
	});

	return publicApiJson({
		data: requirements
			.slice(0, limit)
			.map((requirement): ApiCourtRequirement => {
				const shown = toShownRequirement(requirement);
				return {
					...shown,
					source: { ...shown.source, url: requirement.source.url },
					policy: requirement.policy,
				};
			}),
		total: requirements.length,
		success: true,
	});
}

export function OPTIONS() {
	return publicApiOptions();
}
