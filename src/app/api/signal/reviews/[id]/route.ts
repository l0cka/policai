import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSourceReviewById } from "@/lib/data-service";
import {
	bearerToken,
	dryRunSignalReview,
	requireSignalHttpToken,
} from "@/lib/signal-http";

const SIGNAL_RATE = {
	bucket: "signal-review",
	limit: 30,
	windowSeconds: 60,
} as const;

function signalJson(data: unknown, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Access-Control-Allow-Origin": process.env.POLICAI_CORS_ORIGIN || "*",
		},
	});
}

function signalError(error: string, status: number, code: string) {
	return signalJson({ success: false, error, code }, status);
}

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> },
) {
	const limited = checkRateLimit(request, SIGNAL_RATE);
	if (limited) {
		limited.headers.set("Cache-Control", "no-store");
		return limited;
	}

	const auth = requireSignalHttpToken(
		bearerToken(request.headers.get("authorization")),
	);
	if (!auth.ok) {
		return signalError(auth.error, auth.status, auth.code);
	}

	const { id } = await context.params;
	const result = await dryRunSignalReview(id, {
		getReview: getSourceReviewById,
		reject: async () => {
			throw new Error("dry-run");
		},
	});

	if (!result.ok) {
		return signalError(result.error, result.status, result.code);
	}

	return signalJson({
		success: true,
		dryRun: true,
		...result,
	});
}

export function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": process.env.POLICAI_CORS_ORIGIN || "*",
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Cache-Control": "public, max-age=86400",
		},
	});
}
