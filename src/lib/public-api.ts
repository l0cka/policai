import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const PUBLIC_CACHE =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
const PUBLIC_ORIGIN = process.env.POLICAI_CORS_ORIGIN || "*";

function addPublicHeaders(response: NextResponse, cache = PUBLIC_CACHE) {
  response.headers.set("Access-Control-Allow-Origin", PUBLIC_ORIGIN);
  response.headers.set("Cache-Control", cache);
  return response;
}

export function checkPublicApiRequest(request?: Request) {
  if (!request) return null;
  const limited = checkRateLimit(request);
  return limited ? addPublicHeaders(limited, "no-store") : null;
}

export function publicApiJson<T>(data: T, init: ResponseInit = {}) {
  const response = NextResponse.json(data, init);
  const cache = response.status >= 400 ? "no-store" : PUBLIC_CACHE;
  return addPublicHeaders(response, cache);
}

export function publicApiError(error: string, status = 400) {
  return publicApiJson({ error, success: false }, { status });
}

export function publicApiOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": PUBLIC_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
