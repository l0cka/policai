import { getPolicyById } from "@/lib/data-service";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiJson,
  publicApiOptions,
} from "@/lib/public-api";

// GET - Retrieve a single policy by ID (read-only public API)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = checkPublicApiRequest(request);
  if (limited) return limited;

  try {
    const { id } = await params;
    const policy = await getPolicyById(id);

    if (!policy) {
      return publicApiError("Policy not found", 404);
    }

    return publicApiJson({
      data: policy,
      success: true,
    });
  } catch (error) {
    console.error("Error reading policy:", error);
    return publicApiError("Failed to read policy", 500);
  }
}

export function OPTIONS() {
  return publicApiOptions();
}
