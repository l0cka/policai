/* @vitest-environment node */

import { rename, unlink, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readCapturedDocument } from "./source-ingest";

describe("captured-document security", () => {
	it("reads the opened descriptor when the path is replaced", async () => {
		const suffix = `${process.pid}-${Date.now()}`;
		const sourcePath = `/tmp/policai-capture-${suffix}.pdf`;
		const movedPath = `/tmp/policai-capture-${suffix}-opened.pdf`;
		const original = Buffer.from("%PDF-1.4\n% original safe fixture\n");
		const replacement = Buffer.from("not a recognised document");
		await writeFile(sourcePath, original);

		const options = {
			afterOpen: async () => {
				await rename(sourcePath, movedPath);
				await writeFile(sourcePath, replacement);
			},
		};
		try {
			if (process.platform === "linux") {
				const result = await readCapturedDocument(sourcePath, options);
				expect(Buffer.from(result.bytes)).toEqual(original);
			} else {
				await expect(readCapturedDocument(sourcePath, options)).rejects.toThrow(
					"Browser capture document changed while it was being opened",
				);
			}
		} finally {
			await unlink(sourcePath).catch(() => undefined);
			await unlink(movedPath).catch(() => undefined);
		}
	});
});
