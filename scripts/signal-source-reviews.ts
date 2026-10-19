#!/usr/bin/env tsx
/**
 * Cards for pending source reviews, and one approve or dismiss.
 *
 *   npm run signal:reviews
 *   npm run signal:reviews -- apply --action=approve --id=<id> --reviewer=<name>
 *   npm run signal:reviews -- apply --action=dismiss --id=<id> --reviewer=<name>
 *
 * Apply runs only at a terminal, outside CI and agent sessions. The human
 * must type the reviewer name to confirm it. The approval notes record the
 * OS user, host, and time. Approve calls approveStagedSource with the id,
 * that reviewer, and those notes. Dismiss calls rejectStagedSource. Neither
 * command publishes. There is no environment variable that skips the prompt.
 */

import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { getSourceReviews } from "@/lib/data-service";
import {
	approveStagedSource,
	rejectStagedSource,
} from "@/lib/source-ingest";
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
		approve: ({ id, actor, approvalNotes }) =>
			approveStagedSource({ id, actor, approvalNotes }),
		reject: (id, reason) => rejectStagedSource(id, reason),
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
