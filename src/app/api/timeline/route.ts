import { getTimelineEvents } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS } from "@/types";

export async function GET(request: Request) {
  const limited = checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const jurisdiction = searchParams.get("jurisdiction") || undefined;
  if (jurisdiction && !JURISDICTIONS.includes(jurisdiction as never)) {
    return publicApiError(
      `Invalid jurisdiction. Allowed values: ${JURISDICTIONS.join(", ")}`,
    );
  }

  const events = await getTimelineEvents(
    { jurisdiction },
    { scope: "policy-register" },
  );
  return publicApiJson({ data: events, total: events.length, success: true });
}

export function OPTIONS() {
  return publicApiOptions();
}
