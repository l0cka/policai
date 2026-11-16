import { getPolicies } from "@/lib/data-service";
import {
  isLegislativeRecord,
  LEGISLATIVE_STAGES,
  legislativeStage,
} from "@/lib/legislation/overview";
import {
  checkPublicApiRequest,
  enumParam,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";
import { parseSourceUrl } from "@/lib/source-url";
import { JURISDICTIONS } from "@/types";

export async function GET(request: Request) {
  const limited = await checkPublicApiRequest(request);
  if (limited) return limited;

  const { searchParams } = parseSourceUrl(request.url);
  const jurisdiction = enumParam(searchParams, "jurisdiction", JURISDICTIONS);
  if (jurisdiction.error) return jurisdiction.error;
  const stage = enumParam(searchParams, "stage", LEGISLATIVE_STAGES);
  if (stage.error) return stage.error;

  const policies = await getPolicies({ jurisdiction: jurisdiction.value });
  const data = policies
    .filter(isLegislativeRecord)
    .map((record) => ({ ...record, stage: legislativeStage(record) }))
    .filter((record) => !stage.value || record.stage === stage.value);
  return publicApiJson({ data, total: data.length, success: true });
}

export function OPTIONS() {
  return publicApiOptions();
}
