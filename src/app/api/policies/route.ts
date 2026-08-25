import { getPolicies } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS, POLICY_STATUSES, POLICY_TYPES } from "@/types";

// Read-only public API. Policies are published by committing to the repo
// (via the local MCP source-ingest server or the collector), not over HTTP.
export async function GET(request: Request) {
  const limited = checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const jurisdiction = searchParams.get("jurisdiction") || undefined;
  const type = searchParams.get("type") || undefined;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;

  if (status === "trashed") return publicApiError("Not found", 404);
  if (jurisdiction && !JURISDICTIONS.includes(jurisdiction as never)) {
    return publicApiError(
      `Invalid jurisdiction. Allowed values: ${JURISDICTIONS.join(", ")}`,
    );
  }
  if (type && !POLICY_TYPES.includes(type as never)) {
    return publicApiError(
      `Invalid type. Allowed values: ${POLICY_TYPES.join(", ")}`,
    );
  }
  if (status && !POLICY_STATUSES.includes(status as never)) {
    return publicApiError(
      `Invalid status. Allowed values: ${POLICY_STATUSES.slice(0, -1).join(", ")}`,
    );
  }
  if (search && search.length > 200)
    return publicApiError("Search must be 200 characters or fewer.");

  const filteredPolicies = await getPolicies({
    jurisdiction,
    type,
    status,
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
