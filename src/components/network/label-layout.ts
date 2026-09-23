/**
 * Label placement for the relationship graph.
 *
 * Positions follow the graph's existing rules (below a selected node, above or
 * below when the node sits mostly vertically from the focus, otherwise to the
 * side facing away from it). Labels are then admitted greedily in priority
 * order and a label whose box would overlap an admitted one is dropped, so a
 * dense cluster shows fewer, readable labels instead of a pile of overprinted
 * text, and never a label printed across another node. The selected node's
 * label is always kept.
 */

export interface LabelCandidate {
	id: string;
	x: number;
	y: number;
	radius: number;
	text: string;
	/** Higher values are placed first. */
	priority: number;
	selected: boolean;
}

export interface PlacedLabel {
	x: number;
	y: number;
	anchor: 'start' | 'middle' | 'end';
}

interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/** Approximate advance per character for the 11–12 px label font. */
const CHAR_WIDTH = 6.4;
const LINE_HEIGHT = 14;
const GAP = 2;

export function labelOffset(
	node: { x: number; y: number; radius: number },
	selected: boolean,
	focus: { x: number; y: number } | null,
	width: number,
): PlacedLabel {
	const deltaX = focus ? node.x - focus.x : node.x - width / 2;
	const deltaY = focus ? node.y - focus.y : 0;
	const vertical = !selected && Math.abs(deltaY) > Math.abs(deltaX) * 1.1;
	const onLeft = node.x > width * 0.68 || (node.x >= width * 0.32 && deltaX < 0);
	if (selected) return { x: 0, y: node.radius + 17, anchor: 'middle' };
	if (vertical) {
		return { x: 0, y: deltaY < 0 ? -(node.radius + 8) : node.radius + 15, anchor: 'middle' };
	}
	return onLeft
		? { x: -(node.radius + 7), y: 4, anchor: 'end' }
		: { x: node.radius + 7, y: 4, anchor: 'start' };
}

function boxFor(candidate: LabelCandidate, placed: PlacedLabel): Box {
	const width = candidate.text.length * CHAR_WIDTH;
	const x = candidate.x + placed.x;
	const baseline = candidate.y + placed.y;
	const left = placed.anchor === 'start' ? x : placed.anchor === 'end' ? x - width : x - width / 2;
	return { left, right: left + width, top: baseline - LINE_HEIGHT + 3, bottom: baseline + 3 };
}

function overlaps(a: Box, b: Box): boolean {
	return (
		a.left < b.right + GAP &&
		b.left < a.right + GAP &&
		a.top < b.bottom + GAP &&
		b.top < a.bottom + GAP
	);
}

export interface NodeDisc {
	id: string;
	x: number;
	y: number;
	radius: number;
}

function hitsDisc(box: Box, disc: NodeDisc): boolean {
	const nearestX = Math.max(box.left, Math.min(disc.x, box.right));
	const nearestY = Math.max(box.top, Math.min(disc.y, box.bottom));
	return (nearestX - disc.x) ** 2 + (nearestY - disc.y) ** 2 < (disc.radius + 1) ** 2;
}

export function placeLabels(
	candidates: LabelCandidate[],
	focus: { x: number; y: number } | null,
	width: number,
	/** Visible node circles; a label may not cover any node except its own. */
	discs: NodeDisc[] = [],
): Map<string, PlacedLabel> {
	const ordered = [...candidates].sort(
		(a, b) =>
			Number(b.selected) - Number(a.selected) ||
			b.priority - a.priority ||
			a.id.localeCompare(b.id, 'en-AU'),
	);
	const admitted: Box[] = [];
	const result = new Map<string, PlacedLabel>();
	for (const candidate of ordered) {
		const placed = labelOffset(candidate, candidate.selected, focus, width);
		const box = boxFor(candidate, placed);
		if (
			!candidate.selected &&
			(admitted.some((other) => overlaps(box, other)) ||
				discs.some((disc) => disc.id !== candidate.id && hitsDisc(box, disc)))
		)
			continue;
		admitted.push(box);
		result.set(candidate.id, placed);
	}
	return result;
}
