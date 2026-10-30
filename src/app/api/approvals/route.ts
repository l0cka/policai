import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { appendToApprovalMailbox } from "@/lib/approval-mailbox";
import {
	parseApprovalSubject,
	readEditorPasskeys,
	verifyEditorApproval,
	type EditorApproval,
} from "@/lib/editor-approval";

const APPROVAL_RATE = { bucket: "approvals", limit: 10, windowSeconds: 60 } as const;

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
	const limited = checkRateLimit(request, APPROVAL_RATE);
	if (limited) return limited;

	let body: Record<string, unknown>;
	try {
		const parsed: unknown = await request.json();
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
		body = parsed as Record<string, unknown>;
	} catch {
		return approvalJson({ success: false, code: "invalid_json", error: "Request body must be a JSON object" }, 400);
	}

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
