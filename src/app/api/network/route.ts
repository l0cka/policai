import { getPolicies } from "@/lib/data-service";
import { buildNetworkData } from "@/lib/network-data";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";

export async function GET(request?: Request) {
  const limited = checkPublicApiRequest(request);
  if (limited) return limited;
  try {
    const policies = await getPolicies();
    const { nodes, edges } = buildNetworkData(policies);

    return publicApiJson({ nodes, edges, success: true });
  } catch (error) {
    console.error("[network] Failed to compute graph:", error);
    return publicApiError("Failed to load network data", 500);
  }
}

export function OPTIONS() {
  return publicApiOptions();
}
