import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClipboardController } from './clipboard-controller.js';

/**
 * Tests for ClipboardController - copy/paste state machine
 */
describe('ClipboardController', () => {
    let controller;
    let options;
    let mockNodes;
    let mockSegments;

    beforeEach(() => {
        // Create mock nodes
        mockNodes = [
            { x: 100, y: 100, fixed: false, mass: 5 },
            { x: 200, y: 100, fixed: true, mass: 10 },
            { x: 150, y: 200, fixed: false, mass: 5 }
        ];

        // Create mock segments between nodes
        mockSegments = [
            {
                nodeA: mockNodes[0],
                nodeB: mockNodes[1],
                material: 'beam',
                stiffness: 0.9,
                damping: 0.1,
                compressionOnly: false,
                tensionOnly: false
            },
            {
                nodeA: mockNodes[1],
                nodeB: mockNodes[2],
                material: 'cable',
                stiffness: 0.7,
                damping: 0.02,
                compressionOnly: false,
                tensionOnly: true
            }
        ];

        options = {
            getSelectedNodes: vi.fn(() => mockNodes),
            getSegmentsBetweenNodes: vi.fn(() => mockSegments),
            createNode: vi.fn((x, y, fixed, mass) => ({ x, y, fixed, mass })),
            createSegment: vi.fn((nodeA, nodeB, material, props) => ({
                nodeA, nodeB, material, ...props
            })),
            onPasteStart: vi.fn(),
            onPasteMove: vi.fn(),
            onPasteEnd: vi.fn(),
            onPasteCancel: vi.fn()
        };

        controller = new ClipboardController(options);
    });

    describe('Initial state', () => {
        it('should start with empty clipboard', () => {
            expect(controller.hasContent).toBe(false);
            expect(controller.clipboardNodeCount).toBe(0);
        });

        it('should start not in paste mode', () => {
            expect(controller.isActive).toBe(false);
        });
    });

    describe('Copy operation', () => {
        it('should copy selected nodes with relative positions', () => {
            const result = controller.copy();

            expect(result).toBe(true);
            expect(controller.hasContent).toBe(true);
            expect(controller.clipboardNodeCount).toBe(3);
        });

        it('should store node properties (fixed, mass)', () => {
            controller.copy();
            controller.startPaste({ x: 0, y: 0 });

            const preview = controller.getPreviewData();

            // Check that fixed property is preserved
            expect(preview.nodes[1].fixed).toBe(true);
            expect(preview.nodes[0].fixed).toBe(false);
        });

        it('should copy segments between selected nodes', () => {
            controller.copy();

            expect(controller.clipboardSegmentCount).toBe(2);
        });

        it('should return false when no nodes selected', () => {
            options.getSelectedNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            const result = controller.copy();

            expect(result).toBe(false);
            expect(controller.hasContent).toBe(false);
        });

        it('should calculate centroid correctly', () => {
            // Nodes at (100,100), (200,100), (150,200)
            // Centroid should be at (150, 133.33)
            controller.copy();
            controller.startPaste({ x: 150, y: 133.33 });

            const preview = controller.getPreviewData();

            // First node should be at approximately original position
            expect(preview.nodes[0].x).toBeCloseTo(100, 0);
            expect(preview.nodes[0].y).toBeCloseTo(100, 0);
        });
    });

    describe('Paste preview mode', () => {
        beforeEach(() => {
            controller.copy();
        });

        it('should start paste preview with initial position', () => {
            const result = controller.startPaste({ x: 300, y: 300 });

            expect(result).toBe(true);
            expect(controller.isActive).toBe(true);
            expect(options.onPasteStart).toHaveBeenCalled();
        });

        it('should return false when clipboard is empty', () => {
            controller.reset();

            const result = controller.startPaste({ x: 300, y: 300 });

            expect(result).toBe(false);
            expect(controller.isActive).toBe(false);
        });

        it('should update preview position on mouse move', () => {
            controller.startPaste({ x: 300, y: 300 });

            const preview = controller.updatePreview({ x: 400, y: 400 });

            expect(preview).not.toBeNull();
            expect(options.onPasteMove).toHaveBeenCalledWith(preview);
        });

        it('should return preview data with node positions', () => {
            controller.startPaste({ x: 300, y: 300 });

            const preview = controller.getPreviewData();

            expect(preview.nodes).toHaveLength(3);
            expect(preview.segments).toHaveLength(2);
        });

        it('should maintain relative positions in preview', () => {
            controller.startPaste({ x: 0, y: 0 });
            const preview1 = controller.getPreviewData();

            controller.updatePreview({ x: 100, y: 100 });
            const preview2 = controller.getPreviewData();

            // All nodes should move by the same offset
            const dx = preview2.nodes[0].x - preview1.nodes[0].x;
            const dy = preview2.nodes[0].y - preview1.nodes[0].y;

            expect(dx).toBe(100);
            expect(dy).toBe(100);

            // Check other nodes moved by same amount
            expect(preview2.nodes[1].x - preview1.nodes[1].x).toBe(100);
            expect(preview2.nodes[2].y - preview1.nodes[2].y).toBe(100);
        });

        it('should return null from updatePreview when not pasting', () => {
            const preview = controller.updatePreview({ x: 300, y: 300 });

            expect(preview).toBeNull();
        });
    });

    describe('Commit paste', () => {
        beforeEach(() => {
            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
        });

        it('should create nodes at preview positions', () => {
            controller.commitPaste();

            expect(options.createNode).toHaveBeenCalledTimes(3);
        });

        it('should pass node properties to createNode', () => {
            controller.commitPaste();

            // Second node was fixed with mass 10
            const calls = options.createNode.mock.calls;
            const fixedNodeCall = calls[1];
            expect(fixedNodeCall[2]).toBe(true); // fixed
            expect(fixedNodeCall[3]).toBe(10); // mass
        });

        it('should create segments between new nodes', () => {
            controller.commitPaste();

            expect(options.createSegment).toHaveBeenCalledTimes(2);
        });

        it('should pass segment properties to createSegment', () => {
            controller.commitPaste();

            const calls = options.createSegment.mock.calls;

            // First segment should be beam
            expect(calls[0][2]).toBe('beam');

            // Second segment should be cable with tensionOnly
            expect(calls[1][2]).toBe('cable');
            expect(calls[1][3].tensionOnly).toBe(true);
        });

        it('should call onPasteEnd with created elements', () => {
            const result = controller.commitPaste();

            expect(options.onPasteEnd).toHaveBeenCalled();
            expect(result.nodes).toHaveLength(3);
            expect(result.segments).toHaveLength(2);
        });

        it('should exit paste mode after commit', () => {
            controller.commitPaste();

            expect(controller.isActive).toBe(false);
        });

        it('should return null when not in paste mode', () => {
            controller.cancelPaste();

            const result = controller.commitPaste();

            expect(result).toBeNull();
        });
    });

    describe('Cancel paste', () => {
        beforeEach(() => {
            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
        });

        it('should exit paste mode', () => {
            controller.cancelPaste();

            expect(controller.isActive).toBe(false);
        });

        it('should call onPasteCancel', () => {
            controller.cancelPaste();

            expect(options.onPasteCancel).toHaveBeenCalled();
        });

        it('should not create any nodes or segments', () => {
            controller.cancelPaste();

            expect(options.createNode).not.toHaveBeenCalled();
            expect(options.createSegment).not.toHaveBeenCalled();
        });

        it('should preserve clipboard for future pastes', () => {
            controller.cancelPaste();

            expect(controller.hasContent).toBe(true);

            // Can start a new paste
            const result = controller.startPaste({ x: 400, y: 400 });
            expect(result).toBe(true);
        });
    });

    describe('Reset', () => {
        it('should clear clipboard', () => {
            controller.copy();
            controller.reset();

            expect(controller.hasContent).toBe(false);
        });

        it('should cancel paste mode', () => {
            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
            controller.reset();

            expect(controller.isActive).toBe(false);
        });
    });

    describe('Centroid calculation', () => {
        it('should return origin for empty array', () => {
            const centroid = controller.calculateCentroid([]);

            expect(centroid.x).toBe(0);
            expect(centroid.y).toBe(0);
        });

        it('should return node position for single node', () => {
            const centroid = controller.calculateCentroid([{ x: 100, y: 200 }]);

            expect(centroid.x).toBe(100);
            expect(centroid.y).toBe(200);
        });

        it('should return average for multiple nodes', () => {
            const nodes = [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 50, y: 100 }
            ];

            const centroid = controller.calculateCentroid(nodes);

            expect(centroid.x).toBe(50);
            expect(centroid.y).toBeCloseTo(33.33, 1);
        });
    });

    describe('Edge cases', () => {
        it('should handle single node copy', () => {
            options.getSelectedNodes.mockReturnValue([mockNodes[0]]);
            options.getSegmentsBetweenNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            expect(result.nodes).toHaveLength(1);
            expect(result.segments).toHaveLength(0);
        });

        it('should handle nodes without segments', () => {
            options.getSegmentsBetweenNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            expect(result.nodes).toHaveLength(3);
            expect(result.segments).toHaveLength(0);
        });

        it('should handle createNode returning null', () => {
            options.createNode.mockReturnValue(null);
            controller = new ClipboardController(options);

            controller.copy();
            controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            // Should still return result structure, but with empty arrays
            expect(result.nodes).toHaveLength(0);
            expect(result.segments).toHaveLength(0);
        });
    });
});
