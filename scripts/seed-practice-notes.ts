#!/usr/bin/env tsx
/**
 * Seed court practice notes into Supabase.
 *
 * Reads the practice_note entries from sample-policies.json and upserts them
 * into the Supabase policies table. Safe to run multiple times — existing
 * rows are updated rather than duplicated.
 *
 * Usage:
 *   tsx scripts/seed-practice-notes.ts
 */

import { createClient } from "@supabase/supabase-js";
import path from "path";
import { readJsonFile } from "../src/lib/file-store";
import type { Policy } from "../src/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	console.error(
		"Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
	const filePath = path.join(
		process.cwd(),
		"public",
		"data",
		"sample-policies.json",
	);
	const allPolicies = await readJsonFile<Policy[]>(filePath, []);

	const practiceNotes = allPolicies.filter((p) => p.type === "practice_note");

	if (practiceNotes.length === 0) {
		console.log("No practice notes found in sample-policies.json");
		return;
	}

	console.log(`Found ${practiceNotes.length} practice notes to seed...`);

	for (const note of practiceNotes) {
		const { data, error } = await supabase
			.from("policies")
			.upsert(note, { onConflict: "id" })
			.select()
			.single();

		if (error) {
			console.error(`  FAIL: ${note.title} — ${error.message}`);
		} else {
			console.log(`  OK: ${data.title}`);
		}
	}

	console.log("Done.");
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
