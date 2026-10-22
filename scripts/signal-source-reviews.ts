#!/usr/bin/env tsx
/**
 * Cards for pending source reviews, and a laptop recovery apply path.
 *
 *   npm run signal:reviews
 *   npm run signal:reviews -- apply --action=dismiss --id=<id> --reviewer=<name>
 *   npm run signal:reviews -- apply --action=verify --id=<policy-id> --reviewer=<name> --admin-token=<token>
 *
 * Product path for the Grok Bot is HTTPS GET/POST /api/signal/reviews with
 * POLICAI_SIGNAL_TOKEN (see docs/collector.md). This CLI is recovery only
 * when that endpoint is down: TTY confirm for dismiss, or a matching
 * POLICAI_MCP_ADMIN_TOKEN for token-gated recovery apply. CI and Cursor /
 * Claude agent sessions are refused. Verify always needs the admin token.
 * Approval happens only on a decision card in the Policai Claude project. Neither path invents a verified stamp without an explicit
 * verify action for a named policy id.
 */

import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { getSourceReviews } from "@/lib/data-service";
import { rejectStagedSource, verifyRegisterRecord } from "@/lib/source-ingest";
import {
	currentSignalRunner,
	runSignalSourceReviewCommand,
} from "@/lib/signal-source-reviews";

function confirmReviewer(reviewer: string): Promise<boolean> {
	const prompt = readline.createInterface({
		input: process.stdin,
		output: process.stderr,
	});
	return new Promise((resolve) => {
		prompt.question(
			`Type ${reviewer} to confirm this editorial decision: `,
			(answer) => {
				prompt.close();
				resolve(answer.replace(/\s+/g, " ").trim() === reviewer);
			},
		);
	});
}

async function main() {
	const result = await runSignalSourceReviewCommand(process.argv.slice(2), {
		listPending: () => getSourceReviews({ status: "pending_review" }),
		reject: (id, reason) => rejectStagedSource(id, reason),
		verify: ({ policyId, actor, notes }) =>
			verifyRegisterRecord({ policyId, actor, notes }),
		confirmReviewer,
		runner: currentSignalRunner(),
	});
	if (result.stdout) {
		process.stdout.write(
			result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`,
		);
	}
	if (result.stderr) {
		process.stderr.write(
			result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`,
		);
	}
	process.exit(result.exitCode);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
