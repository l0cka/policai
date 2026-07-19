/**
 * Preserve the distinction between editorial verification and the automated
 * register fingerprint audit run on 16 July 2026.
 */

import path from "node:path";
import { withDataMutationLock } from "../src/lib/data-lock";
import { readJsonFile, writeJsonFile } from "../src/lib/file-store";
import type { Policy } from "../src/types";

const POLICIES_FILE = path.join(
	process.cwd(),
	"data",
	"policies.json",
);

async function markRegisterSourceAudits() {
	const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
	let updatedCount = 0;
	const updated = policies.map((policy) => {
		const retrievedAt = policy.verification.source.retrievedAt;
		const checkedAt = policy.verification.checkedAt;
		if (
			policy.verification.status !== "verified" ||
			!policy.verification.source.contentHash ||
			!retrievedAt?.startsWith("2026-07-16") ||
			!checkedAt ||
			new Date(retrievedAt).getTime() <= new Date(checkedAt).getTime()
		) {
			return policy;
		}
		const staleNote =
			"An automated retrieval established this record's first source fingerprint after the recorded editorial review; fingerprinted editorial re-verification is required.";
		updatedCount++;
		return {
			...policy,
			verification: {
				...policy.verification,
				status: "stale" as const,
				lastSourceAuditAt: retrievedAt,
				notes: policy.verification.notes?.includes(
					"first source fingerprint after the recorded editorial review",
				)
					? policy.verification.notes
					: policy.verification.notes
						? `${policy.verification.notes} ${staleNote}`
						: staleNote,
			},
		};
	});

	if (updatedCount > 0) {
		await writeJsonFile(POLICIES_FILE, updated);
	}
	console.log(
		`mark-register-source-audits: ${updatedCount} policies updated`,
	);
}

async function main() {
	await withDataMutationLock(markRegisterSourceAudits);
}

main().catch((error) => {
	console.error("mark-register-source-audits: fatal", error);
	process.exitCode = 1;
});
