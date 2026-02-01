import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SelectionBoxController } from './selection-box-controller.js';

/**
 * Create mock nodes for testing.
 */
function createMockNodes() {
    return [
        { id: 0, x: 50, y: 50 },
        { id: 1, x: 150, y: 50 },
        { id: 2, x: 100, y: 150 },
        { id: 3, x: 300, y: 300 }
    ];
}

/**
 * Simple findNodesInRect implementation for testing.
 */
function createFindNodesInRect(nodes) {
    return (rect) => {
        const { x, y, width, height } = rect;
        const minX = x;
        const maxX = x + width;
        const minY = y;
        const maxY = y + height;

        return nodes.filter(node =>
            node.x >= minX && node.x <= maxX &&
            node.y >= minY && node.y <= maxY
        );
    };
}

describe('SelectionBoxController', () => {
    describe('constructor', () => {
        it('should initialise with default callbacks', () => {
            const controller = new SelectionBoxController();

            expect(controller.isSelecting).toBe(false);
            expect(controller.startPos).toBeNull();
            expect(controller.currentPos).toBeNull();
        });

        it('should accept custom callbacks', () => {
            const findNodesInRect = vi.fn(() => []);
            const onSelectionEnd = vi.fn();

            const controller = new SelectionBoxController({
                findNodesInRect,
                onSelectionEnd
            });

            expect(controller.findNodesInRect).toBe(findNodesInRect);
            expect(controller.onSelectionEnd).toBe(onSelectionEnd);
        });
    });

    describe('beginSelection', () => {
        it('should store start position', () => {
            const controller = new SelectionBoxController();

            controller.beginSelection({ x: 100, y: 200 });

            expect(controller.startPos).toEqual({ x: 100, y: 200 });
            expect(controller.currentPos).toEqual({ x: 100, y: 200 });
        });

        it('should track additive mode', () => {
            const controller = new SelectionBoxController();

            controller.beginSelection({ x: 100, y: 200 }, true);

            expect(controller.isAdditive).toBe(true);
        });

        it('should not immediately start selecting', () => {
            const controller = new SelectionBoxController();

            controller.beginSelection({ x: 100, y: 200 });

            expect(controller.isSelecting).toBe(false);
            expect(controller.isTracking).toBe(true);
        });
    });

    describe('updateSelection', () => {
        it('should return not selecting when below threshold', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 100, y: 100 });

            const result = controller.updateSelection({ x: 102, y: 102 });

            expect(result.isSelecting).toBe(false);
            expect(result.rect).toBeNull();
        });

        it('should start selecting when past threshold', () => {
            const onSelectionStart = vi.fn();
            const controller = new SelectionBoxController({ onSelectionStart });
            controller.beginSelection({ x: 100, y: 100 });

            const result = controller.updateSelection({ x: 110, y: 100 });

            expect(result.isSelecting).toBe(true);
            expect(result.rect).not.toBeNull();
            expect(onSelectionStart).toHaveBeenCalledOnce();
        });

        it('should call onSelectionMove with rect and nodes', () => {
            const nodes = createMockNodes();
            const onSelectionMove = vi.fn();
            const controller = new SelectionBoxController({
                findNodesInRect: createFindNodesInRect(nodes),
                onSelectionMove
            });
            controller.beginSelection({ x: 0, y: 0 });

            controller.updateSelection({ x: 200, y: 200 });

            expect(onSelectionMove).toHaveBeenCalled();
            const [rect, nodesInside] = onSelectionMove.mock.calls[0];
            expect(rect).toEqual({ x: 0, y: 0, width: 200, height: 200 });
            expect(nodesInside).toHaveLength(3); // nodes 0, 1, 2 are inside
        });

        it('should return nodes inside selection rect', () => {
            const nodes = createMockNodes();
            const controller = new SelectionBoxController({
                findNodesInRect: createFindNodesInRect(nodes)
            });
            controller.beginSelection({ x: 0, y: 0 });

            const result = controller.updateSelection({ x: 100, y: 100 });

            expect(result.nodesInside).toHaveLength(1); // Only node 0 at (50, 50)
        });

        it('should return empty when no tracking', () => {
            const controller = new SelectionBoxController();

            const result = controller.updateSelection({ x: 100, y: 100 });

            expect(result.isSelecting).toBe(false);
            expect(result.nodesInside).toEqual([]);
        });

        it('should only call onSelectionStart once', () => {
            const onSelectionStart = vi.fn();
            const controller = new SelectionBoxController({ onSelectionStart });
            controller.beginSelection({ x: 0, y: 0 });

            controller.updateSelection({ x: 20, y: 20 });
            controller.updateSelection({ x: 30, y: 30 });
            controller.updateSelection({ x: 40, y: 40 });

            expect(onSelectionStart).toHaveBeenCalledOnce();
        });
    });

    describe('endSelection', () => {
        it('should call onSelectionEnd with selected nodes', () => {
            const nodes = createMockNodes();
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({
                findNodesInRect: createFindNodesInRect(nodes),
                onSelectionEnd
            });
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 200, y: 200 });

            controller.endSelection();

            expect(onSelectionEnd).toHaveBeenCalledWith(
                expect.arrayContaining([nodes[0], nodes[1], nodes[2]]),
                false
            );
        });

        it('should pass additive flag to callback', () => {
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({
                findNodesInRect: () => [],
                onSelectionEnd
            });
            controller.beginSelection({ x: 0, y: 0 }, true);
            controller.updateSelection({ x: 20, y: 20 });

            controller.endSelection();

            expect(onSelectionEnd).toHaveBeenCalledWith([], true);
        });

        it('should reset state after ending', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });

            controller.endSelection();

            expect(controller.isSelecting).toBe(false);
            expect(controller.startPos).toBeNull();
            expect(controller.isTracking).toBe(false);
        });

        it('should not call onSelectionEnd if below threshold', () => {
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({ onSelectionEnd });
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 2, y: 2 }); // Below threshold

            const result = controller.endSelection();

            expect(onSelectionEnd).not.toHaveBeenCalled();
            expect(result.wasSelection).toBe(false);
        });

        it('should set wasJustSelecting for click suppression', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });

            controller.endSelection();

            expect(controller.shouldSuppressClick).toBe(true);
        });
    });

    describe('cancelSelection', () => {
        it('should call onSelectionCancel when active', () => {
            const onSelectionCancel = vi.fn();
            const controller = new SelectionBoxController({ onSelectionCancel });
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });

            controller.cancelSelection();

            expect(onSelectionCancel).toHaveBeenCalled();
        });

        it('should not call onSelectionCancel when not active', () => {
            const onSelectionCancel = vi.fn();
            const controller = new SelectionBoxController({ onSelectionCancel });
            controller.beginSelection({ x: 0, y: 0 });
            // Don't update past threshold

            controller.cancelSelection();

            expect(onSelectionCancel).not.toHaveBeenCalled();
        });

        it('should reset state', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });

            controller.cancelSelection();

            expect(controller.isSelecting).toBe(false);
            expect(controller.startPos).toBeNull();
        });
    });

    describe('getRect', () => {
        it('should return normalised rectangle', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 100, y: 100 });
            controller.currentPos = { x: 50, y: 50 };

            const rect = controller.getRect();

            expect(rect).toEqual({ x: 50, y: 50, width: 50, height: 50 });
        });

        it('should handle drag in any direction', () => {
            const controller = new SelectionBoxController();

            // Drag down-right
            controller.beginSelection({ x: 0, y: 0 });
            controller.currentPos = { x: 100, y: 100 };
            expect(controller.getRect()).toEqual({ x: 0, y: 0, width: 100, height: 100 });

            // Drag up-left
            controller.beginSelection({ x: 100, y: 100 });
            controller.currentPos = { x: 0, y: 0 };
            expect(controller.getRect()).toEqual({ x: 0, y: 0, width: 100, height: 100 });

            // Drag up-right
            controller.beginSelection({ x: 0, y: 100 });
            controller.currentPos = { x: 100, y: 0 };
            expect(controller.getRect()).toEqual({ x: 0, y: 0, width: 100, height: 100 });
        });

        it('should return null when not tracking', () => {
            const controller = new SelectionBoxController();

            expect(controller.getRect()).toBeNull();
        });
    });

    describe('isActive and isTracking', () => {
        it('should differentiate tracking from active selection', () => {
            const controller = new SelectionBoxController();

            // Initially neither
            expect(controller.isTracking).toBe(false);
            expect(controller.isActive).toBe(false);

            // After begin: tracking but not active
            controller.beginSelection({ x: 0, y: 0 });
            expect(controller.isTracking).toBe(true);
            expect(controller.isActive).toBe(false);

            // After threshold: both tracking and active
            controller.updateSelection({ x: 20, y: 20 });
            expect(controller.isTracking).toBe(true);
            expect(controller.isActive).toBe(true);
        });
    });

    describe('click suppression', () => {
        it('should suppress click after selection', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });
            controller.endSelection();

            expect(controller.shouldSuppressClick).toBe(true);

            controller.clearClickSuppression();

            expect(controller.shouldSuppressClick).toBe(false);
        });

        it('should not suppress click when cancelled', () => {
            const controller = new SelectionBoxController();
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 20, y: 20 });
            controller.cancelSelection();

            expect(controller.shouldSuppressClick).toBe(false);
        });
    });
});

describe('SelectionBoxController - User Intent', () => {
    describe('User draws selection box around nodes', () => {
        it('should select all nodes inside the box', () => {
            const nodes = createMockNodes();
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({
                findNodesInRect: createFindNodesInRect(nodes),
                onSelectionEnd
            });

            // User clicks and drags from top-left to cover 3 nodes
            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 200, y: 200 });
            controller.endSelection();

            expect(onSelectionEnd).toHaveBeenCalledTimes(1);
            const selectedNodes = onSelectionEnd.mock.calls[0][0];
            expect(selectedNodes).toContain(nodes[0]); // (50, 50)
            expect(selectedNodes).toContain(nodes[1]); // (150, 50)
            expect(selectedNodes).toContain(nodes[2]); // (100, 150)
            expect(selectedNodes).not.toContain(nodes[3]); // (300, 300) outside
        });
    });

    describe('User shift-drags to add to selection', () => {
        it('should pass additive flag for shift+drag', () => {
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({
                findNodesInRect: () => [],
                onSelectionEnd
            });

            controller.beginSelection({ x: 0, y: 0 }, true); // Shift held
            controller.updateSelection({ x: 100, y: 100 });
            controller.endSelection();

            const additive = onSelectionEnd.mock.calls[0][1];
            expect(additive).toBe(true);
        });
    });

    describe('User cancels selection with ESC', () => {
        it('should not select anything when cancelled', () => {
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({ onSelectionEnd });

            controller.beginSelection({ x: 0, y: 0 });
            controller.updateSelection({ x: 100, y: 100 });
            controller.cancelSelection();

            expect(onSelectionEnd).not.toHaveBeenCalled();
        });
    });

    describe('User clicks without dragging', () => {
        it('should not trigger selection for small movements', () => {
            const onSelectionEnd = vi.fn();
            const controller = new SelectionBoxController({ onSelectionEnd });

            controller.beginSelection({ x: 100, y: 100 });
            controller.updateSelection({ x: 102, y: 101 }); // Below MIN_SIZE
            controller.endSelection();

            expect(onSelectionEnd).not.toHaveBeenCalled();
        });
    });
});
