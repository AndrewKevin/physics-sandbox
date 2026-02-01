/**
 * Position Utilities
 * Pure mathematical functions for position calculations
 */

/**
 * Calculate the position (0-1) of a point projected onto a segment.
 * @param {Object} segment - Segment with nodeA and nodeB properties
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @returns {number} Position along segment (0 = nodeA, 1 = nodeB)
 */
export function getPositionOnSegment(segment, px, py) {
    const x1 = segment.nodeA.x;
    const y1 = segment.nodeA.y;
    const x2 = segment.nodeB.x;
    const y2 = segment.nodeB.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    // Degenerate case: segment has zero length
    if (lenSq === 0) return 0.5;

    const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    return Math.max(0, Math.min(1, t));
}

/**
 * Clamp a position to canvas bounds, accounting for element radius.
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} bounds - Canvas bounds { width, groundY }
 * @param {number} [radius=0] - Element radius to keep within bounds
 * @returns {{x: number, y: number}} Clamped position
 */
export function clampToCanvas(x, y, bounds, radius = 0) {
    const minX = radius;
    const maxX = bounds.width - radius;
    const minY = radius;
    const maxY = bounds.groundY - radius;

    return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y))
    };
}

/**
 * Calculate distance between two points.
 * @param {Object} posA - First position { x, y }
 * @param {Object} posB - Second position { x, y }
 * @returns {number} Distance between points
 */
export function distance(posA, posB) {
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    return Math.sqrt(dx * dx + dy * dy);
}
