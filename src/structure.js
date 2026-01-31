/**
 * Structure Manager - Nodes, Segments, and Materials
 */

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

        // Amplify for visualisation (stiff constraints show small deformations)
        this.stress = Math.min(strain * 50, 1);

        return this.stress;
    }

    getStressColor() {
        // Interpolate between stress colors
        if (this.stress < 0.25) {
            return '#00F5D4';  // Low - Cyan
        } else if (this.stress < 0.5) {
            return '#FFE600';  // Medium - Yellow
        } else if (this.stress < 0.75) {
            return '#FF6B35';  // High - Orange
        } else {
            return '#FF3AF2';  // Critical - Magenta
        }
    }
}

// Structure Manager
export class StructureManager {
    constructor() {
        this.nodes = [];
        this.segments = [];
        this.selectedNodes = [];
        this.selectedSegment = null;
    }

    addNode(x, y) {
        const node = new Node(x, y);
        this.nodes.push(node);
        return node;
    }

    removeNode(node) {
        // Remove all segments connected to this node
        this.segments = this.segments.filter(seg => {
            if (seg.nodeA === node || seg.nodeB === node) {
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
        const index = this.segments.indexOf(segment);
        if (index > -1) {
            this.segments.splice(index, 1);
        }
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
        this.selectedNodes = [];
        this.selectedSegment = null;
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
        this.selectedNodes = [];
        this.selectedSegment = null;
        Node.nextId = 0;
        Segment.nextId = 0;
    }

    getStats() {
        return {
            nodeCount: this.nodes.length,
            segmentCount: this.segments.length,
            maxStress: this.updateAllStress()
        };
    }
}
