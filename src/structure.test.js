import { describe, it, expect, beforeEach } from 'vitest';
import { StructureManager, Node, Segment, Weight } from './structure.js';

describe('StructureManager - splitSegment', () => {
    let structure;

    beforeEach(() => {
        structure = new StructureManager();
        // Reset static IDs for predictable tests
        Node.nextId = 0;
        Segment.nextId = 0;
        Weight.nextId = 0;
    });

    describe('Basic splitting', () => {
        it('should create a new node at the split position', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node } = structure.splitSegment(segment, 0.5);

            expect(node.x).toBe(100);
            expect(node.y).toBe(100);
            expect(structure.nodes).toContain(node);
        });

        it('should create two new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(structure.segments).toHaveLength(2);
            expect(structure.segments).toContain(segmentA);
            expect(structure.segments).toContain(segmentB);
        });

        it('should remove the original segment', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            structure.splitSegment(segment, 0.5);

            expect(structure.segments).not.toContain(segment);
        });

        it('should connect new segments correctly', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node, segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            // First segment: nodeA to new node
            expect(segmentA.nodeA).toBe(nodeA);
            expect(segmentA.nodeB).toBe(node);

            // Second segment: new node to nodeB
            expect(segmentB.nodeA).toBe(node);
            expect(segmentB.nodeB).toBe(nodeB);
        });
    });

    describe('Position clamping', () => {
        it('should clamp split position to minimum 0.1', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node } = structure.splitSegment(segment, 0.05);

            // Should be clamped to 0.1, so x = 200 * 0.1 = 20
            expect(node.x).toBe(20);
        });

        it('should clamp split position to maximum 0.9', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node } = structure.splitSegment(segment, 0.95);

            // Should be clamped to 0.9, so x = 200 * 0.9 = 180
            expect(node.x).toBe(180);
        });
    });

    describe('Property preservation', () => {
        it('should preserve material on new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB, 'cable');

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(segmentA.material).toBe('cable');
            expect(segmentB.material).toBe('cable');
        });

        it('should preserve stiffness on new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            segment.stiffness = 0.5;

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(segmentA.stiffness).toBe(0.5);
            expect(segmentB.stiffness).toBe(0.5);
        });

        it('should preserve damping on new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            segment.damping = 0.3;

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(segmentA.damping).toBe(0.3);
            expect(segmentB.damping).toBe(0.3);
        });

        it('should preserve tensionOnly flag on new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            segment.tensionOnly = true;

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(segmentA.tensionOnly).toBe(true);
            expect(segmentB.tensionOnly).toBe(true);
        });

        it('should preserve compressionOnly flag on new segments', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            segment.compressionOnly = true;

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(segmentA.compressionOnly).toBe(true);
            expect(segmentB.compressionOnly).toBe(true);
        });
    });

    describe('Weight reassignment', () => {
        it('should reassign weight on first half to first segment', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight = structure.addWeight(segment, 0.25);

            const { segmentA } = structure.splitSegment(segment, 0.5);

            expect(weight.attachedToSegment).toBe(segmentA);
        });

        it('should reassign weight on second half to second segment', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight = structure.addWeight(segment, 0.75);

            const { segmentB } = structure.splitSegment(segment, 0.5);

            expect(weight.attachedToSegment).toBe(segmentB);
        });

        it('should recalculate weight position on first segment', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight = structure.addWeight(segment, 0.25);

            structure.splitSegment(segment, 0.5);

            // Original position 0.25 on segment split at 0.5
            // New position = 0.25 / 0.5 = 0.5
            expect(weight.position).toBe(0.5);
        });

        it('should recalculate weight position on second segment', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight = structure.addWeight(segment, 0.75);

            structure.splitSegment(segment, 0.5);

            // Original position 0.75 on segment split at 0.5
            // New position = (0.75 - 0.5) / (1 - 0.5) = 0.5
            expect(weight.position).toBe(0.5);
        });

        it('should handle multiple weights correctly', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight1 = structure.addWeight(segment, 0.2);
            const weight2 = structure.addWeight(segment, 0.8);

            const { segmentA, segmentB } = structure.splitSegment(segment, 0.5);

            expect(weight1.attachedToSegment).toBe(segmentA);
            expect(weight2.attachedToSegment).toBe(segmentB);
        });

        it('should preserve weights in the structure', () => {
            const nodeA = structure.addNode(0, 100);
            const nodeB = structure.addNode(200, 100);
            const segment = structure.addSegment(nodeA, nodeB);
            const weight = structure.addWeight(segment, 0.3);

            structure.splitSegment(segment, 0.5);

            expect(structure.weights).toContain(weight);
            expect(structure.weights).toHaveLength(1);
        });
    });

    describe('Diagonal segments', () => {
        it('should correctly position node on diagonal segment', () => {
            const nodeA = structure.addNode(0, 0);
            const nodeB = structure.addNode(100, 100);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node } = structure.splitSegment(segment, 0.5);

            expect(node.x).toBe(50);
            expect(node.y).toBe(50);
        });

        it('should handle segments going in reverse direction', () => {
            const nodeA = structure.addNode(200, 200);
            const nodeB = structure.addNode(0, 0);
            const segment = structure.addSegment(nodeA, nodeB);

            const { node } = structure.splitSegment(segment, 0.5);

            expect(node.x).toBe(100);
            expect(node.y).toBe(100);
        });
    });
});
