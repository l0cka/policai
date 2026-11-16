export const MAX_JSON_BODY_BYTES = 16 * 1024;

export type BoundedJsonResult =
	| { ok: true; value: unknown }
	| { ok: false; reason: "too_large" | "invalid_json" };

export async function readBoundedJson(
	request: Request,
	maxBytes = MAX_JSON_BODY_BYTES,
): Promise<BoundedJsonResult> {
	if (Number(request.headers.get("content-length")) > maxBytes) {
		return { ok: false, reason: "too_large" };
	}
	if (!request.body) return { ok: false, reason: "invalid_json" };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > maxBytes) {
			await reader.cancel();
			return { ok: false, reason: "too_large" };
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
	} catch {
		return { ok: false, reason: "invalid_json" };
	}
}
