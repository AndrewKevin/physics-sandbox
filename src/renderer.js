/**
 * Custom Renderer for Physics Sandbox
 * Handles drawing nodes, segments, and stress visualisation
 */

import { Node, Weight, MATERIALS, STRESS_COLORS } from './structure.js';

export class Renderer {
    // Constants
    static GRID_SIZE = 20;
    static GRID_MAJOR_INTERVAL = 5;
    static GROUND_PATTERN_SPACING = 20;
    static DEFAULT_GROUND_OFFSET = 60;

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Design tokens
        this.colors = {
            bg: '#0D0D1A',
            grid: 'rgba(123, 47, 255, 0.1)',
            gridMajor: 'rgba(123, 47, 255, 0.2)',
            node: '#00F5D4',
            nodeFixed: '#FF3AF2',
            nodeHover: '#FFE600',
            nodeSelected: '#FFFFFF',
            segment: '#00F5D4',
            weight: '#FF6B35',
            weightHover: '#FFE600',
            weightSelected: '#FFFFFF',
            ground: '#2D1B4E'
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // Set both buffer and CSS dimensions to match (prevents coordinate scaling)
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
    }

    clear() {
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid() {
        const ctx = this.ctx;

        // Draw minor grid lines
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;

        for (let x = 0; x < this.width; x += Renderer.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }

        for (let y = 0; y < this.height; y += Renderer.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }

        // Draw major grid lines (every N cells)
        ctx.strokeStyle = this.colors.gridMajor;
        ctx.lineWidth = 1;

        for (let x = 0; x < this.width; x += Renderer.GRID_SIZE * Renderer.GRID_MAJOR_INTERVAL) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }

        for (let y = 0; y < this.height; y += Renderer.GRID_SIZE * Renderer.GRID_MAJOR_INTERVAL) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
    }

    drawGround(groundY) {
        const ctx = this.ctx;

        // Ground fill
        ctx.fillStyle = this.colors.ground;
        ctx.fillRect(0, groundY, this.width, this.height - groundY);

        // Ground line with glow
        ctx.strokeStyle = '#FF3AF2';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#FF3AF2';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(this.width, groundY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Ground pattern
        ctx.strokeStyle = 'rgba(255, 58, 242, 0.2)';
        ctx.lineWidth = 1;
        for (let y = groundY + Renderer.GROUND_PATTERN_SPACING; y < this.height; y += Renderer.GROUND_PATTERN_SPACING) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
    }

    drawSegment(segment, simulating = false) {
        const ctx = this.ctx;
        const nodeA = segment.nodeA;
        const nodeB = segment.nodeB;

        // Get actual positions (from physics body if simulating)
        const posA = nodeA.body && simulating
            ? nodeA.body.position
            : { x: nodeA.x, y: nodeA.y };
        const posB = nodeB.body && simulating
            ? nodeB.body.position
            : { x: nodeB.x, y: nodeB.y };

        // Get color based on stress when simulating
        const materialConfig = MATERIALS[segment.material];
        let color = materialConfig.color;
        if (simulating) {
            color = segment.getStressColor();
        }

        // Line width from material config
        const lineWidth = materialConfig.lineWidth;

        // Draw segment
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';

        // Check if segment is slack (tension-only compressed or compression-only stretched)
        const isSlack = segment.isSlack;

        // Apply slack styling - dashed line, reduced opacity
        if (isSlack) {
            ctx.globalAlpha = 0.4;
            ctx.setLineDash([8, 8]);
        }

        // Add glow when stressed or selected (but not when slack)
        if (!isSlack && (segment.stress > 0.5 || segment.selected)) {
            ctx.shadowColor = color;
            ctx.shadowBlur = segment.selected ? 20 : segment.stress * 30;
        }

        ctx.beginPath();

        if (segment.material === 'spring') {
            // Draw spring as zigzag
            this.drawSpringLine(ctx, posA.x, posA.y, posB.x, posB.y);
        } else if (segment.material === 'muscle') {
            // Draw muscle as fibrous parallel strands
            const config = materialConfig.patternConfig ?? { strands: 3, spacing: 2 };
            this.drawMuscleLine(ctx, posA.x, posA.y, posB.x, posB.y, config);
        } else {
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // Draw selection highlight - prominent outer glow with dashed indicator
        if (segment.selected) {
            // Outer glow
            ctx.strokeStyle = '#00F5D4';
            ctx.lineWidth = lineWidth + 10;
            ctx.globalAlpha = 0.3;
            ctx.shadowColor = '#00F5D4';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            // Dashed selection indicator
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw hover highlight
        if (segment.hovered && !segment.selected) {
            ctx.strokeStyle = '#FFE600';
            ctx.lineWidth = lineWidth + 2;
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(posA.x, posA.y);
            ctx.lineTo(posB.x, posB.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    drawSpringLine(ctx, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const segments = Math.max(8, Math.floor(length / 10));
        const amplitude = 8;

        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(angle);

        ctx.moveTo(0, 0);

        for (let i = 1; i < segments; i++) {
            const x = (i / segments) * length;
            const y = (i % 2 === 0 ? -1 : 1) * amplitude;
            ctx.lineTo(x, y);
        }

        ctx.lineTo(length, 0);
        ctx.restore();
    }

    /**
     * Draw a fibrous/striated muscle line with multiple parallel strands.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x1 - Start X
     * @param {number} y1 - Start Y
     * @param {number} x2 - End X
     * @param {number} y2 - End Y
     * @param {Object} config - Pattern config { strands, spacing }
     */
    drawMuscleLine(ctx, x1, y1, x2, y2, config = {}) {
        const strands = config.strands ?? 3;
        const spacing = config.spacing ?? 2;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        // Perpendicular offset direction
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);

        // Calculate total width and starting offset to centre the strands
        const totalWidth = (strands - 1) * spacing;
        const startOffset = -totalWidth / 2;

        // Draw each strand
        for (let i = 0; i < strands; i++) {
            const offset = startOffset + i * spacing;
            const offsetX = perpX * offset;
            const offsetY = perpY * offset;

            ctx.moveTo(x1 + offsetX, y1 + offsetY);
            ctx.lineTo(x2 + offsetX, y2 + offsetY);
        }
    }

    drawNode(node, simulating = false) {
        const ctx = this.ctx;

        // Ground anchors have special rendering
        if (node.isGroundAnchor) {
            this.drawGroundAnchor(node);
            return;
        }

        const radius = Node.radius;

        // Get actual position (from physics body if simulating)
        const pos = node.body && simulating
            ? node.body.position
            : { x: node.x, y: node.y };

        // Determine colors
        let fillColor = this.colors.node;
        let strokeColor = '#FFFFFF';

        if (node.fixed) {
            fillColor = this.colors.nodeFixed;
        }

        if (node.selected) {
            strokeColor = this.colors.nodeSelected;
        } else if (node.hovered) {
            fillColor = this.colors.nodeHover;
        }

        // Draw prominent selection ring for selected nodes
        if (node.selected) {
            // Outer glow ring
            ctx.strokeStyle = '#00F5D4';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00F5D4';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Dashed selection indicator
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw glow
        if (node.selected || node.hovered || node.fixed) {
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = node.selected ? 25 : 15;
        }

        // Draw node circle
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = node.selected ? 4 : 3;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
    }

    /**
     * Draw a ground anchor point (small, fixed, non-editable).
     * @param {Node} node - The ground anchor node
     */
    drawGroundAnchor(node) {
        const ctx = this.ctx;
        const radius = Node.anchorRadius;
        const pos = { x: node.x, y: node.y };

        // Subtle glow when hovered
        if (node.hovered) {
            ctx.shadowColor = this.colors.nodeFixed;
            ctx.shadowBlur = 10;
        }

        // Draw small circle with ground colour
        ctx.fillStyle = this.colors.nodeFixed;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
    }

    drawWeight(weight, simulating = false) {
        const ctx = this.ctx;
        const radius = weight.getRadius();  // Dynamic radius based on mass

        // Get position (interpolated if attached to segment)
        const pos = weight.getPosition();

        // Determine colors
        let fillColor = this.colors.weight;
        let strokeColor = '#FFFFFF';

        if (weight.selected) {
            strokeColor = this.colors.weightSelected;
        } else if (weight.hovered) {
            fillColor = this.colors.weightHover;
        }

        // Draw prominent selection ring for selected weights
        if (weight.selected) {
            // Outer glow ring
            ctx.strokeStyle = '#00F5D4';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#00F5D4';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Dashed selection indicator
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw glow (scale with radius)
        if (weight.selected || weight.hovered) {
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = weight.selected ? 20 + radius * 0.5 : 10 + radius * 0.5;
        }

        // Draw weight as a filled circle with heavier border
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = weight.selected ? 4 : 3;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Draw mass label (scale font with radius)
        const fontSize = Math.round(8 + radius * 0.3);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(weight.mass.toFixed(0), pos.x, pos.y);

        // Draw attachment line to segment midpoint if attached to segment
        if (weight.attachedToSegment && simulating) {
            const seg = weight.attachedToSegment;
            const nodeA = seg.nodeA;
            const nodeB = seg.nodeB;

            const posA = nodeA.body ? nodeA.body.position : { x: nodeA.x, y: nodeA.y };
            const posB = nodeB.body ? nodeB.body.position : { x: nodeB.x, y: nodeB.y };

            // Attachment point on segment
            const attachX = posA.x + (posB.x - posA.x) * weight.position;
            const attachY = posA.y + (posB.y - posA.y) * weight.position;

            // Draw thin line from attachment point to weight body
            if (weight.body) {
                ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(attachX, attachY);
                ctx.lineTo(weight.body.position.x, weight.body.position.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }

    /**
     * Draw connection preview line(s) from selected node(s) to cursor.
     * @param {Node[]} selectedNodes - Array of selected nodes
     * @param {number} endX - Cursor X position
     * @param {number} endY - Cursor Y position
     * @param {boolean} showGhostNode - Whether to show ghost node at cursor
     */
    drawConnectionPreview(selectedNodes, endX, endY, showGhostNode = true) {
        if (!selectedNodes || selectedNodes.length === 0) return;

        const ctx = this.ctx;

        // Draw connector lines
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.5)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);

        for (const node of selectedNodes) {
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.setLineDash([]);

        // Draw ghost node at cursor position
        if (showGhostNode) {
            const radius = Node.radius;

            ctx.globalAlpha = 0.5;

            // Glow
            ctx.shadowColor = this.colors.node;
            ctx.shadowBlur = 12;

            // Ghost node circle
            ctx.fillStyle = this.colors.node;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(endX, endY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    }

    drawStressLabel(segment, simulating = false) {
        const ctx = this.ctx;
        const nodeA = segment.nodeA;
        const nodeB = segment.nodeB;

        // Get actual positions (from physics body if simulating)
        const posA = nodeA.body && simulating
            ? nodeA.body.position
            : { x: nodeA.x, y: nodeA.y };
        const posB = nodeB.body && simulating
            ? nodeB.body.position
            : { x: nodeB.x, y: nodeB.y };

        // Calculate midpoint
        const midX = (posA.x + posB.x) / 2;
        const midY = (posA.y + posB.y) / 2;

        // Calculate segment angle for label offset
        const angle = Math.atan2(posB.y - posA.y, posB.x - posA.x);
        // Offset perpendicular to segment
        const offsetDist = 18;
        const offsetX = Math.sin(angle) * offsetDist;
        const offsetY = -Math.cos(angle) * offsetDist;

        // Get stress percentage and colour
        const stressColor = segment.getStressColor();

        // Draw background pill
        const text = `${Math.round(segment.stress * 100)}`;
        ctx.font = 'bold 11px "DM Sans", sans-serif';
        const textWidth = ctx.measureText(text).width;
        const pillWidth = textWidth + 10;
        const pillHeight = 18;
        const pillX = midX + offsetX - pillWidth / 2;
        const pillY = midY + offsetY - pillHeight / 2;

        // Semi-transparent background
        ctx.fillStyle = 'rgba(13, 13, 26, 0.85)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 4);
        } else {
            // Fallback for older browsers
            ctx.rect(pillX, pillY, pillWidth, pillHeight);
        }
        ctx.fill();

        // Border matching stress colour
        ctx.strokeStyle = stressColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Text
        ctx.fillStyle = stressColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX + offsetX, midY + offsetY);
    }

    /**
     * Draw joint angle arcs at a node.
     * @param {Node} node - The node with joints
     * @param {Object} jointData - { anglePairs: [...] } from JointController
     * @param {boolean} simulating - Whether physics is running
     */
    drawJointArcs(node, jointData, simulating = false) {
        const ctx = this.ctx;

        // Get node position
        const pos = simulating && node.body
            ? node.body.position
            : { x: node.x, y: node.y };

        const baseRadius = Node.radius + 10;
        const radiusStep = 14;

        for (let i = 0; i < jointData.anglePairs.length; i++) {
            const pair = jointData.anglePairs[i];
            const arcRadius = baseRadius + i * radiusStep;

            // Get angles to segment endpoints
            const angleA = this.getSegmentAngleForArc(node, pair.segmentA, simulating);
            const angleB = this.getSegmentAngleForArc(node, pair.segmentB, simulating);

            // Normalise to draw the smaller arc
            const { startAngle, endAngle, clockwise } = this.normaliseArcAngles(angleA, angleB);

            // Colour and thickness by load path stress during simulation
            // Load path stress = min(stressA, stressB) — highlights where load flows through
            const stress = pair.loadPathStress ?? 0;

            // In sim mode: grey for zero load, stress colour otherwise
            // In design mode: always cyan
            let color;
            if (simulating) {
                color = stress > 0 ? this.getStressColor(stress) : '#666666';
            } else {
                color = STRESS_COLORS.low;
            }

            // Thickness scales with load: 2px (no load) to 6px (critical)
            const thickness = simulating
                ? (stress > 0 ? 2 + stress * 4 : 1)
                : 2;

            // Draw arc
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, arcRadius, startAngle, endAngle, clockwise);
            ctx.stroke();

            // Draw label at arc midpoint
            const midAngle = clockwise
                ? startAngle - (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI) / 2
                : (startAngle + endAngle) / 2;
            const labelRadius = arcRadius + 10;
            const labelX = pos.x + Math.cos(midAngle) * labelRadius;
            const labelY = pos.y + Math.sin(midAngle) * labelRadius;

            // Sim mode: show stress intensity (0-100), Design mode: show angle
            const text = simulating
                ? `${Math.round(stress * 100)}`
                : `${Math.round(pair.angle * 180 / Math.PI)}°`;

            // Draw label background pill
            ctx.font = 'bold 10px "DM Sans", sans-serif';
            const textWidth = ctx.measureText(text).width;
            const pillWidth = textWidth + 6;
            const pillHeight = 14;

            ctx.fillStyle = 'rgba(13, 13, 26, 0.85)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(labelX - pillWidth / 2, labelY - pillHeight / 2, pillWidth, pillHeight, 3);
            } else {
                ctx.rect(labelX - pillWidth / 2, labelY - pillHeight / 2, pillWidth, pillHeight);
            }
            ctx.fill();

            // Label text
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, labelX, labelY);
        }
    }

    /**
     * Get the angle from a node towards a segment's other endpoint.
     * @param {Node} node - The junction node
     * @param {Segment} segment - The segment
     * @param {boolean} simulating - Use physics body positions if true
     * @returns {number} Angle in radians (-PI to PI)
     */
    getSegmentAngleForArc(node, segment, simulating) {
        const getPos = (n) => simulating && n.body
            ? n.body.position
            : { x: n.x, y: n.y };

        const other = segment.nodeA === node ? segment.nodeB : segment.nodeA;
        const nodePos = getPos(node);
        const otherPos = getPos(other);

        return Math.atan2(otherPos.y - nodePos.y, otherPos.x - nodePos.x);
    }

    /**
     * Normalise arc angles to draw the smaller arc between two directions.
     * @param {number} angleA - First angle in radians
     * @param {number} angleB - Second angle in radians
     * @returns {{ startAngle: number, endAngle: number, clockwise: boolean }}
     */
    normaliseArcAngles(angleA, angleB) {
        // Calculate the angular difference
        let diff = angleB - angleA;

        // Normalise to [-PI, PI]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        // If diff is positive, angleB is counterclockwise from angleA
        // If diff is negative, angleB is clockwise from angleA
        // We want to draw the smaller arc
        if (diff >= 0) {
            return { startAngle: angleA, endAngle: angleB, clockwise: false };
        } else {
            return { startAngle: angleA, endAngle: angleB, clockwise: true };
        }
    }

    /**
     * Get colour for a normalised stress value (0-1).
     * Used for joints, segments, and any stress visualisation.
     * @param {number} stress - Stress value 0-1
     * @returns {string} Hex colour
     */
    getStressColor(stress) {
        if (stress < 0.25) return STRESS_COLORS.low;
        if (stress < 0.50) return STRESS_COLORS.medium;
        if (stress < 0.75) return STRESS_COLORS.high;
        return STRESS_COLORS.critical;
    }

    /**
     * Draw a selection box (rubber-band rectangle).
     * @param {Object} rect - { x, y, width, height }
     * @param {Node[]} nodesInside - Nodes currently inside the box (for preview highlight)
     */
    drawSelectionBox(rect, nodesInside = []) {
        if (!rect) return;

        const ctx = this.ctx;

        // Semi-transparent fill
        ctx.fillStyle = 'rgba(0, 245, 212, 0.1)';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

        // Dashed border with glow
        ctx.strokeStyle = '#00F5D4';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.shadowColor = '#00F5D4';
        ctx.shadowBlur = 8;

        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        // Highlight nodes that would be selected (preview)
        for (const node of nodesInside) {
            if (!node.selected) {
                // Draw preview highlight ring for unselected nodes
                ctx.strokeStyle = 'rgba(0, 245, 212, 0.5)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(node.x, node.y, 12 + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    /**
     * Draw paste preview (ghost nodes and segments following cursor).
     * @param {Object} pastePreview - { nodes: [{x, y, fixed}], segments: [{fromIndex, toIndex}] }
     */
    drawPastePreview(pastePreview) {
        if (!pastePreview) return;

        const ctx = this.ctx;
        const { nodes, segments } = pastePreview;

        // Draw ghost segments first (behind nodes)
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#00F5D4';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 4]);

        for (const seg of segments) {
            const nodeA = nodes[seg.fromIndex];
            const nodeB = nodes[seg.toIndex];
            if (nodeA && nodeB) {
                ctx.beginPath();
                ctx.moveTo(nodeA.x, nodeA.y);
                ctx.lineTo(nodeB.x, nodeB.y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);

        // Draw ghost nodes
        const radius = Node.radius;
        for (const node of nodes) {
            const fillColor = node.fixed ? this.colors.nodeFixed : this.colors.node;

            // Glow
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = 15;

            // Node circle
            ctx.fillStyle = fillColor;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;

            // Fixed indicator
            if (node.fixed) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('⚓', node.x, node.y);
            }
        }

        ctx.globalAlpha = 1;
    }

    render(structure, state = {}) {
        const {
            simulating = false,
            groundY = this.height - Renderer.DEFAULT_GROUND_OFFSET,
            mouseX = 0,
            mouseY = 0,
            showStressLabels = false,
            showJointAngles = false,
            jointData = null,
            selectionBox = null,
            pastePreview = null,
            isHoveringElement = false,
            isDragging = false
        } = state;

        this.clear();
        this.drawGrid();
        this.drawGround(groundY);

        // Draw segments first (behind nodes)
        for (const segment of structure.segments) {
            this.drawSegment(segment, simulating);
        }

        // Draw stress labels on top of segments (when enabled and simulating)
        if (showStressLabels && simulating) {
            for (const segment of structure.segments) {
                this.drawStressLabel(segment, simulating);
            }
        }

        // Draw weights (on top of segments, behind nodes)
        for (const weight of structure.weights) {
            this.drawWeight(weight, simulating);
        }

        // Draw nodes
        for (const node of structure.nodes) {
            this.drawNode(node, simulating);
        }

        // Draw joint overlay (angles in plan mode, stress in sim mode)
        if (showJointAngles && jointData) {
            for (const [node, data] of jointData) {
                this.drawJointArcs(node, data, simulating);
            }
        }

        // Draw connection preview from all selected nodes to cursor
        // (but not during paste preview or dragging)
        const selectedNodes = structure.selectedNodes;
        if (!simulating && selectedNodes.length > 0 && !pastePreview && !isDragging) {
            // Show ghost node only when hovering empty space (not an element)
            const showGhostNode = !isHoveringElement;
            this.drawConnectionPreview(selectedNodes, mouseX, mouseY, showGhostNode);
        }

        // Draw selection box overlay (on top of everything)
        if (!simulating && selectionBox?.rect) {
            this.drawSelectionBox(selectionBox.rect, selectionBox.nodesInside || []);
        }

        // Draw paste preview (on top of everything)
        if (!simulating && pastePreview) {
            this.drawPastePreview(pastePreview);
        }
    }
}
