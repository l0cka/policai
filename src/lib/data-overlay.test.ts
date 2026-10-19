/* @vitest-environment node */

import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withDataMutationLock } from "./data-lock";
import { runWithDataOverlay } from "./data-overlay";
import { readJsonFile, writeJsonFile } from "./file-store";

async function tempRepo(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "data-overlay-"));
}

describe("data overlay", () => {
	it("keeps writes in memory, reads them back and lists only changed files", async () => {
		const root = await tempRepo();
		await writeFile(path.join(root, "on-disk.json"), '{"disk":true}', "utf8");
		const snapshot: Record<string, string> = {
			"data/a.json": '[\n  1\n]\n',
			"data/b.json": '{\n  "same": true\n}',
			"data/unchanged-write.json": '{\n  "x": 1\n}\n',
		};
		const load = vi.fn(async (relative: string) => snapshot[relative] ?? null);

		const { result, changes } = await runWithDataOverlay(
			{ repoRoot: root, load },
			async () => {
				const a = await readJsonFile<number[]>(path.join(root, "data/a.json"), []);
				await writeJsonFile(path.join(root, "data/a.json"), [...a, 2]);
				const seen = await readJsonFile<number[]>(
					path.join(root, "data/a.json"),
					[],
				);
				await readJsonFile(path.join(root, "data/b.json"), {});
				await readJsonFile(path.join(root, "data/b.json"), {});
				await writeJsonFile(path.join(root, "data/unchanged-write.json"), {
					x: 1,
				});
				await writeJsonFile(path.join(root, "data/new.json"), { fresh: true });
				const missing = await readJsonFile(
					path.join(root, "on-disk.json"),
					"fallback",
				);
				return { seen, missing };
			},
		);

		expect(result).toEqual({ seen: [1, 2], missing: "fallback" });
		expect(changes).toEqual([
			{ path: "data/a.json", content: "[\n  1,\n  2\n]\n" },
			{ path: "data/new.json", content: '{\n  "fresh": true\n}' },
		]);
		expect(load.mock.calls.filter(([p]) => p === "data/b.json")).toHaveLength(1);
		expect((await readdir(root)).sort()).toEqual(["on-disk.json"]);
		expect(await readFile(path.join(root, "on-disk.json"), "utf8")).toBe(
			'{"disk":true}',
		);
	});

	it("refuses a write outside the repository root", async () => {
		const root = await tempRepo();
		const outside = path.join(await tempRepo(), "escape.json");
		await expect(
			runWithDataOverlay({ repoRoot: root, load: async () => null }, () =>
				writeJsonFile(outside, { escaped: true }),
			),
		).rejects.toThrow(/outside/);
		await expect(readFile(outside, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("runs the data mutation lock without creating a lock file", async () => {
		const lockFile = path.join(process.cwd(), "data", ".mutation.lock");
		let lockSeen: boolean | undefined;
		const { result } = await runWithDataOverlay(
			{ repoRoot: await tempRepo(), load: async () => null },
			() =>
				withDataMutationLock(async () => {
					lockSeen = await readFile(lockFile).then(
						() => true,
						() => false,
					);
					return "ran";
				}),
		);
		expect(result).toBe("ran");
		expect(lockSeen).toBe(false);
	});
});
