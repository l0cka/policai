#!/usr/bin/env tsx
/**
 * Cards for pending source reviews, and one approve or dismiss.
 *
 *   npm run signal:reviews
 *   npm run signal:reviews -- apply --action=approve --id=<id> --reviewer=<name>
 *   npm run signal:reviews -- apply --action=dismiss --id=<id> --reviewer=<name>
 *
 * Approve calls approveStagedSource with the id and reviewer only. Dismiss
 * calls rejectStagedSource. Neither command publishes.
 */

import { pathToFileURL } from "node:url";
import { getSourceReviews } from "@/lib/data-service";
import {
	approveStagedSource,
	rejectStagedSource,
} from "@/lib/source-ingest";
import { runSignalSourceReviewCommand } from "@/lib/signal-source-reviews";

async function main() {
	const result = await runSignalSourceReviewCommand(process.argv.slice(2), {
		listPending: () => getSourceReviews({ status: "pending_review" }),
		approve: ({ id, actor }) => approveStagedSource({ id, actor }),
		reject: (id, reason) => rejectStagedSource(id, reason),
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
