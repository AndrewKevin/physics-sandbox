/**
 * Structure Manager - Nodes, Segments, and Materials
 */

// Stress colours (must match CSS variables in styles.css)
export const STRESS_COLORS = {
    low: '#4ADE80',       // Green - healthy
    medium: '#FFE600',    // Yellow - warning
    high: '#FF6B35',      // Orange - danger
    critical: '#FF3AF2'   // Magenta - failure
};

// Material definitions
export const MATERIALS = {
    beam: {
        name: 'Rigid Beam',
        stiffness: 0.9,      // Slightly soft to show deformation
        damping: 0.1,
        color: '#00F5D4',
        compressionOnly: false,
        tensionOnly: false
    },
    spring: {
        name: 'Spring',
        stiffness: 0.2,      // Bouncy
        damping: 0.05,
        color: '#FFE600',
        compressionOnly: false,
        tensionOnly: false
    },
    cable: {
        name: 'Cable',
        stiffness: 0.7,      // Slightly stretchy
        damping: 0.02,
        color: '#FF6B35',
        compressionOnly: false,
        tensionOnly: true    // Cables only resist tension
    }
};

// Node class
export class Node {
    constructor(x, y) {
        this.id = Node.nextId++;
        this.x = x;
        this.y = y;
        this.fixed = false;
        this.body = null;  // Matter.js body reference
        this.selected = false;
        this.hovered = false;
    }

    static nextId = 0;
    static radius = 12;

    setFixed(fixed) {
        this.fixed = fixed;
        if (this.body) {
            this.body.isStatic = fixed;
        }
    }

    updatePosition(x, y) {
        this.x = x;
        this.y = y;
    }
}

// Segment class
export class Segment {
    constructor(nodeA, nodeB, material = 'beam') {
        this.id = Segment.nextId++;
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.material = material;
        this.constraint = null;  // Matter.js constraint reference
        this.restLength = this.calculateLength();
        this.currentLength = this.restLength;
        this.stress = 0;  // 0-1 normalised stress
        this.selected = false;
        this.hovered = false;

        // Per-segment adjustable properties (initialised from material)
        this.stiffness = MATERIALS[material].stiffness;
        this.damping = MATERIALS[material].damping;
        this.compressionOnly = MATERIALS[material].compressionOnly;
        this.tensionOnly = MATERIALS[material].tensionOnly;

        // Runtime state (set during simulation)
        this.isSlack = false;
        this.inTension = false;
        this.inCompression = false;
    }

    static nextId = 0;

    calculateLength() {
        const dx = this.nodeB.x - this.nodeA.x;
        const dy = this.nodeB.y - this.nodeA.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    updateStress() {
        if (!this.constraint) return 0;

        // Slack segments transmit no force
        if (this.isSlack) {
            this.stress = 0;
            return 0;
        }

        // currentLength is set by updateConstraintModes() in the physics loop
        // This avoids duplicate length calculations
        const length = this.currentLength ?? this.restLength;

        // Calculate strain (deformation ratio)
        const strain = Math.abs(length - this.restLength) / this.restLength;

        // Track tension/compression state
        this.inTension = length > this.restLength;
        this.inCompression = length < this.restLength;

        // Stress is proportional to internal force: Force = Stiffness × Strain
        // This means a stiff beam under small deformation shows similar stress
        // to a soft spring under large deformation (when under equal load)
        const force = strain * this.stiffness;
        this.stress = Math.min(force * 400, 1);

        return this.stress;
    }

    getStressColor() {
        // Interpolate between stress colors (traffic light gradient)
        if (this.stress < 0.25) {
            return STRESS_COLORS.low;
        } else if (this.stress < 0.5) {
            return STRESS_COLORS.medium;
        } else if (this.stress < 0.75) {
            return STRESS_COLORS.high;
        } else {
            return STRESS_COLORS.critical;
        }
    }
}

// Weight class - attachable to nodes or segments
export class Weight {
    constructor(target, position = 0.5, mass = 10) {
        this.id = Weight.nextId++;
        this.mass = mass;
        this.selected = false;
        this.hovered = false;
        this.body = null;  // Matter.js body reference
        this.constraints = null;  // Matter.js constraint(s) to attachment point(s)

        // Attachment - either a Node or a Segment
        if (target instanceof Node) {
            this.attachedToNode = target;
            this.attachedToSegment = null;
            this.position = 0;  // Not used for node attachment
        } else if (target instanceof Segment) {
            this.attachedToNode = null;
            this.attachedToSegment = target;
            this.position = Math.max(0, Math.min(1, position));  // 0-1 along segment
        } else {
            throw new Error('Weight must be attached to a Node or Segment');
        }
    }

    static nextId = 0;
    static minRadius = 10;
    static maxScale = 3;  // Maximum radius is 3x minRadius
    static minMass = 1;
    static maxMass = 100;
    static defaultMass = 10;

    /**
     * Get the visual radius based on mass.
     * Uses square root scaling so area is proportional to mass.
     * @returns {number} Radius in pixels
     */
    getRadius() {
        // Square root scaling feels more natural (area ~ mass)
        const t = (Math.sqrt(this.mass) - Math.sqrt(Weight.minMass)) /
                  (Math.sqrt(Weight.maxMass) - Math.sqrt(Weight.minMass));
        // Clamp t to [0, 1] in case mass is out of expected bounds
        const tClamped = Math.max(0, Math.min(1, t));
        return Weight.minRadius * (1 + (Weight.maxScale - 1) * tClamped);
    }

    /**
     * Get the world position of this weight.
     * During simulation, returns the physics body position.
     * Otherwise, returns node position or interpolates along segment.
     */
    getPosition() {
        // During simulation, use actual physics body position
        if (this.body) {
            return { ...this.body.position };
        }

        if (this.attachedToNode) {
            return { x: this.attachedToNode.x, y: this.attachedToNode.y };
        }

        if (this.attachedToSegment) {
            const seg = this.attachedToSegment;
            const posA = { x: seg.nodeA.x, y: seg.nodeA.y };
            const posB = { x: seg.nodeB.x, y: seg.nodeB.y };

            return {
                x: posA.x + (posB.x - posA.x) * this.position,
                y: posA.y + (posB.y - posA.y) * this.position
            };
        }

        return { x: 0, y: 0 };
    }

    /**
     * Set position along segment (0-1). Only valid for segment-attached weights.
     */
    setPosition(position) {
        if (this.attachedToSegment) {
            this.position = Math.max(0, Math.min(1, position));
        }
    }

    /**
     * Check if this weight is attached to the given target.
     */
    isAttachedTo(target) {
        return this.attachedToNode === target || this.attachedToSegment === target;
    }
}

// Structure Manager
export class StructureManager {
    constructor() {
        this.nodes = [];
        this.segments = [];
        this.weights = [];
        this.selectedNodes = [];
        this.selectedSegment = null;
        this.selectedWeight = null;
    }

    addNode(x, y) {
        const node = new Node(x, y);
        this.nodes.push(node);
        return node;
    }

    removeNode(node) {
        // Remove any weights attached to this node
        this.weights = this.weights.filter(w => !w.isAttachedTo(node));

        // Remove all segments connected to this node (and their attached weights)
        this.segments = this.segments.filter(seg => {
            if (seg.nodeA === node || seg.nodeB === node) {
                // Remove weights attached to this segment
                this.weights = this.weights.filter(w => !w.isAttachedTo(seg));
                return false;
            }
            return true;
        });

        // Remove the node
        const index = this.nodes.indexOf(node);
        if (index > -1) {
            this.nodes.splice(index, 1);
        }
    }

    addSegment(nodeA, nodeB, material = 'beam') {
        // Check if segment already exists
        const exists = this.segments.some(seg =>
            (seg.nodeA === nodeA && seg.nodeB === nodeB) ||
            (seg.nodeA === nodeB && seg.nodeB === nodeA)
        );

        if (exists || nodeA === nodeB) {
            return null;
        }

        const segment = new Segment(nodeA, nodeB, material);
        this.segments.push(segment);
        return segment;
    }

    removeSegment(segment) {
        // Remove any weights attached to this segment
        this.weights = this.weights.filter(w => !w.isAttachedTo(segment));

        const index = this.segments.indexOf(segment);
        if (index > -1) {
            this.segments.splice(index, 1);
        }
    }

    addWeight(target, position = 0.5, mass = Weight.defaultMass) {
        const weight = new Weight(target, position, mass);
        this.weights.push(weight);
        return weight;
    }

    removeWeight(weight) {
        const index = this.weights.indexOf(weight);
        if (index > -1) {
            this.weights.splice(index, 1);
        }
    }

    findWeightAt(x, y) {
        for (const weight of this.weights) {
            const pos = weight.getPosition();
            const dx = pos.x - x;
            const dy = pos.y - y;
            // Use weight's actual radius for hit detection
            const hitRadius = weight.getRadius() * 1.5;
            if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
                return weight;
            }
        }
        return null;
    }

    findNodeAt(x, y, radius = Node.radius * 2) {
        for (const node of this.nodes) {
            const dx = node.x - x;
            const dy = node.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < radius) {
                return node;
            }
        }
        return null;
    }

    findSegmentAt(x, y, threshold = 10) {
        for (const segment of this.segments) {
            const dist = this.pointToLineDistance(
                x, y,
                segment.nodeA.x, segment.nodeA.y,
                segment.nodeB.x, segment.nodeB.y
            );
            if (dist < threshold) {
                return segment;
            }
        }
        return null;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    clearSelection() {
        this.nodes.forEach(n => n.selected = false);
        this.segments.forEach(s => s.selected = false);
        this.weights.forEach(w => w.selected = false);
        this.selectedNodes = [];
        this.selectedSegment = null;
        this.selectedWeight = null;
    }

    selectNode(node) {
        this.clearSelection();
        node.selected = true;
        this.selectedNodes = [node];
    }

    selectSegment(segment) {
        this.clearSelection();
        segment.selected = true;
        this.selectedSegment = segment;
    }

    selectWeight(weight) {
        this.clearSelection();
        weight.selected = true;
        this.selectedWeight = weight;
    }

    updateAllStress() {
        let maxStress = 0;
        for (const segment of this.segments) {
            const stress = segment.updateStress();
            if (stress > maxStress) {
                maxStress = stress;
            }
        }
        return maxStress;
    }

    clear() {
        this.nodes = [];
        this.segments = [];
        this.weights = [];
        this.selectedNodes = [];
        this.selectedSegment = null;
        this.selectedWeight = null;
        Node.nextId = 0;
        Segment.nextId = 0;
        Weight.nextId = 0;
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            segmentCount: this.segments.length,
            weightCount: this.weights.length,
            maxStress: this.updateAllStress()
        };
    }

    /**
     * Serialize the structure to a plain object for saving/snapshot.
     * @returns {Object} Serialized structure data
     */
    serialize() {
        // Create node index map for segment/weight references
        const nodeIndexMap = new Map();
        this.nodes.forEach((node, index) => nodeIndexMap.set(node, index));

        // Create segment index map for weight references
        const segmentIndexMap = new Map();
        this.segments.forEach((segment, index) => segmentIndexMap.set(segment, index));

        return {
            nodes: this.nodes.map(node => ({
                x: node.x,
                y: node.y,
                fixed: node.fixed
            })),
            segments: this.segments.map(segment => ({
                nodeAIndex: nodeIndexMap.get(segment.nodeA),
                nodeBIndex: nodeIndexMap.get(segment.nodeB),
                material: segment.material,
                stiffness: segment.stiffness,
                damping: segment.damping,
                compressionOnly: segment.compressionOnly,
                tensionOnly: segment.tensionOnly
            })),
            weights: this.weights.map(weight => ({
                mass: weight.mass,
                position: weight.position,
                attachedToNodeIndex: weight.attachedToNode ? nodeIndexMap.get(weight.attachedToNode) : null,
                attachedToSegmentIndex: weight.attachedToSegment ? segmentIndexMap.get(weight.attachedToSegment) : null
            }))
        };
    }

    /**
     * Deserialize structure data and restore state.
     * @param {Object} data - Serialized structure data
     */
    deserialize(data) {
        // Clear current state
        this.clear();

        // Restore nodes
        for (const nodeData of data.nodes) {
            const node = this.addNode(nodeData.x, nodeData.y);
            node.fixed = nodeData.fixed;
        }

        // Restore segments (referencing restored nodes by index)
        for (const segmentData of data.segments) {
            const nodeA = this.nodes[segmentData.nodeAIndex];
            const nodeB = this.nodes[segmentData.nodeBIndex];
            const segment = this.addSegment(nodeA, nodeB, segmentData.material);
            if (segment) {
                segment.stiffness = segmentData.stiffness;
                segment.damping = segmentData.damping;
                segment.compressionOnly = segmentData.compressionOnly;
                segment.tensionOnly = segmentData.tensionOnly;
            }
        }

        // Restore weights (referencing restored nodes/segments by index)
        const weights = data.weights || [];
        for (const weightData of weights) {
            let target;
            if (weightData.attachedToNodeIndex !== null) {
                target = this.nodes[weightData.attachedToNodeIndex];
            } else if (weightData.attachedToSegmentIndex !== null) {
                target = this.segments[weightData.attachedToSegmentIndex];
            }
            if (target) {
                this.addWeight(target, weightData.position, weightData.mass);
            }
        }
    }

    /**
     * Create a snapshot of the current state (for simulation restore).
     * @returns {Object} Snapshot data
     */
    snapshot() {
        return this.serialize();
    }

    /**
     * Restore from a snapshot (for simulation restore).
     * @param {Object} snapshotData - Snapshot data from snapshot()
     */
    restore(snapshotData) {
        this.deserialize(snapshotData);
    }
}
