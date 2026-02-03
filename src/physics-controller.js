/**
 * PhysicsController
 * Manages Matter.js engine lifecycle, body/constraint creation, and physics updates
 *
 * Coordinate conversion:
 * - World coordinates use Y-up convention (Y=0 at ground, positive Y is up)
 * - Matter.js uses Y-down convention (Y=0 at top, positive Y is down)
 * - This controller handles conversion at the boundary (body creation and position sync)
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
     * @param {Function} options.getCanvasDimensions - Returns { width, groundScreenY, groundOffset }
     * @param {Function} options.getNodeRadius - Returns node radius for body creation
     * @param {number} [options.groundWidthMultiplier=2] - Ground width relative to canvas
     * @param {Object} [options.gravity={ x: 0, y: 2 }] - Gravity vector (Matter.js Y-down)
     */
    constructor(options = {}) {
        // Configuration
        this.getCanvasDimensions = options.getCanvasDimensions ?? (() => ({
            width: 800,
            groundScreenY: 540,
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

    // === Coordinate Conversion ===

    /**
     * Convert world Y (Y-up) to Matter.js Y (Y-down).
     * @param {number} worldY - Y position in world coords (Y=0 at ground)
     * @param {number} groundScreenY - Screen Y position of ground line
     * @returns {number} Y position in Matter.js coords
     */
    worldToMatter(worldY, groundScreenY) {
        return groundScreenY - worldY;
    }

    /**
     * Convert Matter.js Y (Y-down) to world Y (Y-up).
     * @param {number} matterY - Y position in Matter.js coords
     * @param {number} groundScreenY - Screen Y position of ground line
     * @returns {number} Y position in world coords (Y=0 at ground)
     */
    matterToWorld(matterY, groundScreenY) {
        return groundScreenY - matterY;
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
        const groundScreenY = dims.groundScreenY;

        // Create ground
        this.groundBody = this.createGround(dims);
        Matter.World.add(this.engine.world, this.groundBody);

        // Create physics bodies for nodes (convert Y-up world to Y-down Matter)
        for (const node of structure.nodes) {
            const body = this.createNodeBody(node, groundScreenY);
            node.body = body;
            Matter.World.add(this.engine.world, body);
        }

        // Create constraints for segments
        for (const segment of structure.segments) {
            const constraint = this.createSegmentConstraint(segment);
            segment.constraint = constraint;
            Matter.World.add(this.engine.world, constraint);
        }

        // Create physics bodies for weights (node-attached only)
        // Segment-attached weights use direct force application instead
        for (const weight of structure.weights) {
            const body = this.createWeightBody(weight, groundScreenY);
            weight.body = body;

            if (body) {
                Matter.World.add(this.engine.world, body);

                // Create constraint to attachment point (node-attached only)
                const constraint = this.createWeightConstraint(weight);
                if (constraint) {
                    weight.constraints = [constraint];
                    Matter.World.add(this.engine.world, constraint);
                }
            }
        }

        // Add physics update listener for tension-only/compression-only behaviour,
        // muscle contraction, and segment-attached weight force application
        this.constraintModeHandler = () => {
            this.updateConstraintModes(structure);
            this.applyMuscleContraction(structure);
            this.applySegmentWeightForces(structure);
        };
        Matter.Events.on(this.engine, 'beforeUpdate', this.constraintModeHandler);

        // Start physics runner
        Matter.Runner.run(this.runner, this.engine);

        this.isRunning = true;
    }

    /**
     * Stop the physics simulation.
     * Syncs positions back to structure and cleans up physics objects.
     * Converts from Matter.js coords (Y-down) back to world coords (Y-up).
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

        const dims = this.getCanvasDimensions();
        const groundScreenY = dims.groundScreenY;

        // Sync node positions from bodies (convert Y-down Matter to Y-up world)
        for (const node of structure.nodes) {
            if (node.body) {
                node.x = node.body.position.x;
                node.y = this.matterToWorld(node.body.position.y, groundScreenY);
                node.body = null;
            }
        }

        // Clear constraints and reset runtime state
        for (const segment of structure.segments) {
            segment.constraint = null;
            segment.isSlack = false;
            segment.isBroken = false;  // Reset broken state for next simulation
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
     * Ground is at world Y=0, which in Matter.js coords is at groundScreenY.
     * @param {Object} dims - Canvas dimensions { width, groundScreenY, groundOffset }
     * @returns {Matter.Body}
     */
    createGround(dims) {
        // Ground body centered below the ground line
        // In Matter.js coords, ground surface is at groundScreenY
        return Matter.Bodies.rectangle(
            dims.width / 2,
            dims.groundScreenY + dims.groundOffset / 2,
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
     * Converts from world coords (Y-up) to Matter.js coords (Y-down).
     * @param {Object} node - Node with x, y, fixed properties
     * @param {number} groundScreenY - Screen Y position of ground line
     * @returns {Matter.Body}
     */
    createNodeBody(node, groundScreenY) {
        const radius = this.getNodeRadius();
        const matterY = this.worldToMatter(node.y, groundScreenY);
        return Matter.Bodies.circle(node.x, matterY, radius, {
            isStatic: node.fixed,
            mass: node.mass,
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
     * Only node-attached weights get physics bodies.
     * Segment-attached weights use direct force application instead.
     * Converts from world coords (Y-up) to Matter.js coords (Y-down).
     * @param {Object} weight - Weight with getPosition(), getRadius(), mass properties
     * @param {number} groundScreenY - Screen Y position of ground line
     * @returns {Matter.Body|null}
     */
    createWeightBody(weight, groundScreenY) {
        // Segment-attached weights don't need physics bodies
        // Their force is applied directly to segment nodes
        if (weight.attachedToSegment) {
            return null;
        }

        const pos = weight.getPosition();
        const matterY = this.worldToMatter(pos.y, groundScreenY);
        return Matter.Bodies.circle(pos.x, matterY, weight.getRadius(), {
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
     * Create constraint to attach a weight to its anchor point.
     * Only node-attached weights use constraints.
     * Segment-attached weights use direct force application instead.
     * @param {Object} weight - Weight with attachedToNode or attachedToSegment
     * @returns {Matter.Constraint|null}
     */
    createWeightConstraint(weight) {
        // Segment-attached weights don't use constraints
        // Their force is applied directly to segment nodes each frame
        if (weight.attachedToSegment || !weight.body) {
            return null;
        }

        if (weight.attachedToNode) {
            return Matter.Constraint.create({
                bodyA: weight.body,
                bodyB: weight.attachedToNode.body,
                stiffness: 1.0,
                damping: 0.3,
                length: 0
            });
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

            // For active muscles, use the constraint's current target length (which shrinks during contraction)
            // For passive segments, use the original rest length
            const material = MATERIALS[segment.material];
            const referenceLength = material?.isActive
                ? segment.constraint.length
                : segment.restLength;

            // Calculate tolerance based on reference length
            const tolerance = referenceLength * PhysicsController.TOLERANCE_RATIO;

            // Determine if in tension or compression relative to reference
            const inTension = segment.currentLength > referenceLength + tolerance;
            const inCompression = segment.currentLength < referenceLength - tolerance;

            // Apply tension-only / compression-only logic
            const shouldBeSlack =
                (segment.tensionOnly && inCompression) ||
                (segment.compressionOnly && inTension);

            segment.isSlack = shouldBeSlack;
            segment.constraint.stiffness = shouldBeSlack ? 0 : segment.stiffness;
        }
    }

    /**
     * Apply muscle contraction by adjusting constraint length.
     * Muscles actively shorten toward their target length (contractionRatio * restLength).
     * At 100% stress, muscle is overpowered and stops contracting.
     * If breakOnOverload is enabled, muscle permanently breaks (goes slack).
     * @param {Object} structure - Structure with segments array
     */
    applyMuscleContraction(structure) {
        for (const segment of structure.segments) {
            if (!segment.constraint || !segment.nodeA.body || !segment.nodeB.body) continue;

            const material = MATERIALS[segment.material];
            if (!material?.isActive) continue;

            // If already broken, keep it slack
            if (segment.isBroken) {
                segment.constraint.stiffness = 0;
                continue;
            }

            // Calculate target length (muscles can't stretch beyond 100% rest length)
            const targetLength = segment.restLength * segment.contractionRatio;

            const currentConstraintLength = segment.constraint.length;

            // Check if muscle is overpowered (at max stress)
            // When stress reaches 100%, the load exceeds muscle strength
            const isOverpowered = segment.stress >= 1.0;

            // If overloaded and breakOnOverload is enabled, break permanently
            if (isOverpowered && segment.breakOnOverload) {
                segment.isBroken = true;
                segment.constraint.stiffness = 0;
                continue;
            }

            if (!isOverpowered && currentConstraintLength > targetLength) {
                // Contract: reduce constraint length toward target
                // Rate determines how fast the muscle contracts
                const contractionRate = 0.5;  // pixels per frame toward target
                segment.constraint.length = Math.max(
                    targetLength,
                    currentConstraintLength - contractionRate
                );
            }

            // Store muscle state for stress/effort calculation
            segment.muscleTargetLength = targetLength;
        }
    }

    /**
     * Apply gravitational forces from segment-attached weights to segment nodes.
     * This replaces constraint-based attachment for segment weights, which is more
     * reliable for heavy weights (constraint solver struggles with the geometry).
     * @param {Object} structure - Structure with weights array
     */
    applySegmentWeightForces(structure) {
        // Matter.js internally scales gravity by this factor (default 0.001)
        // We must use the same scaling for consistent physics
        const gravityScale = this.engine.gravity.scale ?? 0.001;

        for (const weight of structure.weights) {
            if (!weight.attachedToSegment) continue;

            const seg = weight.attachedToSegment;
            if (!seg.nodeA.body || !seg.nodeB.body) continue;

            const posA = seg.nodeA.body.position;
            const posB = seg.nodeB.body.position;
            const t = weight.position;

            // Apply weight's gravitational force to segment nodes proportionally
            // Force = mass * gravity * scale (matching Matter.js internal calculation)
            const force = weight.mass * this.gravity.y * gravityScale;
            const forceA = force * (1 - t);
            const forceB = force * t;

            Matter.Body.applyForce(seg.nodeA.body, posA, { x: 0, y: forceA });
            Matter.Body.applyForce(seg.nodeB.body, posB, { x: 0, y: forceB });
        }
    }

    /**
     * Update ground position (call on window resize during simulation).
     * @param {Object} dims - New canvas dimensions { width, groundScreenY, groundOffset }
     */
    updateGroundPosition(dims) {
        if (this.groundBody) {
            Matter.Body.setPosition(this.groundBody, {
                x: dims.width / 2,
                y: dims.groundScreenY + dims.groundOffset / 2
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
