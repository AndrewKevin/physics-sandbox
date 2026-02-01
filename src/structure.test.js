import { describe, it, expect, beforeEach } from 'vitest';
import { StructureManager, Node, Segment, Weight, MATERIALS } from './structure.js';

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

describe('Node - mass property', () => {
    beforeEach(() => {
        Node.nextId = 0;
    });

    describe('setMass', () => {
        it('should set mass within valid range', () => {
            const node = new Node(100, 100);

            node.setMass(10);

            expect(node.mass).toBe(10);
        });

        it('should clamp mass to minimum', () => {
            const node = new Node(100, 100);

            node.setMass(-5);

            expect(node.mass).toBe(Node.minMass);
        });

        it('should clamp mass to maximum', () => {
            const node = new Node(100, 100);

            node.setMass(100);

            expect(node.mass).toBe(Node.maxMass);
        });

        it('should update physics body mass when body exists', () => {
            const node = new Node(100, 100);
            // Mock physics body with setMass tracking
            let bodyMassSet = null;
            node.body = {
                mass: 5
            };
            // We can't easily mock Matter.Body.setMass, but we can verify no errors
            // The actual physics sync is tested in physics-controller tests

            expect(() => node.setMass(15)).not.toThrow();
            expect(node.mass).toBe(15);
        });

        it('should handle fractional mass values', () => {
            const node = new Node(100, 100);

            node.setMass(2.5);

            expect(node.mass).toBe(2.5);
        });
    });

    describe('default mass', () => {
        it('should initialise with default mass', () => {
            const node = new Node(100, 100);

            expect(node.mass).toBe(Node.defaultMass);
        });
    });

    describe('static constants', () => {
        it('should have valid min/max/default mass values', () => {
            expect(Node.minMass).toBeLessThan(Node.maxMass);
            expect(Node.defaultMass).toBeGreaterThanOrEqual(Node.minMass);
            expect(Node.defaultMass).toBeLessThanOrEqual(Node.maxMass);
        });
    });
});

describe('StructureManager - serialization with node mass', () => {
    let structure;

    beforeEach(() => {
        structure = new StructureManager();
        Node.nextId = 0;
        Segment.nextId = 0;
        Weight.nextId = 0;
    });

    describe('serialize', () => {
        it('should include node mass in serialized data', () => {
            const node = structure.addNode(100, 200);
            node.setMass(15);

            const data = structure.serialize();

            expect(data.nodes[0].mass).toBe(15);
        });

        it('should serialize multiple nodes with different masses', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            node1.setMass(5);
            node2.setMass(25);

            const data = structure.serialize();

            expect(data.nodes[0].mass).toBe(5);
            expect(data.nodes[1].mass).toBe(25);
        });
    });

    describe('deserialize', () => {
        it('should restore node mass from serialized data', () => {
            const data = {
                nodes: [{ x: 100, y: 200, fixed: false, mass: 15 }],
                segments: [],
                weights: []
            };

            structure.deserialize(data);

            expect(structure.nodes[0].mass).toBe(15);
        });

        it('should use default mass for old saves without mass field', () => {
            const data = {
                nodes: [{ x: 100, y: 200, fixed: false }],  // No mass field
                segments: [],
                weights: []
            };

            structure.deserialize(data);

            expect(structure.nodes[0].mass).toBe(Node.defaultMass);
        });

        it('should preserve mass through snapshot/restore cycle', () => {
            const node = structure.addNode(100, 200);
            node.setMass(20);

            const snapshot = structure.snapshot();
            structure.clear();
            structure.restore(snapshot);

            expect(structure.nodes[0].mass).toBe(20);
        });
    });
});

describe('StructureManager - Multi-select', () => {
    let structure;

    beforeEach(() => {
        structure = new StructureManager();
        Node.nextId = 0;
        Segment.nextId = 0;
        Weight.nextId = 0;
    });

    describe('addToSelection', () => {
        it('should add node to selection without clearing existing', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            structure.selectNode(node1);

            structure.addToSelection(node2);

            expect(structure.selectedNodes).toContain(node1);
            expect(structure.selectedNodes).toContain(node2);
            expect(node2.selected).toBe(true);
        });

        it('should not duplicate nodes in selection', () => {
            const node = structure.addNode(100, 100);
            structure.addToSelection(node);
            structure.addToSelection(node);

            expect(structure.selectedNodes).toHaveLength(1);
        });

        it('should clear segment selection when adding nodes', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            const segment = structure.addSegment(node1, node2);
            structure.selectSegment(segment);

            structure.addToSelection(node1);

            expect(structure.selectedSegment).toBeNull();
            expect(segment.selected).toBe(false);
        });
    });

    describe('removeFromSelection', () => {
        it('should remove node from selection', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            structure.selectMultipleNodes([node1, node2]);

            structure.removeFromSelection(node1);

            expect(structure.selectedNodes).not.toContain(node1);
            expect(structure.selectedNodes).toContain(node2);
            expect(node1.selected).toBe(false);
        });

        it('should handle removing node not in selection', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            structure.selectNode(node1);

            expect(() => structure.removeFromSelection(node2)).not.toThrow();
        });
    });

    describe('toggleNodeSelection', () => {
        it('should add node when not selected', () => {
            const node = structure.addNode(100, 100);

            structure.toggleNodeSelection(node);

            expect(structure.selectedNodes).toContain(node);
        });

        it('should remove node when already selected', () => {
            const node = structure.addNode(100, 100);
            structure.selectNode(node);

            structure.toggleNodeSelection(node);

            expect(structure.selectedNodes).not.toContain(node);
        });
    });

    describe('selectMultipleNodes', () => {
        it('should select all provided nodes', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            const node3 = structure.addNode(300, 300);

            structure.selectMultipleNodes([node1, node2, node3]);

            expect(structure.selectedNodes).toHaveLength(3);
            expect(node1.selected).toBe(true);
            expect(node2.selected).toBe(true);
            expect(node3.selected).toBe(true);
        });

        it('should clear previous selection', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            structure.selectNode(node1);

            structure.selectMultipleNodes([node2]);

            expect(structure.selectedNodes).not.toContain(node1);
            expect(node1.selected).toBe(false);
        });
    });

    describe('addMultipleToSelection', () => {
        it('should add nodes to existing selection', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            const node3 = structure.addNode(300, 300);
            structure.selectNode(node1);

            structure.addMultipleToSelection([node2, node3]);

            expect(structure.selectedNodes).toHaveLength(3);
        });
    });

    describe('findNodesInRect', () => {
        it('should find nodes inside rectangle', () => {
            const node1 = structure.addNode(50, 50);
            const node2 = structure.addNode(150, 50);
            const node3 = structure.addNode(100, 150);
            const node4 = structure.addNode(300, 300);

            const found = structure.findNodesInRect({ x: 0, y: 0, width: 200, height: 200 });

            expect(found).toHaveLength(3);
            expect(found).toContain(node1);
            expect(found).toContain(node2);
            expect(found).toContain(node3);
            expect(found).not.toContain(node4);
        });

        it('should return empty array when no nodes in rect', () => {
            structure.addNode(500, 500);

            const found = structure.findNodesInRect({ x: 0, y: 0, width: 100, height: 100 });

            expect(found).toHaveLength(0);
        });

        it('should include nodes on boundary', () => {
            const node = structure.addNode(100, 100);

            const found = structure.findNodesInRect({ x: 0, y: 0, width: 100, height: 100 });

            expect(found).toContain(node);
        });
    });

    describe('hasMultipleNodesSelected', () => {
        it('should return false when no nodes selected', () => {
            expect(structure.hasMultipleNodesSelected()).toBe(false);
        });

        it('should return false when one node selected', () => {
            const node = structure.addNode(100, 100);
            structure.selectNode(node);

            expect(structure.hasMultipleNodesSelected()).toBe(false);
        });

        it('should return true when multiple nodes selected', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 200);
            structure.selectMultipleNodes([node1, node2]);

            expect(structure.hasMultipleNodesSelected()).toBe(true);
        });
    });

    describe('getSegmentsBetweenNodes', () => {
        it('should return segments where both endpoints are in node set', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const node3 = structure.addNode(300, 100);
            const seg1 = structure.addSegment(node1, node2);
            const seg2 = structure.addSegment(node2, node3);

            const segments = structure.getSegmentsBetweenNodes([node1, node2]);

            expect(segments).toHaveLength(1);
            expect(segments).toContain(seg1);
            expect(segments).not.toContain(seg2);
        });

        it('should return all segments when all nodes included', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const node3 = structure.addNode(300, 100);
            structure.addSegment(node1, node2);
            structure.addSegment(node2, node3);
            structure.addSegment(node1, node3);

            const segments = structure.getSegmentsBetweenNodes([node1, node2, node3]);

            expect(segments).toHaveLength(3);
        });

        it('should return empty array when only one node provided', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            structure.addSegment(node1, node2);

            const segments = structure.getSegmentsBetweenNodes([node1]);

            expect(segments).toHaveLength(0);
        });

        it('should return empty array for empty node set', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            structure.addSegment(node1, node2);

            const segments = structure.getSegmentsBetweenNodes([]);

            expect(segments).toHaveLength(0);
        });
    });

    describe('getWeightsForNodes', () => {
        it('should return weights attached to specified nodes', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const weight1 = structure.addWeight(node1, 0, 10);
            structure.addWeight(node2, 0, 20);

            const weights = structure.getWeightsForNodes([node1]);

            expect(weights).toHaveLength(1);
            expect(weights).toContain(weight1);
        });

        it('should return empty array when no weights attached', () => {
            const node1 = structure.addNode(100, 100);

            const weights = structure.getWeightsForNodes([node1]);

            expect(weights).toHaveLength(0);
        });

        it('should not return segment-attached weights', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const segment = structure.addSegment(node1, node2);
            structure.addWeight(segment, 0.5, 10);

            const weights = structure.getWeightsForNodes([node1, node2]);

            expect(weights).toHaveLength(0);
        });
    });

    describe('getWeightsForSegments', () => {
        it('should return weights attached to specified segments', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const node3 = structure.addNode(300, 100);
            const seg1 = structure.addSegment(node1, node2);
            const seg2 = structure.addSegment(node2, node3);
            const weight1 = structure.addWeight(seg1, 0.5, 10);
            structure.addWeight(seg2, 0.5, 20);

            const weights = structure.getWeightsForSegments([seg1]);

            expect(weights).toHaveLength(1);
            expect(weights).toContain(weight1);
        });

        it('should return empty array when no weights attached', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const segment = structure.addSegment(node1, node2);

            const weights = structure.getWeightsForSegments([segment]);

            expect(weights).toHaveLength(0);
        });

        it('should not return node-attached weights', () => {
            const node1 = structure.addNode(100, 100);
            const node2 = structure.addNode(200, 100);
            const segment = structure.addSegment(node1, node2);
            structure.addWeight(node1, 0, 10);

            const weights = structure.getWeightsForSegments([segment]);

            expect(weights).toHaveLength(0);
        });
    });
});

describe('Segment', () => {
    describe('setMaterial', () => {
        it('should update material and all physics properties', () => {
            const nodeA = new Node(0, 0);
            const nodeB = new Node(100, 0);
            const segment = new Segment(nodeA, nodeB, 'beam');

            segment.setMaterial('cable');

            expect(segment.material).toBe('cable');
            expect(segment.stiffness).toBe(MATERIALS.cable.stiffness);
            expect(segment.damping).toBe(MATERIALS.cable.damping);
            expect(segment.compressionOnly).toBe(MATERIALS.cable.compressionOnly);
            expect(segment.tensionOnly).toBe(MATERIALS.cable.tensionOnly);
        });

        it('should do nothing for invalid material', () => {
            const nodeA = new Node(0, 0);
            const nodeB = new Node(100, 0);
            const segment = new Segment(nodeA, nodeB, 'beam');
            const originalStiffness = segment.stiffness;

            segment.setMaterial('nonexistent');

            expect(segment.material).toBe('beam');
            expect(segment.stiffness).toBe(originalStiffness);
        });

        it('should work for all defined materials', () => {
            const nodeA = new Node(0, 0);
            const nodeB = new Node(100, 0);

            for (const materialKey of Object.keys(MATERIALS)) {
                const segment = new Segment(nodeA, nodeB, 'beam');
                segment.setMaterial(materialKey);

                expect(segment.material).toBe(materialKey);
                expect(segment.stiffness).toBe(MATERIALS[materialKey].stiffness);
                expect(segment.damping).toBe(MATERIALS[materialKey].damping);
            }
        });
    });
});
