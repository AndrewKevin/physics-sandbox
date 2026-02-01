import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DragController } from './drag-controller.js';

/**
 * Intent-focused tests that describe user stories
 */
describe('DragController - User Intent', () => {
    let controller;
    let mockNode;
    const bounds = { width: 800, groundY: 540 };
    const nodeRadius = 12;

    beforeEach(() => {
        mockNode = { x: 200, y: 200 };
        controller = new DragController({
            getBounds: () => bounds,
            getNodeRadius: () => nodeRadius,
            onDragMove: (node, pos) => {
                node.x = pos.x;
                node.y = pos.y;
            },
            onDragCancel: (node, originalPos) => {
                node.x = originalPos.x;
                node.y = originalPos.y;
            }
        });
    });

    describe('User clicks a node briefly', () => {
        it('should NOT move the node if mouse barely moves', () => {
            const originalX = mockNode.x;
            const originalY = mockNode.y;

            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 205, y: 202 }); // Slight movement
            controller.endDrag();

            // Node should NOT have moved
            expect(mockNode.x).toBe(originalX);
            expect(mockNode.y).toBe(originalY);
        });

        it('should allow click to proceed normally', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 202, y: 200 }); // Tiny movement
            controller.endDrag();

            expect(controller.shouldSuppressClick).toBe(false);
        });
    });

    describe('User drags a node to a new position', () => {
        it('should move node to follow the mouse', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 300, y: 250 }); // Significant movement

            expect(mockNode.x).toBe(300);
            expect(mockNode.y).toBe(250);
        });

        it('should prevent accidental click after releasing drag', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 300, y: 250 });
            controller.endDrag();

            expect(controller.shouldSuppressClick).toBe(true);
        });
    });

    describe('User drags a node to the edge of canvas', () => {
        it('should stop node at left edge, not beyond', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: -100, y: 200 }); // Try to drag off left

            expect(mockNode.x).toBe(nodeRadius); // Clamped to radius
        });

        it('should stop node at right edge, not beyond', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 1000, y: 200 }); // Try to drag off right

            expect(mockNode.x).toBe(bounds.width - nodeRadius);
        });

        it('should stop node at ground level, not below', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 200, y: 700 }); // Try to drag below ground

            expect(mockNode.y).toBe(bounds.groundY - nodeRadius);
        });

        it('should stop node at top edge, not above', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 200, y: -100 }); // Try to drag above top

            expect(mockNode.y).toBe(nodeRadius);
        });
    });

    describe('User presses ESC while dragging', () => {
        it('should return node to its original position', () => {
            const originalX = mockNode.x;
            const originalY = mockNode.y;

            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 400, y: 300 }); // Drag far away

            expect(mockNode.x).toBe(400); // Node is at new position
            expect(mockNode.y).toBe(300);

            controller.cancelDrag();

            // Node should be back to original
            expect(mockNode.x).toBe(originalX);
            expect(mockNode.y).toBe(originalY);
        });

        it('should allow immediate re-selection without click suppression', () => {
            controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
            controller.updateDrag({ x: 400, y: 300 });
            controller.cancelDrag();

            expect(controller.shouldSuppressClick).toBe(false);
        });
    });

    describe('User rapidly clicks same node multiple times', () => {
        it('should handle repeated begin/end cycles gracefully', () => {
            for (let i = 0; i < 5; i++) {
                controller.beginPotentialDrag(mockNode, { x: 200, y: 200 });
                controller.endDrag();
            }

            expect(controller.isActive).toBe(false);
            expect(controller.isTracking).toBe(false);
        });
    });
});

describe('DragController', () => {
    let controller;
    let mockCallbacks;
    const mockBounds = { width: 800, groundY: 540 };
    const mockNodeRadius = 12;

    beforeEach(() => {
        mockCallbacks = {
            onDragStart: vi.fn(),
            onDragMove: vi.fn(),
            onDragEnd: vi.fn(),
            onDragCancel: vi.fn()
        };

        controller = new DragController({
            getBounds: () => mockBounds,
            getNodeRadius: () => mockNodeRadius,
            ...mockCallbacks
        });
    });

    describe('initial state', () => {
        it('should not be dragging initially', () => {
            expect(controller.isActive).toBe(false);
        });

        it('should not be tracking initially', () => {
            expect(controller.isTracking).toBe(false);
        });

        it('should not suppress clicks initially', () => {
            expect(controller.shouldSuppressClick).toBe(false);
        });
    });

    describe('beginPotentialDrag', () => {
        it('should start tracking a node', () => {
            const node = { x: 100, y: 100 };
            controller.beginPotentialDrag(node, { x: 100, y: 100 });

            expect(controller.isTracking).toBe(true);
            expect(controller.currentNode).toBe(node);
            expect(controller.isActive).toBe(false); // Not dragging yet
        });

        it('should store original node position', () => {
            const node = { x: 100, y: 200 };
            controller.beginPotentialDrag(node, { x: 100, y: 200 });

            // Original position stored internally for cancellation
            expect(controller.dragStartNodePos).toEqual({ x: 100, y: 200 });
        });
    });

    describe('updateDrag', () => {
        const node = { x: 100, y: 100 };

        beforeEach(() => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
        });

        it('should not start drag below threshold', () => {
            const result = controller.updateDrag({ x: 105, y: 100 });

            expect(result.isDragging).toBe(false);
            expect(result.shouldStartDrag).toBe(false);
            expect(controller.isActive).toBe(false);
            expect(mockCallbacks.onDragStart).not.toHaveBeenCalled();
        });

        it('should start drag after threshold exceeded', () => {
            const result = controller.updateDrag({ x: 120, y: 100 });

            expect(result.isDragging).toBe(true);
            expect(result.shouldStartDrag).toBe(true);
            expect(controller.isActive).toBe(true);
            expect(mockCallbacks.onDragStart).toHaveBeenCalledWith(node);
        });

        it('should call onDragMove with clamped position', () => {
            controller.updateDrag({ x: 120, y: 100 });

            expect(mockCallbacks.onDragMove).toHaveBeenCalledWith(
                node,
                expect.objectContaining({ x: 120, y: 100 })
            );
        });

        it('should clamp position to canvas bounds', () => {
            controller.updateDrag({ x: 120, y: 100 }); // Start drag first

            controller.updateDrag({ x: 900, y: 600 }); // Out of bounds

            expect(mockCallbacks.onDragMove).toHaveBeenLastCalledWith(
                node,
                { x: 788, y: 528 } // Clamped: 800-12, 540-12
            );
        });

        it('should not call onDragStart on subsequent moves', () => {
            controller.updateDrag({ x: 120, y: 100 }); // First drag move
            mockCallbacks.onDragStart.mockClear();

            controller.updateDrag({ x: 130, y: 100 }); // Second drag move

            expect(mockCallbacks.onDragStart).not.toHaveBeenCalled();
        });

        it('should return null when not tracking', () => {
            const freshController = new DragController();
            const result = freshController.updateDrag({ x: 100, y: 100 });

            expect(result).toEqual({
                isDragging: false,
                shouldStartDrag: false,
                clampedPos: null,
                isMultiDrag: false
            });
        });
    });

    describe('endDrag', () => {
        const node = { x: 100, y: 100 };

        it('should end drag and call onDragEnd', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 120, y: 100 }); // Start drag

            const result = controller.endDrag();

            expect(result.wasDrag).toBe(true);
            expect(result.node).toBe(node);
            expect(controller.isActive).toBe(false);
            expect(controller.isTracking).toBe(false);
            expect(mockCallbacks.onDragEnd).toHaveBeenCalledWith(node);
        });

        it('should set shouldSuppressClick after drag', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 120, y: 100 });
            controller.endDrag();

            expect(controller.shouldSuppressClick).toBe(true);
        });

        it('should not call onDragEnd if was just tracking (not dragging)', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            // No updateDrag call - never started dragging

            const result = controller.endDrag();

            expect(result.wasDrag).toBe(false);
            expect(mockCallbacks.onDragEnd).not.toHaveBeenCalled();
        });
    });

    describe('cancelDrag', () => {
        const node = { x: 100, y: 100 };

        it('should cancel drag and call onDragCancel with original position', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 200, y: 200 }); // Start drag

            const result = controller.cancelDrag();

            expect(result.wasDrag).toBe(true);
            expect(result.node).toBe(node);
            expect(result.originalPos).toEqual({ x: 100, y: 100 });
            expect(mockCallbacks.onDragCancel).toHaveBeenCalledWith(
                node,
                { x: 100, y: 100 }
            );
        });

        it('should clear all state after cancel', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 200, y: 200 });
            controller.cancelDrag();

            expect(controller.isActive).toBe(false);
            expect(controller.isTracking).toBe(false);
            expect(controller.shouldSuppressClick).toBe(false);
        });

        it('should not call onDragCancel if was just tracking', () => {
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            // No drag started

            controller.cancelDrag();

            expect(mockCallbacks.onDragCancel).not.toHaveBeenCalled();
        });
    });

    describe('clearClickSuppression', () => {
        it('should clear the suppression flag', () => {
            const node = { x: 100, y: 100 };
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 120, y: 100 });
            controller.endDrag();

            expect(controller.shouldSuppressClick).toBe(true);
            controller.clearClickSuppression();
            expect(controller.shouldSuppressClick).toBe(false);
        });
    });

    describe('reset', () => {
        it('should clear all state', () => {
            const node = { x: 100, y: 100 };
            controller.beginPotentialDrag(node, { x: 100, y: 100 });
            controller.updateDrag({ x: 120, y: 100 });

            controller.reset();

            expect(controller.isActive).toBe(false);
            expect(controller.isTracking).toBe(false);
            expect(controller.shouldSuppressClick).toBe(false);
            expect(controller.currentNode).toBe(null);
        });
    });

    describe('threshold value', () => {
        it('should use static TAP_THRESHOLD of 15', () => {
            expect(DragController.TAP_THRESHOLD).toBe(15);
        });

        it('should start drag at exactly threshold + 1', () => {
            const node = { x: 100, y: 100 };
            controller.beginPotentialDrag(node, { x: 100, y: 100 });

            // Move exactly threshold (15) - should not start
            let result = controller.updateDrag({ x: 115, y: 100 });
            expect(result.isDragging).toBe(false);

            // Move just past threshold
            result = controller.updateDrag({ x: 116, y: 100 });
            expect(result.isDragging).toBe(true);
        });
    });

    describe('snap to grid', () => {
        let snapController;
        let snapCallbacks;

        beforeEach(() => {
            snapCallbacks = {
                getBounds: () => ({ width: 800, groundY: 540 }),
                getNodeRadius: () => 12,
                getSnapEnabled: () => true,
                getGridSize: () => 20,
                onDragStart: vi.fn(),
                onDragMove: vi.fn(),
                onDragEnd: vi.fn(),
                onDragCancel: vi.fn()
            };
            snapController = new DragController(snapCallbacks);
        });

        it('should snap position to grid when enabled', () => {
            const node = { x: 100, y: 100 };
            snapController.beginPotentialDrag(node, { x: 100, y: 100 });
            snapController.updateDrag({ x: 125, y: 135 }); // Should snap to 120, 140

            expect(snapCallbacks.onDragMove).toHaveBeenCalledWith(
                node,
                { x: 120, y: 140 }
            );
        });

        it('should not snap when disabled', () => {
            snapCallbacks.getSnapEnabled = () => false;
            const noSnapController = new DragController(snapCallbacks);

            const node = { x: 100, y: 100 };
            noSnapController.beginPotentialDrag(node, { x: 100, y: 100 });
            noSnapController.updateDrag({ x: 125, y: 135 });

            expect(snapCallbacks.onDragMove).toHaveBeenCalledWith(
                node,
                { x: 125, y: 135 }
            );
        });

        it('should clamp after snapping if position goes out of bounds', () => {
            const node = { x: 100, y: 100 };
            snapController.beginPotentialDrag(node, { x: 100, y: 100 });
            // 795 clamps to 788 first, then snaps to 780 (788/20 = 39.4 rounds to 39)
            // 780 is within bounds so stays at 780
            snapController.updateDrag({ x: 795, y: 100 });

            expect(snapCallbacks.onDragMove).toHaveBeenCalledWith(
                node,
                { x: 780, y: 100 }
            );
        });
    });
});

describe('DragController - Multi-node drag', () => {
    let controller;
    let mockCallbacks;
    let node1, node2, node3;

    beforeEach(() => {
        node1 = { x: 100, y: 100, selected: true };
        node2 = { x: 200, y: 100, selected: true };
        node3 = { x: 150, y: 200, selected: true };

        mockCallbacks = {
            getBounds: () => ({ width: 800, groundY: 540 }),
            getNodeRadius: () => 12,
            getSnapEnabled: () => false,
            getGridSize: () => 20,
            getSelectedNodes: () => [node1, node2, node3],
            onDragStart: vi.fn(),
            onDragMove: vi.fn(),
            onMultiDragMove: vi.fn(),
            onDragEnd: vi.fn(),
            onMultiDragEnd: vi.fn(),
            onDragCancel: vi.fn()
        };
        controller = new DragController(mockCallbacks);
    });

    describe('beginPotentialDrag with multi-selection', () => {
        it('should track all selected nodes when dragging a selected node', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });

            expect(controller.draggedNodes).toHaveLength(3);
            expect(controller.draggedNodes).toContain(node1);
            expect(controller.draggedNodes).toContain(node2);
            expect(controller.draggedNodes).toContain(node3);
        });

        it('should store offsets from mouse position for each node', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });

            expect(controller.nodeOffsets.get(node1)).toEqual({ dx: 0, dy: 0 });
            expect(controller.nodeOffsets.get(node2)).toEqual({ dx: 100, dy: 0 });
            expect(controller.nodeOffsets.get(node3)).toEqual({ dx: 50, dy: 100 });
        });

        it('should track single node if dragging unselected node', () => {
            const unselectedNode = { x: 300, y: 300, selected: false };
            mockCallbacks.getSelectedNodes = () => [node1, node2]; // unselectedNode not in list

            controller.beginPotentialDrag(unselectedNode, { x: 300, y: 300 });

            expect(controller.draggedNodes).toHaveLength(1);
            expect(controller.draggedNodes).toContain(unselectedNode);
        });
    });

    describe('updateDrag with multi-selection', () => {
        it('should call onMultiDragMove with positions for all nodes', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            controller.updateDrag({ x: 150, y: 150 }); // Move mouse by (50, 50)

            expect(mockCallbacks.onMultiDragMove).toHaveBeenCalled();
            const positions = mockCallbacks.onMultiDragMove.mock.calls[0][0];

            expect(positions.get(node1)).toEqual({ x: 150, y: 150 });
            expect(positions.get(node2)).toEqual({ x: 250, y: 150 });
            expect(positions.get(node3)).toEqual({ x: 200, y: 250 });
        });

        it('should return isMultiDrag true when multi-dragging', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            const result = controller.updateDrag({ x: 150, y: 150 });

            expect(result.isMultiDrag).toBe(true);
        });

        it('should clamp each node independently to canvas bounds', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            // Move far right - node2 should hit the edge
            controller.updateDrag({ x: 700, y: 100 });

            const positions = mockCallbacks.onMultiDragMove.mock.calls[0][0];
            // node1 at 700, node2 at 800 but clamped to 788
            expect(positions.get(node1).x).toBe(700);
            expect(positions.get(node2).x).toBe(788); // clamped
        });
    });

    describe('endDrag with multi-selection', () => {
        it('should call onMultiDragEnd with all dragged nodes', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            controller.updateDrag({ x: 150, y: 150 });
            const result = controller.endDrag();

            expect(mockCallbacks.onMultiDragEnd).toHaveBeenCalledWith([node1, node2, node3]);
            expect(result.wasMultiDrag).toBe(true);
            expect(result.nodes).toHaveLength(3);
        });

        it('should clear multi-drag state after ending', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            controller.updateDrag({ x: 150, y: 150 });
            controller.endDrag();

            expect(controller.draggedNodes).toHaveLength(0);
            expect(controller.nodeOffsets.size).toBe(0);
        });
    });

    describe('cancelDrag with multi-selection', () => {
        it('should call onDragCancel for each node with original positions', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            controller.updateDrag({ x: 150, y: 150 });
            controller.cancelDrag();

            expect(mockCallbacks.onDragCancel).toHaveBeenCalledTimes(3);
            expect(mockCallbacks.onDragCancel).toHaveBeenCalledWith(node1, { x: 100, y: 100 });
            expect(mockCallbacks.onDragCancel).toHaveBeenCalledWith(node2, { x: 200, y: 100 });
            expect(mockCallbacks.onDragCancel).toHaveBeenCalledWith(node3, { x: 150, y: 200 });
        });

        it('should return wasMultiDrag true', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });
            controller.updateDrag({ x: 150, y: 150 });
            const result = controller.cancelDrag();

            expect(result.wasMultiDrag).toBe(true);
        });
    });

    describe('isMultiDrag getter', () => {
        it('should return false initially', () => {
            expect(controller.isMultiDrag).toBe(false);
        });

        it('should return true when multiple nodes are being dragged', () => {
            controller.beginPotentialDrag(node1, { x: 100, y: 100 });

            expect(controller.isMultiDrag).toBe(true);
        });

        it('should return false when single node is being dragged', () => {
            // Create a new controller with only one selected node
            const singleSelectController = new DragController({
                ...mockCallbacks,
                getSelectedNodes: () => [node1]
            });
            singleSelectController.beginPotentialDrag(node1, { x: 100, y: 100 });

            expect(singleSelectController.isMultiDrag).toBe(false);
        });
    });
});
