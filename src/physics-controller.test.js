import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhysicsController } from './physics-controller.js';

/**
 * Intent-focused tests describing simulation behaviour
 */
describe('PhysicsController - User Intent', () => {
    let controller;
    let mockStructure;

    beforeEach(() => {
        controller = new PhysicsController({
            getCanvasDimensions: () => ({ width: 800, groundY: 540, groundOffset: 60 }),
            getNodeRadius: () => 12
        });
        controller.init();

        // Create a minimal structure for testing
        mockStructure = {
            nodes: [
                { x: 100, y: 100, fixed: true, body: null },
                { x: 200, y: 100, fixed: false, body: null }
            ],
            segments: [],
            weights: []
        };
    });

    afterEach(() => {
        controller.destroy();
    });

    describe('User starts simulation', () => {
        it('should create physics bodies for all nodes', () => {
            controller.start(mockStructure);

            expect(mockStructure.nodes[0].body).not.toBe(null);
            expect(mockStructure.nodes[1].body).not.toBe(null);
        });

        it('should respect node fixed property (pinned nodes are static)', () => {
            controller.start(mockStructure);

            expect(mockStructure.nodes[0].body.isStatic).toBe(true);  // fixed: true
            expect(mockStructure.nodes[1].body.isStatic).toBe(false); // fixed: false
        });

        it('should report running state', () => {
            expect(controller.running).toBe(false);
            controller.start(mockStructure);
            expect(controller.running).toBe(true);
        });
    });

    describe('User stops simulation', () => {
        it('should sync node positions back to structure', () => {
            controller.start(mockStructure);

            // Simulate physics moving the unpinned node
            mockStructure.nodes[1].body.position.x = 250;
            mockStructure.nodes[1].body.position.y = 150;

            controller.stop(mockStructure);

            expect(mockStructure.nodes[1].x).toBe(250);
            expect(mockStructure.nodes[1].y).toBe(150);
        });

        it('should clear physics bodies from structure', () => {
            controller.start(mockStructure);
            controller.stop(mockStructure);

            expect(mockStructure.nodes[0].body).toBe(null);
            expect(mockStructure.nodes[1].body).toBe(null);
        });

        it('should report not running', () => {
            controller.start(mockStructure);
            controller.stop(mockStructure);

            expect(controller.running).toBe(false);
        });
    });

    describe('Structure with segments', () => {
        beforeEach(() => {
            // Add a segment connecting the two nodes
            mockStructure.segments = [{
                nodeA: mockStructure.nodes[0],
                nodeB: mockStructure.nodes[1],
                material: 'beam',
                stiffness: 0.8,
                damping: 0.1,
                restLength: 100,
                tensionOnly: false,
                compressionOnly: false,
                constraint: null,
                isSlack: false
            }];
        });

        it('should create constraints for segments', () => {
            controller.start(mockStructure);

            expect(mockStructure.segments[0].constraint).not.toBe(null);
        });

        it('should clear constraints on stop', () => {
            controller.start(mockStructure);
            controller.stop(mockStructure);

            expect(mockStructure.segments[0].constraint).toBe(null);
        });

        it('should reset slack state on stop', () => {
            controller.start(mockStructure);
            mockStructure.segments[0].isSlack = true;

            controller.stop(mockStructure);

            expect(mockStructure.segments[0].isSlack).toBe(false);
        });
    });

    describe('Structure with weights', () => {
        beforeEach(() => {
            mockStructure.weights = [{
                mass: 10,
                position: 0.5,
                attachedToNode: mockStructure.nodes[0],
                attachedToSegment: null,
                getPosition: () => ({ x: 100, y: 100 }),
                getRadius: () => 15,
                body: null,
                constraint: null
            }];
        });

        it('should create bodies for weights', () => {
            controller.start(mockStructure);

            expect(mockStructure.weights[0].body).not.toBe(null);
        });

        it('should create constraints to attach weights', () => {
            controller.start(mockStructure);

            expect(mockStructure.weights[0].constraint).not.toBe(null);
        });

        it('should clear weight bodies on stop', () => {
            controller.start(mockStructure);
            controller.stop(mockStructure);

            expect(mockStructure.weights[0].body).toBe(null);
            expect(mockStructure.weights[0].constraint).toBe(null);
        });
    });
});

describe('PhysicsController', () => {
    let controller;

    beforeEach(() => {
        controller = new PhysicsController({
            getCanvasDimensions: () => ({ width: 800, groundY: 540, groundOffset: 60 }),
            getNodeRadius: () => 12
        });
    });

    afterEach(() => {
        controller.destroy();
    });

    describe('init', () => {
        it('should create Matter.js engine', () => {
            controller.init();

            expect(controller.engine).not.toBe(null);
        });

        it('should create Matter.js runner', () => {
            controller.init();

            expect(controller.runner).not.toBe(null);
        });
    });

    describe('createGround', () => {
        it('should create static ground body', () => {
            controller.init();
            const dims = { width: 800, groundY: 540, groundOffset: 60 };
            const ground = controller.createGround(dims);

            expect(ground.isStatic).toBe(true);
            expect(ground.label).toBe('ground');
        });

        it('should position ground correctly', () => {
            controller.init();
            const dims = { width: 800, groundY: 540, groundOffset: 60 };
            const ground = controller.createGround(dims);

            expect(ground.position.x).toBe(400); // width / 2
            expect(ground.position.y).toBe(570); // groundY + groundOffset / 2
        });
    });

    describe('createNodeBody', () => {
        it('should create static body for fixed node', () => {
            controller.init();
            const node = { x: 100, y: 200, fixed: true };
            const body = controller.createNodeBody(node);

            expect(body.isStatic).toBe(true);
        });

        it('should create dynamic body for unfixed node', () => {
            controller.init();
            const node = { x: 100, y: 200, fixed: false };
            const body = controller.createNodeBody(node);

            expect(body.isStatic).toBe(false);
        });

        it('should position body at node coordinates', () => {
            controller.init();
            const node = { x: 150, y: 250, fixed: false };
            const body = controller.createNodeBody(node);

            expect(body.position.x).toBe(150);
            expect(body.position.y).toBe(250);
        });
    });

    describe('createSegmentConstraint', () => {
        it('should create constraint between node bodies', () => {
            controller.init();
            const bodyA = { position: { x: 0, y: 0 } };
            const bodyB = { position: { x: 100, y: 0 } };
            const segment = {
                nodeA: { body: bodyA },
                nodeB: { body: bodyB },
                material: 'beam',
                stiffness: 0.8,
                damping: 0.1,
                restLength: 100
            };

            const constraint = controller.createSegmentConstraint(segment);

            expect(constraint.bodyA).toBe(bodyA);
            expect(constraint.bodyB).toBe(bodyB);
            expect(constraint.length).toBe(100);
        });

        it('should use segment stiffness over material default', () => {
            controller.init();
            const segment = {
                nodeA: { body: { position: { x: 0, y: 0 } } },
                nodeB: { body: { position: { x: 100, y: 0 } } },
                material: 'beam',
                stiffness: 0.5, // Custom value
                damping: 0.1,
                restLength: 100
            };

            const constraint = controller.createSegmentConstraint(segment);

            expect(constraint.stiffness).toBe(0.5);
        });
    });

    describe('updateConstraintModes', () => {
        let structure;

        beforeEach(() => {
            controller.init();
            structure = {
                segments: [{
                    nodeA: { body: { position: { x: 0, y: 0 } } },
                    nodeB: { body: { position: { x: 100, y: 0 } } },
                    constraint: { stiffness: 0.8 },
                    restLength: 100,
                    stiffness: 0.8,
                    tensionOnly: false,
                    compressionOnly: false,
                    isSlack: false,
                    currentLength: 0
                }]
            };
        });

        it('should cache currentLength on segment', () => {
            controller.updateConstraintModes(structure);

            expect(structure.segments[0].currentLength).toBe(100);
        });

        it('should not slack standard segments', () => {
            controller.updateConstraintModes(structure);

            expect(structure.segments[0].isSlack).toBe(false);
        });

        it('should slack tension-only segment under compression', () => {
            structure.segments[0].tensionOnly = true;
            // Nodes closer than rest length = compression
            structure.segments[0].nodeB.body.position.x = 90;

            controller.updateConstraintModes(structure);

            expect(structure.segments[0].isSlack).toBe(true);
            expect(structure.segments[0].constraint.stiffness).toBe(0);
        });

        it('should not slack tension-only segment under tension', () => {
            structure.segments[0].tensionOnly = true;
            // Nodes further than rest length = tension
            structure.segments[0].nodeB.body.position.x = 110;

            controller.updateConstraintModes(structure);

            expect(structure.segments[0].isSlack).toBe(false);
        });

        it('should slack compression-only segment under tension', () => {
            structure.segments[0].compressionOnly = true;
            // Nodes further than rest length = tension
            structure.segments[0].nodeB.body.position.x = 110;

            controller.updateConstraintModes(structure);

            expect(structure.segments[0].isSlack).toBe(true);
        });
    });

    describe('updateWeightConstraints', () => {
        it('should update pointB for segment-attached weights', () => {
            controller.init();

            const weight = {
                attachedToSegment: {
                    nodeA: { body: { position: { x: 0, y: 0 } } },
                    nodeB: { body: { position: { x: 100, y: 0 } } }
                },
                position: 0.5,
                constraint: { pointB: { x: 0, y: 0 } }
            };

            const structure = { weights: [weight] };
            controller.updateWeightConstraints(structure);

            expect(weight.constraint.pointB.x).toBe(50);
            expect(weight.constraint.pointB.y).toBe(0);
        });

        it('should ignore node-attached weights', () => {
            controller.init();

            const weight = {
                attachedToNode: { body: {} },
                attachedToSegment: null,
                constraint: { pointB: { x: 10, y: 10 } }
            };

            const structure = { weights: [weight] };
            controller.updateWeightConstraints(structure);

            // Should not modify
            expect(weight.constraint.pointB.x).toBe(10);
        });
    });

    describe('static properties', () => {
        it('should have collision categories', () => {
            expect(PhysicsController.CATEGORY_NODE).toBeDefined();
            expect(PhysicsController.CATEGORY_WEIGHT).toBeDefined();
            expect(PhysicsController.CATEGORY_GROUND).toBeDefined();
        });

        it('should have tolerance ratio for slack detection', () => {
            expect(PhysicsController.TOLERANCE_RATIO).toBe(0.005);
        });
    });

    describe('destroy', () => {
        it('should clean up all resources', () => {
            controller.init();
            controller.destroy();

            expect(controller.engine).toBe(null);
            expect(controller.runner).toBe(null);
            expect(controller.isRunning).toBe(false);
        });

        it('should handle being called when not initialised', () => {
            expect(() => controller.destroy()).not.toThrow();
        });
    });
});
