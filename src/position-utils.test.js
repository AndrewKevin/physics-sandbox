import { describe, it, expect } from 'vitest';
import { getPositionOnSegment, clampToCanvas, distance, snapToGrid } from './position-utils.js';

/**
 * Intent-focused tests describing real usage scenarios
 */
describe('Position Utils - User Intent', () => {
    describe('Placing a weight on a segment', () => {
        const bridge = {
            nodeA: { x: 100, y: 300 },
            nodeB: { x: 500, y: 300 }
        };

        it('clicking near left node places weight at start of segment', () => {
            const clickX = 110;
            const clickY = 300;
            const position = getPositionOnSegment(bridge, clickX, clickY);

            expect(position).toBeCloseTo(0.025, 2); // Very close to 0
        });

        it('clicking at centre places weight at midpoint', () => {
            const clickX = 300;
            const clickY = 300;
            const position = getPositionOnSegment(bridge, clickX, clickY);

            expect(position).toBe(0.5);
        });

        it('clicking above segment still projects correctly to midpoint', () => {
            // User clicks above the segment - should still find nearest point
            const clickX = 300;
            const clickY = 100; // Above the segment
            const position = getPositionOnSegment(bridge, clickX, clickY);

            expect(position).toBe(0.5); // Projects to midpoint
        });
    });

    describe('Keeping nodes within playable area', () => {
        const canvas = { width: 800, height: 540 };
        const nodeRadius = 12;

        it('node dragged into corner stays fully visible', () => {
            const result = clampToCanvas(0, 0, canvas, nodeRadius);

            // Node centre should be at least radius away from edge
            expect(result.x).toBeGreaterThanOrEqual(nodeRadius);
            expect(result.y).toBeGreaterThanOrEqual(nodeRadius);
        });

        it('node cannot be placed above the ceiling (top of buildable area)', () => {
            const result = clampToCanvas(400, 600, canvas, nodeRadius);

            // In Y-up coords: height is max Y, so clamp to height - radius
            expect(result.y).toBeLessThanOrEqual(canvas.height - nodeRadius);
        });
    });
});

describe('getPositionOnSegment', () => {
    const horizontalSegment = {
        nodeA: { x: 0, y: 50 },
        nodeB: { x: 100, y: 50 }
    };

    const verticalSegment = {
        nodeA: { x: 50, y: 0 },
        nodeB: { x: 50, y: 100 }
    };

    const diagonalSegment = {
        nodeA: { x: 0, y: 0 },
        nodeB: { x: 100, y: 100 }
    };

    it('returns 0 at nodeA position', () => {
        const result = getPositionOnSegment(horizontalSegment, 0, 50);
        expect(result).toBe(0);
    });

    it('returns 1 at nodeB position', () => {
        const result = getPositionOnSegment(horizontalSegment, 100, 50);
        expect(result).toBe(1);
    });

    it('returns 0.5 at midpoint of horizontal segment', () => {
        const result = getPositionOnSegment(horizontalSegment, 50, 50);
        expect(result).toBe(0.5);
    });

    it('returns 0.5 at midpoint of vertical segment', () => {
        const result = getPositionOnSegment(verticalSegment, 50, 50);
        expect(result).toBe(0.5);
    });

    it('returns 0.5 at midpoint of diagonal segment', () => {
        const result = getPositionOnSegment(diagonalSegment, 50, 50);
        expect(result).toBe(0.5);
    });

    it('clamps to 0 when point is before nodeA', () => {
        const result = getPositionOnSegment(horizontalSegment, -50, 50);
        expect(result).toBe(0);
    });

    it('clamps to 1 when point is after nodeB', () => {
        const result = getPositionOnSegment(horizontalSegment, 150, 50);
        expect(result).toBe(1);
    });

    it('returns 0.5 for zero-length segment', () => {
        const zeroLengthSegment = {
            nodeA: { x: 50, y: 50 },
            nodeB: { x: 50, y: 50 }
        };
        const result = getPositionOnSegment(zeroLengthSegment, 100, 100);
        expect(result).toBe(0.5);
    });

    it('projects perpendicular point onto segment', () => {
        // Point above the midpoint of horizontal segment
        const result = getPositionOnSegment(horizontalSegment, 50, 0);
        expect(result).toBe(0.5);
    });

    it('returns 0.25 at quarter position', () => {
        const result = getPositionOnSegment(horizontalSegment, 25, 50);
        expect(result).toBe(0.25);
    });
});

describe('clampToCanvas', () => {
    const bounds = { width: 800, height: 540 };

    it('returns unchanged position if within bounds', () => {
        const result = clampToCanvas(400, 300, bounds, 12);
        expect(result).toEqual({ x: 400, y: 300 });
    });

    it('clamps x below minimum', () => {
        const result = clampToCanvas(-10, 300, bounds, 12);
        expect(result.x).toBe(12);
        expect(result.y).toBe(300);
    });

    it('clamps x above maximum', () => {
        const result = clampToCanvas(850, 300, bounds, 12);
        expect(result.x).toBe(788);  // 800 - 12
        expect(result.y).toBe(300);
    });

    it('clamps y below minimum', () => {
        const result = clampToCanvas(400, -10, bounds, 12);
        expect(result.x).toBe(400);
        expect(result.y).toBe(12);
    });

    it('clamps y above ground', () => {
        const result = clampToCanvas(400, 600, bounds, 12);
        expect(result.x).toBe(400);
        expect(result.y).toBe(528);  // 540 - 12
    });

    it('clamps both x and y when both are out of bounds', () => {
        const result = clampToCanvas(-100, 700, bounds, 12);
        expect(result.x).toBe(12);
        expect(result.y).toBe(528);
    });

    it('uses zero radius when not specified', () => {
        const result = clampToCanvas(-10, 600, bounds);
        expect(result.x).toBe(0);
        expect(result.y).toBe(540);
    });

    it('handles edge case at exact boundary', () => {
        const result = clampToCanvas(12, 528, bounds, 12);
        expect(result).toEqual({ x: 12, y: 528 });
    });
});

describe('distance', () => {
    it('returns 0 for same point', () => {
        const result = distance({ x: 50, y: 50 }, { x: 50, y: 50 });
        expect(result).toBe(0);
    });

    it('calculates horizontal distance', () => {
        const result = distance({ x: 0, y: 0 }, { x: 100, y: 0 });
        expect(result).toBe(100);
    });

    it('calculates vertical distance', () => {
        const result = distance({ x: 0, y: 0 }, { x: 0, y: 100 });
        expect(result).toBe(100);
    });

    it('calculates diagonal distance (3-4-5 triangle)', () => {
        const result = distance({ x: 0, y: 0 }, { x: 3, y: 4 });
        expect(result).toBe(5);
    });

    it('handles negative coordinates', () => {
        const result = distance({ x: -50, y: -50 }, { x: 50, y: 50 });
        expect(result).toBeCloseTo(Math.sqrt(20000));
    });
});

describe('snapToGrid', () => {
    const gridSize = 20;

    it('snaps to nearest grid intersection', () => {
        const result = snapToGrid(25, 35, gridSize);
        expect(result).toEqual({ x: 20, y: 40 });
    });

    it('returns exact position if already on grid', () => {
        const result = snapToGrid(40, 60, gridSize);
        expect(result).toEqual({ x: 40, y: 60 });
    });

    it('snaps to origin when close to 0,0', () => {
        const result = snapToGrid(8, 5, gridSize);
        expect(result).toEqual({ x: 0, y: 0 });
    });

    it('rounds up when exactly at midpoint', () => {
        // Math.round(10/20) * 20 = 0.5 * 20 = 10, rounds to 1, so 20
        const result = snapToGrid(10, 10, gridSize);
        expect(result).toEqual({ x: 20, y: 20 });
    });

    it('rounds down when just below midpoint', () => {
        const result = snapToGrid(9, 9, gridSize);
        expect(result).toEqual({ x: 0, y: 0 });
    });

    it('handles different grid sizes', () => {
        const result = snapToGrid(35, 45, 50);
        expect(result).toEqual({ x: 50, y: 50 });
    });

    it('handles large coordinates', () => {
        const result = snapToGrid(512, 738, gridSize);
        expect(result).toEqual({ x: 520, y: 740 });
    });
});

describe('Snap-to-grid near boundaries (clamp→snap→clamp pattern)', () => {
    const bounds = { width: 800, height: 540 };
    const radius = 12;
    const gridSize = 20;

    /**
     * Helper to apply clamp→snap→clamp pattern
     */
    function snapWithinBounds(x, y) {
        let pos = clampToCanvas(x, y, bounds, radius);
        pos = snapToGrid(pos.x, pos.y, gridSize);
        pos = clampToCanvas(pos.x, pos.y, bounds, radius);
        return pos;
    }

    /**
     * Check if a position is on a grid line
     */
    function isOnGrid(value) {
        return value % gridSize === 0;
    }

    it('snaps to grid when clicking near right edge', () => {
        // Click at x=792, which is > max X (788)
        // Clamp: 792 → 788
        // Snap: 788 → 780 (39.4 rounds to 39)
        // Re-clamp: 780 stays (within bounds)
        const result = snapWithinBounds(792, 300);

        expect(result.x).toBe(780);
        expect(isOnGrid(result.x)).toBe(true);
    });

    it('snaps to grid when clicking near bottom edge', () => {
        // Click at y=535, which is > max Y (528)
        // Clamp: 535 → 528
        // Snap: 528 → 520 (26.4 rounds to 26)
        // Re-clamp: 520 stays (within bounds)
        const result = snapWithinBounds(300, 535);

        expect(result.y).toBe(520);
        expect(isOnGrid(result.y)).toBe(true);
    });

    it('snaps to grid when clicking near top-left corner', () => {
        // Click at (5, 5), which is < min (12, 12)
        // Clamp: (5, 5) → (12, 12)
        // Snap: (12, 12) → (20, 20) (0.6 rounds to 1)
        // Re-clamp: (20, 20) stays
        const result = snapWithinBounds(5, 5);

        expect(result.x).toBe(20);
        expect(result.y).toBe(20);
        expect(isOnGrid(result.x)).toBe(true);
        expect(isOnGrid(result.y)).toBe(true);
    });

    it('final position is always on grid AND within bounds', () => {
        // Test several edge positions
        const edgeCases = [
            { x: 0, y: 0 },           // Top-left corner
            { x: 800, y: 0 },         // Top-right corner
            { x: 0, y: 540 },         // Bottom-left corner
            { x: 800, y: 540 },       // Bottom-right corner
            { x: 795, y: 300 },       // Near right edge
            { x: 300, y: 535 },       // Near bottom edge
        ];

        for (const { x, y } of edgeCases) {
            const result = snapWithinBounds(x, y);

            // Must be on grid
            expect(isOnGrid(result.x)).toBe(true);
            expect(isOnGrid(result.y)).toBe(true);

            // Must be within bounds
            expect(result.x).toBeGreaterThanOrEqual(radius);
            expect(result.x).toBeLessThanOrEqual(bounds.width - radius);
            expect(result.y).toBeGreaterThanOrEqual(radius);
            expect(result.y).toBeLessThanOrEqual(bounds.height - radius);
        }
    });
});
