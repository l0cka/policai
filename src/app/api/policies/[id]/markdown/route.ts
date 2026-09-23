import { getPolicyById } from "@/lib/data-service";
import { buildPolicyMarkdown } from "@/lib/policy-markdown";
import {
  checkPublicApiRequest,
  publicApiError,
  publicApiOptions,
  publicApiText,
} from "@/lib/public-api";

// GET - A public register record as Markdown with provenance (read-only)
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

    return publicApiText(
      buildPolicyMarkdown(policy),
      "text/markdown; charset=utf-8",
      { "Content-Disposition": `inline; filename="${policy.id.replace(/[^a-z0-9-]/gi, "_")}.md"` },
    );
  } catch (error) {
    console.error("Error rendering policy markdown:", error);
    return publicApiError("Failed to read policy", 500);
  }
}

export function OPTIONS() {
  return publicApiOptions();
}
