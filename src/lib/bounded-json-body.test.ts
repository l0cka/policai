/* @vitest-environment node */

import { describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES, readBoundedJson } from "@/lib/bounded-json-body";

function request(body: BodyInit, headers: Record<string, string> = {}) {
	return new Request("https://policai.org/api/test", {
		method: "POST",
		headers,
		body,
		duplex: "half",
	} as RequestInit);
}

function jsonOfBytes(bytes: number): string {
	const overhead = '{"p":""}'.length;
	return `{"p":"${"a".repeat(bytes - overhead)}"}`;
}

describe("readBoundedJson", () => {
	it("parses a body within the limit", async () => {
		await expect(readBoundedJson(request('{"a":1}'))).resolves.toEqual({
			ok: true,
			value: { a: 1 },
		});
	});

	it("accepts a body of exactly the limit and refuses one byte more", async () => {
		const atLimit = await readBoundedJson(request(jsonOfBytes(MAX_JSON_BODY_BYTES)));
		const over = await readBoundedJson(request(jsonOfBytes(MAX_JSON_BODY_BYTES + 1)));

		expect(atLimit.ok).toBe(true);
		expect(over).toEqual({ ok: false, reason: "too_large" });
	});

	it("counts bytes, not characters", async () => {
		const text = `{"p":"${"é".repeat(MAX_JSON_BODY_BYTES / 2)}"}`;
		expect(text.length).toBeLessThan(MAX_JSON_BODY_BYTES);

		await expect(readBoundedJson(request(text))).resolves.toEqual({
			ok: false,
			reason: "too_large",
		});
	});

	it("reports a body stream that fails mid-read as invalid", async () => {
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.error(new Error("connection reset"));
			},
		});

		await expect(readBoundedJson(request(body))).resolves.toEqual({
			ok: false,
			reason: "invalid_json",
		});
	});

	it("refuses on a declared length over the limit without reading the body", async () => {
		let pulled = false;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled = true;
					controller.enqueue(new TextEncoder().encode("{}"));
					controller.close();
				},
			},
			{ highWaterMark: 0 },
		);

		const result = await readBoundedJson(
			request(body, { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
		);

		expect(result).toEqual({ ok: false, reason: "too_large" });
		expect(pulled).toBe(false);
	});

	it.each(["2", "abc"])(
		"refuses an oversized body that declares a length of %s",
		async (declared) => {
			const big = new TextEncoder().encode(jsonOfBytes(MAX_JSON_BODY_BYTES + 1));
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(big);
					controller.close();
				},
			});

			await expect(
				readBoundedJson(request(body, { "content-length": declared })),
			).resolves.toEqual({ ok: false, reason: "too_large" });
		},
	);

	it("stops reading an endless body once it passes the limit", async () => {
		let chunks = 0;
		let cancelled = false;
		const chunk = new Uint8Array(1024).fill(0x20);
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				chunks += 1;
				controller.enqueue(chunk);
			},
			cancel() {
				cancelled = true;
			},
		});

		await expect(readBoundedJson(request(body))).resolves.toEqual({
			ok: false,
			reason: "too_large",
		});
		expect(cancelled).toBe(true);
		expect(chunks).toBeLessThan(40);
	});

	it("reports an oversized body that is not JSON as too large", async () => {
		await expect(
			readBoundedJson(request("x".repeat(MAX_JSON_BODY_BYTES + 1))),
		).resolves.toEqual({ ok: false, reason: "too_large" });
	});

	it("reports a missing or malformed body as invalid JSON", async () => {
		const empty = new Request("https://policai.org/api/test", { method: "POST" });

		await expect(readBoundedJson(empty)).resolves.toEqual({
			ok: false,
			reason: "invalid_json",
		});
		await expect(readBoundedJson(request("{not json"))).resolves.toEqual({
			ok: false,
			reason: "invalid_json",
		});
	});
});
