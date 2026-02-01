/**
 * Structure Manager - Nodes, Segments, and Materials
 */

import Matter from 'matter-js';
import { MATERIALS } from './materials.js';

// Re-export MATERIALS for backward compatibility
export { MATERIALS };

// Stress colours (must match CSS variables in styles.css)
export const STRESS_COLORS = {
    low: '#4ADE80',       // Green - healthy
    medium: '#FFE600',    // Yellow - warning
    high: '#FF6B35',      // Orange - danger
    critical: '#FF3AF2'   // Magenta - failure
};

// Node class
export class Node {
    constructor(x, y) {
        this.id = Node.nextId++;
        this.x = x;
        this.y = y;
        this.fixed = false;
        this.mass = Node.defaultMass;
        this.body = null;  // Matter.js body reference
        this.selected = false;
        this.hovered = false;
    }

    static nextId = 0;
    static radius = 12;
    static minMass = 0.1;
    static maxMass = 50;
    static defaultMass = 5;

    setFixed(fixed) {
        this.fixed = fixed;
        if (this.body) {
            this.body.isStatic = fixed;
        }
    }

    setMass(mass) {
        this.mass = Math.max(Node.minMass, Math.min(Node.maxMass, mass));
        if (this.body) {
            Matter.Body.setMass(this.body, this.mass);
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

    /**
     * Apply a material to this segment, updating all physics properties.
     * @param {string} material - Material key from MATERIALS
     */
    setMaterial(material) {
        const mat = MATERIALS[material];
        if (!mat) return;

        this.material = material;
        this.stiffness = mat.stiffness;
        this.damping = mat.damping;
        this.compressionOnly = mat.compressionOnly;
        this.tensionOnly = mat.tensionOnly;
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
        // During simulation, use actual physics body position (node-attached weights)
        if (this.body) {
            return { ...this.body.position };
        }

        if (this.attachedToNode) {
            return { x: this.attachedToNode.x, y: this.attachedToNode.y };
        }

        if (this.attachedToSegment) {
            const seg = this.attachedToSegment;
            // Use physics body positions during simulation, static positions otherwise
            const posA = seg.nodeA.body
                ? seg.nodeA.body.position
                : { x: seg.nodeA.x, y: seg.nodeA.y };
            const posB = seg.nodeB.body
                ? seg.nodeB.body.position
                : { x: seg.nodeB.x, y: seg.nodeB.y };

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

    /**
     * Split a segment at a given position, creating a new node and two new segments.
     * Preserves material properties and reassigns any attached weights.
     * @param {Segment} segment - The segment to split
     * @param {number} position - Position along segment (0-1) where to split
     * @returns {{ node: Node, segmentA: Segment, segmentB: Segment }} The created elements
     */
    splitSegment(segment, position) {
        // Clamp position to avoid creating zero-length segments
        const t = Math.max(0.1, Math.min(0.9, position));

        // Calculate the new node position
        const newX = segment.nodeA.x + (segment.nodeB.x - segment.nodeA.x) * t;
        const newY = segment.nodeA.y + (segment.nodeB.y - segment.nodeA.y) * t;

        // Store original properties
        const { material, stiffness, damping, compressionOnly, tensionOnly } = segment;
        const originalNodeA = segment.nodeA;
        const originalNodeB = segment.nodeB;

        // Find weights attached to this segment before removal
        const attachedWeights = this.weights.filter(w => w.attachedToSegment === segment);

        // Remove the original segment (but preserve weights - we'll reassign them)
        const segmentIndex = this.segments.indexOf(segment);
        if (segmentIndex > -1) {
            this.segments.splice(segmentIndex, 1);
        }

        // Create the new node
        const newNode = this.addNode(newX, newY);

        // Create two new segments with same properties
        const segmentA = new Segment(originalNodeA, newNode, material);
        segmentA.stiffness = stiffness;
        segmentA.damping = damping;
        segmentA.compressionOnly = compressionOnly;
        segmentA.tensionOnly = tensionOnly;
        this.segments.push(segmentA);

        const segmentB = new Segment(newNode, originalNodeB, material);
        segmentB.stiffness = stiffness;
        segmentB.damping = damping;
        segmentB.compressionOnly = compressionOnly;
        segmentB.tensionOnly = tensionOnly;
        this.segments.push(segmentB);

        // Reassign weights to the appropriate new segment
        for (const weight of attachedWeights) {
            if (weight.position < t) {
                // Weight is on the first segment (nodeA to newNode)
                weight.attachedToSegment = segmentA;
                weight.position = weight.position / t;
            } else {
                // Weight is on the second segment (newNode to nodeB)
                weight.attachedToSegment = segmentB;
                weight.position = (weight.position - t) / (1 - t);
            }
        }

        return { node: newNode, segmentA, segmentB };
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

    /**
     * Add a node to the current selection without clearing.
     * Used for shift+click additive selection.
     * @param {Node} node - Node to add
     */
    addToSelection(node) {
        if (!this.selectedNodes.includes(node)) {
            node.selected = true;
            this.selectedNodes.push(node);
        }
        // Clear segment/weight selection when multi-selecting nodes
        if (this.selectedSegment) {
            this.selectedSegment.selected = false;
            this.selectedSegment = null;
        }
        if (this.selectedWeight) {
            this.selectedWeight.selected = false;
            this.selectedWeight = null;
        }
    }

    /**
     * Remove a node from selection.
     * @param {Node} node - Node to remove
     */
    removeFromSelection(node) {
        const index = this.selectedNodes.indexOf(node);
        if (index > -1) {
            node.selected = false;
            this.selectedNodes.splice(index, 1);
        }
    }

    /**
     * Toggle node in selection (for shift+click).
     * @param {Node} node - Node to toggle
     */
    toggleNodeSelection(node) {
        if (this.selectedNodes.includes(node)) {
            this.removeFromSelection(node);
        } else {
            this.addToSelection(node);
        }
    }

    /**
     * Select multiple nodes at once (replaces current selection).
     * Used when selection box completes without shift.
     * @param {Node[]} nodes - Array of nodes to select
     */
    selectMultipleNodes(nodes) {
        this.clearSelection();
        for (const node of nodes) {
            node.selected = true;
            this.selectedNodes.push(node);
        }
    }

    /**
     * Add multiple nodes to selection (for shift+selection box).
     * @param {Node[]} nodes - Array of nodes to add
     */
    addMultipleToSelection(nodes) {
        for (const node of nodes) {
            this.addToSelection(node);
        }
    }

    /**
     * Find all nodes within a rectangular bounds.
     * @param {Object} rect - { x, y, width, height } rectangle
     * @returns {Node[]} Array of nodes inside the rectangle
     */
    findNodesInRect(rect) {
        const { x, y, width, height } = rect;
        const minX = x;
        const maxX = x + width;
        const minY = y;
        const maxY = y + height;

        return this.nodes.filter(node =>
            node.x >= minX && node.x <= maxX &&
            node.y >= minY && node.y <= maxY
        );
    }

    /**
     * Check if multiple nodes are selected.
     * @returns {boolean}
     */
    hasMultipleNodesSelected() {
        return this.selectedNodes.length > 1;
    }

    /**
     * Find all segments where both endpoints are in the given node set.
     * Used for copy/paste to get segments between selected nodes.
     * @param {Node[]} nodes - Array of nodes to check
     * @returns {Segment[]} Array of segments connecting the nodes
     */
    getSegmentsBetweenNodes(nodes) {
        const nodeSet = new Set(nodes);
        return this.segments.filter(segment =>
            nodeSet.has(segment.nodeA) && nodeSet.has(segment.nodeB)
        );
    }

    /**
     * Find all weights attached to the given nodes.
     * @param {Node[]} nodes - Array of nodes to check
     * @returns {Weight[]} Array of weights attached to those nodes
     */
    getWeightsForNodes(nodes) {
        const nodeSet = new Set(nodes);
        return this.weights.filter(weight =>
            weight.attachedToNode && nodeSet.has(weight.attachedToNode)
        );
    }

    /**
     * Find all weights attached to the given segments.
     * @param {Segment[]} segments - Array of segments to check
     * @returns {Weight[]} Array of weights attached to those segments
     */
    getWeightsForSegments(segments) {
        const segmentSet = new Set(segments);
        return this.weights.filter(weight =>
            weight.attachedToSegment && segmentSet.has(weight.attachedToSegment)
        );
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
                fixed: node.fixed,
                mass: node.mass
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
            node.mass = nodeData.mass ?? Node.defaultMass;
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
