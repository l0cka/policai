import { getAgencies, getCommonwealthAgencies } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  enumParam,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS } from "@/types";

export async function GET(request: Request) {
  const limited = await checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const level = searchParams.get("level") || undefined;
  const commonwealth = searchParams.get("commonwealth");

  if (level && !["federal", "state"].includes(level)) {
    return publicApiError("Invalid level. Allowed values: federal, state");
  }
  const jurisdiction = enumParam(searchParams, "jurisdiction", JURISDICTIONS);
  if (jurisdiction.error) return jurisdiction.error;
  if (commonwealth && !["true", "false"].includes(commonwealth)) {
    return publicApiError(
      "Invalid commonwealth value. Allowed values: true, false",
    );
  }

  if (commonwealth === "true") {
    const agencies = await getCommonwealthAgencies();
    return publicApiJson({
      data: agencies,
      total: agencies.length,
      success: true,
    });
  }

  const agencies = await getAgencies({
    level,
    jurisdiction: jurisdiction.value,
  });
  return publicApiJson({
    data: agencies,
    total: agencies.length,
    success: true,
  });
}

export function OPTIONS() {
  return publicApiOptions();
}
