import { getPolicies } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  enumParam,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS, POLICY_STATUSES, POLICY_TYPES } from "@/types";

export async function GET(request: Request) {
  const limited = await checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const search = searchParams.get("search") || undefined;

  if (searchParams.get("status") === "trashed")
    return publicApiError("Not found", 404);
  const jurisdiction = enumParam(searchParams, "jurisdiction", JURISDICTIONS);
  if (jurisdiction.error) return jurisdiction.error;
  const type = enumParam(searchParams, "type", POLICY_TYPES);
  if (type.error) return type.error;
  const status = enumParam(
    searchParams,
    "status",
    POLICY_STATUSES,
    POLICY_STATUSES.slice(0, -1),
  );
  if (status.error) return status.error;
  if (search && search.length > 200)
    return publicApiError("Search must be 200 characters or fewer.");

  const filteredPolicies = await getPolicies({
    jurisdiction: jurisdiction.value,
    type: type.value,
    status: status.value,
    search,
  });

  return publicApiJson({
    data: filteredPolicies,
    total: filteredPolicies.length,
    success: true,
  });
}

export function OPTIONS() {
  return publicApiOptions();
}
