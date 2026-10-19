import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

export interface DataOverlayOptions {
	repoRoot: string;
	load: (repoRelativePath: string) => Promise<string | null>;
}

export interface DataOverlayChange {
	path: string;
	content: string;
}

interface DataOverlay {
	root: string;
	load: DataOverlayOptions["load"];
	base: Map<string, Promise<string | null>>;
	written: Map<string, string>;
}

const overlayStore = new AsyncLocalStorage<DataOverlay>();

function repoRelative(overlay: DataOverlay, filePath: string): string | null {
	const relative = path.relative(overlay.root, path.resolve(filePath));
	if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
		return null;
	}
	return relative.split(path.sep).join("/");
}

function baseContent(
	overlay: DataOverlay,
	relative: string,
): Promise<string | null> {
	let content = overlay.base.get(relative);
	if (!content) {
		content = overlay.load(relative);
		overlay.base.set(relative, content);
	}
	return content;
}

export function inDataOverlay(): boolean {
	return overlayStore.getStore() !== undefined;
}

export function readDataOverlay(
	filePath: string,
): Promise<string | null> | undefined {
	const overlay = overlayStore.getStore();
	if (!overlay) return undefined;
	const relative = repoRelative(overlay, filePath);
	if (relative === null) return undefined;
	const written = overlay.written.get(relative);
	if (written !== undefined) return Promise.resolve(written);
	return baseContent(overlay, relative);
}

export function writeDataOverlay(filePath: string, serialized: string): boolean {
	const overlay = overlayStore.getStore();
	if (!overlay) return false;
	const relative = repoRelative(overlay, filePath);
	if (relative === null) {
		throw new Error(
			`Data overlay refuses a write outside ${overlay.root}: ${filePath}`,
		);
	}
	overlay.written.set(relative, serialized);
	return true;
}

export async function runWithDataOverlay<T>(
	options: DataOverlayOptions,
	run: () => Promise<T>,
): Promise<{ result: T; changes: DataOverlayChange[] }> {
	const overlay: DataOverlay = {
		root: path.resolve(options.repoRoot),
		load: options.load,
		base: new Map(),
		written: new Map(),
	};
	const result = await overlayStore.run(overlay, run);
	const changes: DataOverlayChange[] = [];
	for (const [relative, serialized] of overlay.written) {
		const base = await baseContent(overlay, relative);
		const content = base?.endsWith("\n") ? `${serialized}\n` : serialized;
		if (content !== base) changes.push({ path: relative, content });
	}
	changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { result, changes };
}
