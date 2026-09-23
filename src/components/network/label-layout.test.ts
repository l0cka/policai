import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelCandidate } from './label-layout';

const node = (id: string, x: number, y: number, priority = 0, selected = false): LabelCandidate => ({
	id, x, y, radius: 8, text: `Label for ${id}`, priority, selected,
});

describe('placeLabels', () => {
	it('drops the lower-priority of two overlapping labels', () => {
		const placed = placeLabels([node('a', 100, 100, 5), node('b', 102, 102, 1)], null, 800);
		expect([...placed.keys()]).toEqual(['a']);
	});

	it('keeps labels that do not collide', () => {
		const placed = placeLabels([node('a', 100, 100), node('b', 100, 300)], null, 800);
		expect(placed.size).toBe(2);
	});

	it('always keeps the selected label, even when crowded', () => {
		const placed = placeLabels([node('a', 100, 100, 99), node('sel', 101, 101, 0, true)], null, 800);
		expect(placed.has('sel')).toBe(true);
	});

	it('does not print a label across another node', () => {
		// "a" sits left of centre, so its label runs to the right, across "b".
		const placed = placeLabels(
			[node('a', 100, 100)],
			null,
			800,
			[{ id: 'a', x: 100, y: 100, radius: 8 }, { id: 'b', x: 150, y: 100, radius: 8 }],
		);
		expect(placed.has('a')).toBe(false);
	});

	it('places the selected label centred below its node', () => {
		const placed = placeLabels([node('sel', 400, 200, 0, true)], { x: 400, y: 200 }, 800);
		expect(placed.get('sel')).toEqual({ x: 0, y: 25, anchor: 'middle' });
	});
});
