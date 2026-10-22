import { getPolicies } from "@/lib/data-service";
import {
  isLegislativeRecord,
  LEGISLATIVE_STAGES,
  legislativeStage,
} from "@/lib/legislation/overview";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS, type Jurisdiction } from "@/types";

export async function GET(request: Request) {
  const limited = checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const jurisdiction = searchParams.get("jurisdiction") || undefined;
  if (jurisdiction && !JURISDICTIONS.includes(jurisdiction as Jurisdiction)) {
    return publicApiError(
      `Invalid jurisdiction. Allowed values: ${JURISDICTIONS.join(", ")}`,
    );
  }
  const stage = searchParams.get("stage") || undefined;
  if (stage && !LEGISLATIVE_STAGES.includes(stage as never)) {
    return publicApiError(
      `Invalid stage. Allowed values: ${LEGISLATIVE_STAGES.join(", ")}`,
    );
  }

  const policies = await getPolicies({ jurisdiction });
  const data = policies
    .filter(isLegislativeRecord)
    .map((record) => ({ ...record, stage: legislativeStage(record) }))
    .filter((record) => !stage || record.stage === stage);
  return publicApiJson({ data, total: data.length, success: true });
}

export function OPTIONS() {
  return publicApiOptions();
}
