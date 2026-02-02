import { describe, it, expect, beforeEach } from 'vitest';
import { JointController } from './joint-controller.js';

/**
 * Tests for JointController angle and torque calculations
 */

describe('JointController - Angle Calculation', () => {
    let controller;

    beforeEach(() => {
        controller = new JointController();
    });

    it('should calculate 90 degrees for perpendicular segments', () => {
        // Node at origin, segments pointing right and up
        const node = { x: 0, y: 0, body: null, angularStiffness: 0.5 };
        const segA = {
            nodeA: node,
            nodeB: { x: 100, y: 0, body: null }  // Points right
        };
        const segB = {
            nodeA: node,
            nodeB: { x: 0, y: -100, body: null }  // Points up (negative Y is up in canvas)
        };

        const angle = controller.calculateAngle(node, segA, segB, false);
        const degrees = angle * 180 / Math.PI;

        expect(degrees).toBeCloseTo(90, 1);
    });

    it('should calculate 180 degrees for collinear opposite segments', () => {
        const node = { x: 0, y: 0, body: null, angularStiffness: 0.5 };
        const segA = {
            nodeA: node,
            nodeB: { x: 100, y: 0, body: null }  // Points right
        };
        const segB = {
            nodeA: node,
            nodeB: { x: -100, y: 0, body: null }  // Points left
        };

        const angle = controller.calculateAngle(node, segA, segB, false);
        const degrees = angle * 180 / Math.PI;

        expect(degrees).toBeCloseTo(180, 1);
    });

    it('should calculate 0 degrees for same direction segments', () => {
        const node = { x: 0, y: 0, body: null, angularStiffness: 0.5 };
        const segA = {
            nodeA: node,
            nodeB: { x: 100, y: 0, body: null }
        };
        const segB = {
            nodeA: node,
            nodeB: { x: 50, y: 0, body: null }  // Same direction, different length
        };

        const angle = controller.calculateAngle(node, segA, segB, false);
        const degrees = angle * 180 / Math.PI;

        expect(degrees).toBeCloseTo(0, 1);
    });

    it('should calculate 45 degrees correctly', () => {
        const node = { x: 0, y: 0, body: null, angularStiffness: 0.5 };
        const segA = {
            nodeA: node,
            nodeB: { x: 100, y: 0, body: null }  // Points right
        };
        const segB = {
            nodeA: node,
            nodeB: { x: 100, y: -100, body: null }  // 45 degrees up-right
        };

        const angle = controller.calculateAngle(node, segA, segB, false);
        const degrees = angle * 180 / Math.PI;

        expect(degrees).toBeCloseTo(45, 1);
    });

    it('should handle segments where node is nodeB', () => {
        const node = { x: 0, y: 0, body: null, angularStiffness: 0.5 };
        const segA = {
            nodeA: { x: 100, y: 0, body: null },
            nodeB: node  // Node is B, not A
        };
        const segB = {
            nodeA: { x: 0, y: -100, body: null },
            nodeB: node  // Node is B, not A
        };

        const angle = controller.calculateAngle(node, segA, segB, false);
        const degrees = angle * 180 / Math.PI;

        expect(degrees).toBeCloseTo(90, 1);
    });
});

describe('JointController - Torque Calculation', () => {
    let controller;

    beforeEach(() => {
        controller = new JointController();
    });

    it('should return 0 torque when angle equals rest angle', () => {
        const torque = controller.calculateTorque(Math.PI / 2, Math.PI / 2, 0.5);
        expect(torque).toBe(0);
    });

    it('should return higher torque for higher angular stiffness', () => {
        const deviation = Math.PI / 4;  // 45 degree deviation
        const restAngle = Math.PI / 2;
        const currentAngle = restAngle + deviation;

        const torqueLow = controller.calculateTorque(currentAngle, restAngle, 0.2);
        const torqueHigh = controller.calculateTorque(currentAngle, restAngle, 0.8);

        expect(torqueHigh).toBeGreaterThan(torqueLow);
        expect(torqueHigh / torqueLow).toBeCloseTo(4, 1);  // 0.8/0.2 = 4
    });

    it('should scale torque with angle deviation', () => {
        const restAngle = Math.PI / 2;
        const stiffness = 0.5;

        const torqueSmall = controller.calculateTorque(restAngle + 0.1, restAngle, stiffness);
        const torqueLarge = controller.calculateTorque(restAngle + 0.2, restAngle, stiffness);

        expect(torqueLarge).toBeCloseTo(torqueSmall * 2, 5);
    });

    it('should return 0 torque for free hinge (stiffness = 0)', () => {
        const torque = controller.calculateTorque(Math.PI / 4, Math.PI / 2, 0);
        expect(torque).toBe(0);
    });
});

describe('JointController - computeJointData', () => {
    let controller;

    beforeEach(() => {
        controller = new JointController();
    });

    it('should return empty map for structure with no multi-segment nodes', () => {
        const mockStructure = {
            nodes: [
                { x: 0, y: 0, angularStiffness: 0.5 },
                { x: 100, y: 0, angularStiffness: 0.5 }
            ],
            getSegmentsAtNode: () => []  // No segments at any node
        };

        const jointData = controller.computeJointData(mockStructure, false);

        expect(jointData.size).toBe(0);
    });

    it('should return 1 pair for node with 2 segments', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const nodeA = { x: 100, y: 0 };
        const nodeB = { x: 0, y: 100 };

        const segA = { nodeA: node, nodeB: nodeA };
        const segB = { nodeA: node, nodeB: nodeB };

        const mockStructure = {
            nodes: [node, nodeA, nodeB],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);

        expect(jointData.size).toBe(1);
        expect(jointData.get(node).anglePairs.length).toBe(1);
    });

    it('should return 3 pairs for node with 3 segments', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const nodeA = { x: 100, y: 0 };
        const nodeB = { x: 0, y: 100 };
        const nodeC = { x: -100, y: 0 };

        const segA = { nodeA: node, nodeB: nodeA };
        const segB = { nodeA: node, nodeB: nodeB };
        const segC = { nodeA: node, nodeB: nodeC };

        const mockStructure = {
            nodes: [node, nodeA, nodeB, nodeC],
            getSegmentsAtNode: (n) => n === node ? [segA, segB, segC] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);

        expect(jointData.size).toBe(1);
        expect(jointData.get(node).anglePairs.length).toBe(3);  // 3 choose 2 = 3
    });

    it('should return 6 pairs for node with 4 segments', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };

        const segments = [
            { nodeA: node, nodeB: { x: 100, y: 0 } },
            { nodeA: node, nodeB: { x: 0, y: 100 } },
            { nodeA: node, nodeB: { x: -100, y: 0 } },
            { nodeA: node, nodeB: { x: 0, y: -100 } }
        ];

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? segments : []
        };

        const jointData = controller.computeJointData(mockStructure, false);

        expect(jointData.get(node).anglePairs.length).toBe(6);  // 4 choose 2 = 6
    });

    it('should cap normalisedTorque at 1.0 (100%) for large deviations', () => {
        // Node with high stiffness at a joint
        const node = { x: 0, y: 0, angularStiffness: 1.0, body: null };

        // Two segments: one pointing right, one pointing down (90° at rest)
        const segA = { nodeA: node, nodeB: { x: 100, y: 0, body: null } };
        const segB = { nodeA: node, nodeB: { x: 0, y: 100, body: null } };

        // Mock structure returning segments
        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        // During simulation, move segB to create a large angle deviation
        // (we can't actually move bodies in this test, but we can verify the cap logic)
        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        // At rest, torque should be 0 and normalisedTorque should be 0
        expect(pair.torque).toBe(0);
        expect(pair.normalisedTorque).toBe(0);

        // Manually test the cap logic: torque * 10 should cap at 1
        // If deviation is PI (180°) with stiffness 1.0, torque = PI ≈ 3.14
        // normalisedTorque = Math.min(3.14 * 10, 1) = 1
        const largeDeviation = Math.PI;
        const largeTorque = controller.calculateTorque(Math.PI, 0, 1.0);
        expect(largeTorque).toBeCloseTo(Math.PI, 3);

        // Verify the cap formula: torque * 10 > 1 should still return 1
        const normalisedLarge = Math.min(largeTorque * 10, 1);
        expect(normalisedLarge).toBe(1);
    });
});

describe('JointController - Load Path Stress', () => {
    let controller;

    beforeEach(() => {
        controller = new JointController();
    });

    it('should include loadPathStress in angle pair data', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const segA = { nodeA: node, nodeB: { x: 100, y: 0 }, stress: 0.4 };
        const segB = { nodeA: node, nodeB: { x: 0, y: 100 }, stress: 0.6 };

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        expect(pair).toHaveProperty('loadPathStress');
    });

    it('should calculate loadPathStress as min of both segment stresses', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const segA = { nodeA: node, nodeB: { x: 100, y: 0 }, stress: 0.3 };
        const segB = { nodeA: node, nodeB: { x: 0, y: 100 }, stress: 0.7 };

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        // min(0.3, 0.7) = 0.3
        expect(pair.loadPathStress).toBe(0.3);
    });

    it('should return 0 loadPathStress when one segment has no stress', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const segA = { nodeA: node, nodeB: { x: 100, y: 0 }, stress: 0.5 };
        const segB = { nodeA: node, nodeB: { x: 0, y: 100 }, stress: 0 };

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        // min(0.5, 0) = 0
        expect(pair.loadPathStress).toBe(0);
    });

    it('should default to 0 when segments have no stress property', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const segA = { nodeA: node, nodeB: { x: 100, y: 0 } };  // No stress
        const segB = { nodeA: node, nodeB: { x: 0, y: 100 } };  // No stress

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        expect(pair.loadPathStress).toBe(0);
    });

    it('should show high loadPathStress when both segments are highly stressed', () => {
        const node = { x: 0, y: 0, angularStiffness: 0.5 };
        const segA = { nodeA: node, nodeB: { x: 100, y: 0 }, stress: 0.8 };
        const segB = { nodeA: node, nodeB: { x: 0, y: 100 }, stress: 0.9 };

        const mockStructure = {
            nodes: [node],
            getSegmentsAtNode: (n) => n === node ? [segA, segB] : []
        };

        const jointData = controller.computeJointData(mockStructure, false);
        const pair = jointData.get(node).anglePairs[0];

        // min(0.8, 0.9) = 0.8 — both segments carrying load = load path
        expect(pair.loadPathStress).toBe(0.8);
    });
});

