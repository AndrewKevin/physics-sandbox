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
    let mockNodeWeights;
    let mockSegmentWeights;

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

        // Create mock weights
        mockNodeWeights = [
            { attachedToNode: mockNodes[0], attachedToSegment: null, position: 0, mass: 15 }
        ];
        mockSegmentWeights = [
            { attachedToNode: null, attachedToSegment: mockSegments[0], position: 0.3, mass: 25 }
        ];

        options = {
            getSelectedNodes: vi.fn(() => mockNodes),
            getSegmentsBetweenNodes: vi.fn(() => mockSegments),
            getWeightsForNodes: vi.fn(() => mockNodeWeights),
            getWeightsForSegments: vi.fn(() => mockSegmentWeights),
            createNode: vi.fn((x, y, fixed, mass) => ({ x, y, fixed, mass })),
            createSegment: vi.fn((nodeA, nodeB, material, props) => ({
                nodeA, nodeB, material, ...props
            })),
            createWeight: vi.fn((target, position, mass) => ({ target, position, mass })),
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

        it('should store node properties (fixed, mass)', async () => {
            controller.copy();
            await controller.startPaste({ x: 0, y: 0 });

            const preview = controller.getPreviewData();

            // Check that fixed property is preserved
            expect(preview.nodes[1].fixed).toBe(true);
            expect(preview.nodes[0].fixed).toBe(false);
        });

        it('should copy segments between selected nodes', () => {
            controller.copy();

            expect(controller.clipboardSegmentCount).toBe(2);
        });

        it('should copy weights attached to nodes', () => {
            controller.copy();

            expect(controller.clipboardWeightCount).toBe(2); // 1 node weight + 1 segment weight
        });

        it('should copy weights attached to segments', () => {
            controller.copy();

            // Weight count includes both node and segment weights
            expect(controller.clipboardWeightCount).toBeGreaterThanOrEqual(1);
        });

        it('should return false when no nodes selected', () => {
            options.getSelectedNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            const result = controller.copy();

            expect(result).toBe(false);
            expect(controller.hasContent).toBe(false);
        });

        it('should calculate centroid correctly', async () => {
            // Nodes at (100,100), (200,100), (150,200)
            // Centroid should be at (150, 133.33)
            controller.copy();
            await controller.startPaste({ x: 150, y: 133.33 });

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

        it('should start paste preview with initial position', async () => {
            const result = await controller.startPaste({ x: 300, y: 300 });

            expect(result).toBe(true);
            expect(controller.isActive).toBe(true);
            expect(options.onPasteStart).toHaveBeenCalled();
        });

        it('should return false when clipboard is empty', async () => {
            controller.reset();

            const result = await controller.startPaste({ x: 300, y: 300 });

            expect(result).toBe(false);
            expect(controller.isActive).toBe(false);
        });

        it('should update preview position on mouse move', async () => {
            await controller.startPaste({ x: 300, y: 300 });

            const preview = controller.updatePreview({ x: 400, y: 400 });

            expect(preview).not.toBeNull();
            expect(options.onPasteMove).toHaveBeenCalledWith(preview);
        });

        it('should return preview data with node positions', async () => {
            await controller.startPaste({ x: 300, y: 300 });

            const preview = controller.getPreviewData();

            expect(preview.nodes).toHaveLength(3);
            expect(preview.segments).toHaveLength(2);
        });

        it('should maintain relative positions in preview', async () => {
            await controller.startPaste({ x: 0, y: 0 });
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
        beforeEach(async () => {
            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
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
            expect(result.weights).toHaveLength(2);
        });

        it('should create weights attached to new nodes', () => {
            controller.commitPaste();

            // One node weight should be created
            expect(options.createWeight).toHaveBeenCalled();
            const nodeWeightCall = options.createWeight.mock.calls.find(
                call => call[0].x !== undefined // node targets have x property
            );
            expect(nodeWeightCall).toBeDefined();
            expect(nodeWeightCall[2]).toBe(15); // mass
        });

        it('should create weights attached to new segments', () => {
            controller.commitPaste();

            // One segment weight should be created with position 0.3
            const segmentWeightCall = options.createWeight.mock.calls.find(
                call => call[0].nodeA !== undefined // segment targets have nodeA property
            );
            expect(segmentWeightCall).toBeDefined();
            expect(segmentWeightCall[1]).toBe(0.3); // position
            expect(segmentWeightCall[2]).toBe(25); // mass
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
        beforeEach(async () => {
            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
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

        it('should preserve clipboard for future pastes', async () => {
            controller.cancelPaste();

            expect(controller.hasContent).toBe(true);

            // Can start a new paste
            const result = await controller.startPaste({ x: 400, y: 400 });
            expect(result).toBe(true);
        });
    });

    describe('Reset', () => {
        it('should clear clipboard', () => {
            controller.copy();
            controller.reset();

            expect(controller.hasContent).toBe(false);
        });

        it('should cancel paste mode', async () => {
            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
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
        it('should handle single node copy', async () => {
            options.getSelectedNodes.mockReturnValue([mockNodes[0]]);
            options.getSegmentsBetweenNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            expect(result.nodes).toHaveLength(1);
            expect(result.segments).toHaveLength(0);
        });

        it('should handle nodes without segments', async () => {
            options.getSegmentsBetweenNodes.mockReturnValue([]);
            controller = new ClipboardController(options);

            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            expect(result.nodes).toHaveLength(3);
            expect(result.segments).toHaveLength(0);
        });

        it('should handle createNode returning null', async () => {
            options.createNode.mockReturnValue(null);
            controller = new ClipboardController(options);

            controller.copy();
            await controller.startPaste({ x: 300, y: 300 });
            const result = controller.commitPaste();

            // Should still return result structure, but with empty arrays
            expect(result.nodes).toHaveLength(0);
            expect(result.segments).toHaveLength(0);
        });
    });
});
