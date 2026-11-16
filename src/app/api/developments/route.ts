import { getDevelopments } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  enumParam,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS } from "@/types";

const PUBLIC_DEVELOPMENT_STATUSES = ["detected", "promoted"] as const;

export async function GET(request: Request) {
  const limited = await checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const search = searchParams.get("search") || undefined;
  const since = searchParams.get("since") || undefined;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit ? Number(rawLimit) : 50;

  const jurisdiction = enumParam(searchParams, "jurisdiction", JURISDICTIONS);
  if (jurisdiction.error) return jurisdiction.error;
  const status = enumParam(searchParams, "status", PUBLIC_DEVELOPMENT_STATUSES);
  if (status.error) return status.error;
  if (search && search.length > 200) {
    return publicApiError("Search must be 200 characters or fewer.");
  }
  if (since && Number.isNaN(Date.parse(since))) {
    return publicApiError(
      "Invalid since value. Use an ISO 8601 date or timestamp.",
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return publicApiError("Invalid limit. Use an integer from 1 to 100.");
  }

  const developments = await getDevelopments({
    jurisdiction: jurisdiction.value,
    status: status.value,
    search,
    since,
  });
  return publicApiJson({
    data: developments.slice(0, limit),
    total: developments.length,
    success: true,
  });
}

export function OPTIONS() {
  return publicApiOptions();
}
