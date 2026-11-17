import { NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { appendToApprovalMailbox } from "@/lib/approval-mailbox";
import { MAX_JSON_BODY_BYTES, readBoundedJson } from "@/lib/bounded-json-body";
import {
	parseApprovalSubject,
	readEditorPasskeys,
	verifyEditorApproval,
	type EditorApproval,
} from "@/lib/editor-approval";

function approvalJson(data: unknown, status = 200) {
	return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function field(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length <= 4096 ? value : undefined;
}

/**
 * Receives a passkey signature from /approve. Only a signature that verifies
 * against a registered editor passkey is stored, so the mailbox cannot be
 * filled by anyone else; publishing verifies it again.
 */
export async function POST(request: Request) {
	const limited = await checkRateLimit(request, RATE_LIMITS.approvals);
	if (limited) return limited;

	const read = await readBoundedJson(request);
	if (!read.ok && read.reason === "too_large") {
		return approvalJson({ success: false, code: "body_too_large", error: `Request body must be at most ${MAX_JSON_BODY_BYTES} bytes` }, 413);
	}
	if (!read.ok || !read.value || typeof read.value !== "object" || Array.isArray(read.value)) {
		return approvalJson({ success: false, code: "invalid_json", error: "Request body must be a JSON object" }, 400);
	}
	const body = read.value as Record<string, unknown>;

	const subject = field(body, "subject");
	const response =
		body.response && typeof body.response === "object" && !Array.isArray(body.response)
			? (body.response as Record<string, unknown>)
			: {};
	const id = field(response, "id");
	const authenticatorData = field(response, "authenticatorData");
	const clientDataJSON = field(response, "clientDataJSON");
	const signature = field(response, "signature");
	if (!subject || !parseApprovalSubject(subject) || !id || !authenticatorData || !clientDataJSON || !signature) {
		return approvalJson({ success: false, code: "invalid_request", error: "subject and a passkey response are required" }, 400);
	}

	const approval: EditorApproval = {
		subject,
		receivedAt: new Date().toISOString(),
		response: { id, authenticatorData, clientDataJSON, signature, userHandle: field(response, "userHandle") },
	};
	const verified = await verifyEditorApproval(approval, await readEditorPasskeys(), subject);
	if (!verified.ok) {
		return approvalJson({ success: false, code: "not_verified", error: verified.error }, 403);
	}

	const stored = await appendToApprovalMailbox(approval);
	if (!stored.ok) {
		return approvalJson({ success: false, code: stored.code, error: stored.error }, stored.status);
	}
	return approvalJson({ success: true, subject, reviewer: verified.passkey.reviewer });
}
