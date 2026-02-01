/**
 * PhysicsController
 * Manages Matter.js engine lifecycle, body/constraint creation, and physics updates
 */

import Matter from 'matter-js';
import { MATERIALS } from './structure.js';

export class PhysicsController {
    // Collision categories
    static CATEGORY_NODE = 0x0001;
    static CATEGORY_WEIGHT = 0x0002;
    static CATEGORY_GROUND = 0x0004;

    // Tolerance for tension/compression switching (prevents flickering)
    static TOLERANCE_RATIO = 0.005;

    /**
     * @param {Object} options - Configuration options
     * @param {Function} options.getCanvasDimensions - Returns { width, groundY, groundOffset }
     * @param {Function} options.getNodeRadius - Returns node radius for body creation
     * @param {number} [options.groundWidthMultiplier=2] - Ground width relative to canvas
     * @param {Object} [options.gravity={ x: 0, y: 2 }] - Gravity vector
     */
    constructor(options = {}) {
        // Configuration
        this.getCanvasDimensions = options.getCanvasDimensions ?? (() => ({
            width: 800,
            groundY: 540,
            groundOffset: 60
        }));
        this.getNodeRadius = options.getNodeRadius ?? (() => 12);
        this.groundWidthMultiplier = options.groundWidthMultiplier ?? 2;
        this.gravity = options.gravity ?? { x: 0, y: 2 };

        // Matter.js references
        this.engine = null;
        this.runner = null;
        this.groundBody = null;
        this.constraintModeHandler = null;

        this.isRunning = false;
    }

    /**
     * Initialise Matter.js engine (dormant until simulation starts).
     * Call this during application setup.
     */
    init() {
        this.engine = Matter.Engine.create({
            gravity: this.gravity
        });

        this.runner = Matter.Runner.create({
            delta: 1000 / 60,
            isFixed: true
        });
    }

    /**
     * Start the physics simulation.
     * Creates bodies and constraints for all structure elements.
     * @param {Object} structure - Structure with nodes, segments, weights arrays
     */
    start(structure) {
        if (this.isRunning) return;

        // Clear existing physics world
        Matter.World.clear(this.engine.world);
        Matter.Engine.clear(this.engine);

        // Recreate engine to ensure clean state
        // Increase solver iterations for better constraint handling with heavy weights
        this.engine = Matter.Engine.create({
            gravity: this.gravity,
            constraintIterations: 4,  // default is 2
            positionIterations: 10    // default is 6
        });

        const dims = this.getCanvasDimensions();

        // Create ground
        this.groundBody = this.createGround(dims);
        Matter.World.add(this.engine.world, this.groundBody);

        // Create physics bodies for nodes
        for (const node of structure.nodes) {
            const body = this.createNodeBody(node);
            node.body = body;
            Matter.World.add(this.engine.world, body);
        }

        // Create constraints for segments
        for (const segment of structure.segments) {
            const constraint = this.createSegmentConstraint(segment);
            segment.constraint = constraint;
            Matter.World.add(this.engine.world, constraint);
        }

        // Create physics bodies for weights
        for (const weight of structure.weights) {
            const body = this.createWeightBody(weight);
            weight.body = body;
            Matter.World.add(this.engine.world, body);

            // Create constraint(s) to attachment point
            const constraints = this.createWeightConstraint(weight);
            if (constraints) {
                weight.constraints = Array.isArray(constraints) ? constraints : [constraints];
                for (const c of weight.constraints) {
                    Matter.World.add(this.engine.world, c);
                }
            }
        }

        // Add physics update listener for tension-only/compression-only behaviour
        this.constraintModeHandler = () => {
            this.updateConstraintModes(structure);
            this.updateWeightConstraints(structure);
        };
        Matter.Events.on(this.engine, 'beforeUpdate', this.constraintModeHandler);

        // Start physics runner
        Matter.Runner.run(this.runner, this.engine);

        this.isRunning = true;
    }

    /**
     * Stop the physics simulation.
     * Syncs positions back to structure and cleans up physics objects.
     * @param {Object} structure - Structure with nodes, segments, weights arrays
     */
    stop(structure) {
        if (!this.isRunning) return;

        // Stop physics runner
        Matter.Runner.stop(this.runner);

        // Remove event listener
        if (this.constraintModeHandler) {
            Matter.Events.off(this.engine, 'beforeUpdate', this.constraintModeHandler);
            this.constraintModeHandler = null;
        }

        // Sync node positions from bodies
        for (const node of structure.nodes) {
            if (node.body) {
                node.x = node.body.position.x;
                node.y = node.body.position.y;
                node.body = null;
            }
        }

        // Clear constraints and reset slack state
        for (const segment of structure.segments) {
            segment.constraint = null;
            segment.isSlack = false;
        }

        // Clear weight bodies and constraints
        for (const weight of structure.weights) {
            weight.body = null;
            weight.constraints = null;
        }

        // Clear physics world
        Matter.World.clear(this.engine.world);
        this.groundBody = null;

        this.isRunning = false;
    }

    /**
     * Create the ground body.
     * @param {Object} dims - Canvas dimensions { width, groundY, groundOffset }
     * @returns {Matter.Body}
     */
    createGround(dims) {
        return Matter.Bodies.rectangle(
            dims.width / 2,
            dims.groundY + dims.groundOffset / 2,
            dims.width * this.groundWidthMultiplier,
            dims.groundOffset,
            {
                isStatic: true,
                label: 'ground',
                collisionFilter: {
                    category: PhysicsController.CATEGORY_GROUND,
                    mask: PhysicsController.CATEGORY_NODE | PhysicsController.CATEGORY_WEIGHT
                }
            }
        );
    }

    /**
     * Create a physics body for a node.
     * @param {Object} node - Node with x, y, fixed properties
     * @returns {Matter.Body}
     */
    createNodeBody(node) {
        const radius = this.getNodeRadius();
        return Matter.Bodies.circle(node.x, node.y, radius, {
            isStatic: node.fixed,
            mass: 5,
            restitution: 0.2,
            friction: 0.8,
            frictionStatic: 1.0,
            frictionAir: 0.01,
            collisionFilter: {
                category: PhysicsController.CATEGORY_NODE,
                mask: PhysicsController.CATEGORY_GROUND
            }
        });
    }

    /**
     * Create a constraint for a segment.
     * @param {Object} segment - Segment with nodeA, nodeB, material, stiffness, damping, restLength
     * @returns {Matter.Constraint}
     */
    createSegmentConstraint(segment) {
        const materialData = MATERIALS[segment.material];
        const stiffness = segment.stiffness ?? materialData.stiffness;
        const damping = segment.damping ?? materialData.damping;

        return Matter.Constraint.create({
            bodyA: segment.nodeA.body,
            bodyB: segment.nodeB.body,
            stiffness: stiffness,
            damping: damping,
            length: segment.restLength
        });
    }

    /**
     * Create a physics body for a weight.
     * @param {Object} weight - Weight with getPosition(), getRadius(), mass properties
     * @returns {Matter.Body}
     */
    createWeightBody(weight) {
        const pos = weight.getPosition();
        return Matter.Bodies.circle(pos.x, pos.y, weight.getRadius(), {
            mass: weight.mass,
            restitution: 0.1,
            friction: 0.8,
            frictionStatic: 1.0,
            frictionAir: 0.02,
            label: 'weight',
            collisionFilter: {
                category: PhysicsController.CATEGORY_WEIGHT,
                mask: PhysicsController.CATEGORY_GROUND
            }
        });
    }

    /**
     * Create constraint(s) to attach a weight to its anchor point.
     * Node-attached weights get a single constraint.
     * Segment-attached weights get two constraints (one to each endpoint)
     * so force is properly transmitted to both nodes.
     * @param {Object} weight - Weight with attachedToNode or attachedToSegment
     * @returns {Matter.Constraint|Matter.Constraint[]|null}
     */
    createWeightConstraint(weight) {
        // Use maximum stiffness (1.0) for weight constraints
        // Heavy weights need rigid constraints to stay attached
        const stiffness = 1.0;
        const damping = 0.3;  // Higher damping to reduce oscillation

        if (weight.attachedToNode) {
            return Matter.Constraint.create({
                bodyA: weight.body,
                bodyB: weight.attachedToNode.body,
                stiffness,
                damping,
                length: 0
            });
        } else if (weight.attachedToSegment) {
            const seg = weight.attachedToSegment;
            const t = weight.position; // 0-1 along segment

            // Create two constraints to endpoint nodes
            // Lengths are proportional to position along segment
            const lengthToA = t * seg.restLength;
            const lengthToB = (1 - t) * seg.restLength;

            return [
                Matter.Constraint.create({
                    bodyA: weight.body,
                    bodyB: seg.nodeA.body,
                    stiffness,
                    damping,
                    length: lengthToA
                }),
                Matter.Constraint.create({
                    bodyA: weight.body,
                    bodyB: seg.nodeB.body,
                    stiffness,
                    damping,
                    length: lengthToB
                })
            ];
        }
        return null;
    }

    /**
     * Update constraint modes for tension-only/compression-only segments.
     * Also caches currentLength for stress calculations.
     * @param {Object} structure - Structure with segments array
     */
    updateConstraintModes(structure) {
        for (const segment of structure.segments) {
            if (!segment.constraint || !segment.nodeA.body || !segment.nodeB.body) continue;

            // Calculate and cache current length
            const posA = segment.nodeA.body.position;
            const posB = segment.nodeB.body.position;
            segment.currentLength = Matter.Vector.magnitude(Matter.Vector.sub(posB, posA));

            // Standard segments don't need mode logic
            if (!segment.tensionOnly && !segment.compressionOnly) {
                segment.isSlack = false;
                continue;
            }

            // Calculate tolerance based on rest length
            const tolerance = segment.restLength * PhysicsController.TOLERANCE_RATIO;

            // Determine if in tension or compression
            const inTension = segment.currentLength > segment.restLength + tolerance;
            const inCompression = segment.currentLength < segment.restLength - tolerance;

            // Apply tension-only / compression-only logic
            const shouldBeSlack =
                (segment.tensionOnly && inCompression) ||
                (segment.compressionOnly && inTension);

            segment.isSlack = shouldBeSlack;
            segment.constraint.stiffness = shouldBeSlack ? 0 : segment.stiffness;
        }
    }

    /**
     * Update segment-attached weight constraint lengths.
     * As the segment stretches/compresses, we must update constraint lengths
     * to keep the weight on the segment line (not floating off to the side).
     * @param {Object} structure - Structure with weights array
     */
    updateWeightConstraints(structure) {
        for (const weight of structure.weights) {
            if (!weight.attachedToSegment || !weight.constraints) continue;

            const seg = weight.attachedToSegment;
            if (!seg.nodeA.body || !seg.nodeB.body) continue;

            // Get current segment length
            const posA = seg.nodeA.body.position;
            const posB = seg.nodeB.body.position;
            const currentLength = Matter.Vector.magnitude(Matter.Vector.sub(posB, posA));

            // Update constraint lengths proportionally to keep weight on segment line
            const t = weight.position;
            weight.constraints[0].length = t * currentLength;
            weight.constraints[1].length = (1 - t) * currentLength;
        }
    }

    /**
     * Update ground position (call on window resize during simulation).
     * @param {Object} dims - New canvas dimensions
     */
    updateGroundPosition(dims) {
        if (this.groundBody) {
            Matter.Body.setPosition(this.groundBody, {
                x: dims.width / 2,
                y: dims.groundY + dims.groundOffset / 2
            });
        }
    }

    /**
     * Check if simulation is running.
     * @returns {boolean}
     */
    get running() {
        return this.isRunning;
    }

    /**
     * Clean up resources.
     */
    destroy() {
        if (this.isRunning && this.engine) {
            Matter.Runner.stop(this.runner);
            Matter.World.clear(this.engine.world);
        }
        this.engine = null;
        this.runner = null;
        this.groundBody = null;
        this.constraintModeHandler = null;
        this.isRunning = false;
    }
}
