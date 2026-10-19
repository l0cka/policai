import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSourceReviewById } from "@/lib/data-service";
import {
	approveStagedSource,
	publishStagedSource,
	rejectStagedSource,
} from "@/lib/source-ingest";
import {
	applySignalHttpDecision,
	bearerToken,
	requireSignalHttpToken,
	type SignalAttestationInput,
	type SignalHttpAction,
} from "@/lib/signal-http";
import { persistSignalDecisionToGitHub } from "@/lib/signal-git-persist";

const SIGNAL_RATE = { limit: 20, windowSeconds: 60 } as const;

function signalJson(data: unknown, status = 200) {
	return NextResponse.json(data, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Access-Control-Allow-Origin": process.env.POLICAI_CORS_ORIGIN || "*",
		},
	});
}

function signalError(
	error: string,
	status: number,
	code: string,
	extra: Record<string, unknown> = {},
) {
	return signalJson({ success: false, error, code, ...extra }, status);
}

export async function POST(request: Request) {
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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return signalError("Request body must be JSON", 400, "invalid_json");
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return signalError("Request body must be a JSON object", 400, "invalid_json");
	}

	const record = body as Record<string, unknown>;
	const reviewId =
		typeof record.reviewId === "string" ? record.reviewId : undefined;
	const action = record.action as SignalHttpAction | undefined;
	const reviewer =
		typeof record.reviewer === "string" ? record.reviewer : undefined;
	const attestationRaw = record.attestation;

	if (
		!attestationRaw ||
		typeof attestationRaw !== "object" ||
		Array.isArray(attestationRaw)
	) {
		return signalError(
			"attestation object is required",
			400,
			"invalid_attestation",
		);
	}
	const attestation = attestationRaw as Record<string, unknown>;
	const attestationInput: SignalAttestationInput = {
		replyText:
			typeof attestation.replyText === "string" ? attestation.replyText : "",
		chatMessageId:
			typeof attestation.chatMessageId === "string"
				? attestation.chatMessageId
				: "",
		cardId: typeof attestation.cardId === "string" ? attestation.cardId : "",
		decidedAt:
			typeof attestation.decidedAt === "string"
				? attestation.decidedAt
				: undefined,
	};

	if (!reviewId || !action || !reviewer) {
		return signalError(
			"reviewId, action, and reviewer are required",
			400,
			"invalid_request",
		);
	}

	const result = await applySignalHttpDecision(
		{ reviewId, action, reviewer, attestation: attestationInput },
		{
			getReview: getSourceReviewById,
			approve: ({ id, actor, approvalNotes }) =>
				approveStagedSource({ id, actor, approvalNotes }),
			publish: (id) => publishStagedSource(id),
			reject: (id, reason) => rejectStagedSource(id, reason),
		},
	);

	if (!result.ok) {
		return signalError(result.error, result.status, result.code);
	}

	let persistence: Awaited<ReturnType<typeof persistSignalDecisionToGitHub>> | null =
		null;
	if (!result.noop) {
		persistence = await persistSignalDecisionToGitHub({
			reviewId: result.review.id,
			action: result.action,
			message: result.message,
			attestationText: result.attestationText,
		});
	}

	return signalJson({
		success: true,
		noop: result.noop,
		action: result.action,
		message: result.message,
		review: {
			id: result.review.id,
			status: result.review.status,
			title: result.review.title,
			sourceUrl: result.review.sourceUrl,
			reviewedBy: result.review.reviewedBy,
			publishedAt: result.review.publishedAt,
		},
		attestationText: result.attestationText,
		persistence: persistence
			? persistence.ok
				? {
						ok: true,
						target: persistence.target,
						branch: persistence.branch,
						commitSha: persistence.commitSha,
						prUrl: persistence.prUrl,
						htmlUrl: persistence.htmlUrl,
					}
				: {
						ok: false,
						code: persistence.code,
						error: persistence.error,
					}
			: { ok: true, skipped: true, reason: "noop" },
	});
}

export function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": process.env.POLICAI_CORS_ORIGIN || "*",
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Cache-Control": "public, max-age=86400",
		},
	});
}
