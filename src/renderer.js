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

    /**
     * Convert Matter.js Y (Y-down) to world Y (Y-up) for rendering during simulation.
     * @param {number} matterY - Y position from Matter.js body
     * @returns {number} Y position in world coords
     */
    matterToWorldY(matterY) {
        return this.groundScreenY - matterY;
    }

    /**
     * Get position for rendering, handling both simulation and design modes.
     * During simulation, converts Matter.js Y-down coords to world Y-up coords.
     * @param {Object} element - Node or object with x, y and optional body
     * @param {boolean} simulating - Whether physics is running
     * @returns {{ x: number, y: number }} Position in world coords (Y-up)
     */
    getWorldPos(element, simulating) {
        if (element.body && simulating) {
            return {
                x: element.body.position.x,
                y: this.matterToWorldY(element.body.position.y)
            };
        }
        return { x: element.x, y: element.y };
    }

    /**
     * Get weight position for rendering, handling both simulation and design modes.
     * During simulation, converts Matter.js Y-down coords to world Y-up coords.
     * Handles both node-attached weights (with physics bodies) and segment-attached weights.
     * @param {Object} weight - Weight object
     * @param {boolean} simulating - Whether physics is running
     * @returns {{ x: number, y: number }} Position in world coords (Y-up)
     */
    getWeightWorldPos(weight, simulating) {
        // Node-attached weights have physics bodies during simulation
        if (weight.body && simulating) {
            return {
                x: weight.body.position.x,
                y: this.matterToWorldY(weight.body.position.y)
            };
        }

        // Segment-attached weights interpolate between node positions
        if (weight.attachedToSegment && simulating) {
            const seg = weight.attachedToSegment;
            const posA = this.getWorldPos(seg.nodeA, simulating);
            const posB = this.getWorldPos(seg.nodeB, simulating);
            return {
                x: posA.x + (posB.x - posA.x) * weight.position,
                y: posA.y + (posB.y - posA.y) * weight.position
            };
        }

        // Design mode or node-attached without body: use stored position
        return weight.getPosition();
    }

    /**
     * Draw text at a position, counter-flipping Y so text appears right-side-up.
     * Use this when drawing text in world-space (after Y-flip transform is applied).
     * @param {string} text - Text to draw
     * @param {number} x - X position in world coords
     * @param {number} y - Y position in world coords
     * @param {Object} options - { font, fillStyle, textAlign, textBaseline }
     */
    drawWorldText(text, x, y, options = {}) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, -1);  // Counter-flip Y for text
        ctx.font = options.font ?? '12px sans-serif';
        ctx.fillStyle = options.fillStyle ?? '#FFFFFF';
        ctx.textAlign = options.textAlign ?? 'center';
        ctx.textBaseline = options.textBaseline ?? 'middle';
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    /**
     * Draw a rounded rect background (pill) for labels, counter-flipping Y.
     * @param {number} x - Center X in world coords
     * @param {number} y - Center Y in world coords
     * @param {number} width - Pill width
     * @param {number} height - Pill height
     * @param {Object} options - { fillStyle, strokeStyle, lineWidth, radius }
     */
    drawWorldPill(x, y, width, height, options = {}) {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, -1);  // Counter-flip Y

        const pillX = -width / 2;
        const pillY = -height / 2;

        ctx.fillStyle = options.fillStyle ?? 'rgba(13, 13, 26, 0.85)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(pillX, pillY, width, height, options.radius ?? 4);
        } else {
            ctx.rect(pillX, pillY, width, height);
        }
        ctx.fill();

        if (options.strokeStyle) {
            ctx.strokeStyle = options.strokeStyle;
            ctx.lineWidth = options.lineWidth ?? 1.5;
            ctx.stroke();
        }

        ctx.restore();
    }

    clear() {
        this.ctx.fillStyle = this.colors.bg;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /**
     * Draw grid aligned to ground level (Y=0 in world coords).
     * Grid lines at Y=0, 20, 40... with major lines at Y=0, 100, 200...
     * Grid only appears within the placeable area (0 to worldWidth, 0 to worldHeight).
     * Called after Y-flip transform, so draws in world coords (Y-up).
     * @param {number} worldWidth - Width of the world in world units
     * @param {number} worldHeight - Height of the buildable area in world units
     * @param {Object} viewport - Viewport state { zoom, panX, panY }
     */
    drawGrid(worldWidth = this.width, worldHeight = this.height, viewport = { zoom: 1, panX: 0, panY: 0 }) {
        const ctx = this.ctx;
        const gridSize = Renderer.GRID_SIZE;
        const majorInterval = gridSize * Renderer.GRID_MAJOR_INTERVAL;

        // Calculate visible world bounds (Y-up coords)
        // panY is the world Y at the bottom of the visible area
        const worldLeft = viewport.panX;
        const worldRight = viewport.panX + this.width / viewport.zoom;
        const worldBottom = viewport.panY;  // Lowest visible Y
        const worldTop = viewport.panY + this.height / viewport.zoom;  // Highest visible Y

        // Placeable area bounds (where nodes can exist) in Y-up coords
        const placeableLeft = 0;
        const placeableBottom = 0;  // Ground level
        const placeableRight = worldWidth;
        const placeableTop = worldHeight;  // Top of buildable area

        // Clamp visible bounds to placeable area for grid rendering
        const gridLeft = Math.max(worldLeft, placeableLeft);
        const gridBottom = Math.max(worldBottom, placeableBottom);
        const gridRight = Math.min(worldRight, placeableRight);
        const gridTop = Math.min(worldTop, placeableTop);

        // Don't draw if no overlap with placeable area
        if (gridLeft >= gridRight || gridBottom >= gridTop) return;

        // Calculate first and last grid lines within clamped bounds
        const firstX = Math.floor(gridLeft / gridSize) * gridSize;
        const lastX = Math.ceil(gridRight / gridSize) * gridSize;
        const firstY = Math.floor(gridBottom / gridSize) * gridSize;
        const lastY = Math.ceil(gridTop / gridSize) * gridSize;

        ctx.lineWidth = 1;

        // Vertical lines (X axis) - major lines at x = 0, 100, 200...
        for (let x = firstX; x <= lastX; x += gridSize) {
            if (x < placeableLeft || x > placeableRight) continue;
            const isMajor = (x % majorInterval) === 0;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
            ctx.beginPath();
            ctx.moveTo(x, gridBottom);
            ctx.lineTo(x, gridTop);
            ctx.stroke();
        }

        // Horizontal lines (Y axis) - major lines at Y = 0, 100, 200...
        for (let y = firstY; y <= lastY; y += gridSize) {
            if (y < placeableBottom || y > placeableTop) continue;
            // Major lines at Y = 0, 100, 200... (multiples of majorInterval)
            const isMajor = (y % majorInterval) === 0;
            ctx.strokeStyle = isMajor ? this.colors.gridMajor : this.colors.grid;
            ctx.beginPath();
            ctx.moveTo(gridLeft, y);
            ctx.lineTo(gridRight, y);
            ctx.stroke();
        }

        // Draw boundary line at the right edge of placeable area (if visible)
        if (placeableRight > worldLeft && placeableRight < worldRight) {
            ctx.strokeStyle = 'rgba(255, 58, 242, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(placeableRight, gridBottom);
            ctx.lineTo(placeableRight, gridTop);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw boundary line at the top edge (Y = worldHeight) if visible
        if (placeableTop < worldTop && placeableTop > worldBottom) {
            ctx.strokeStyle = 'rgba(255, 58, 242, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(gridLeft, placeableTop);
            ctx.lineTo(gridRight, placeableTop);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw boundary line at the left edge (X = 0) if visible
        if (placeableLeft > worldLeft && placeableLeft < worldRight) {
            ctx.strokeStyle = 'rgba(255, 58, 242, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(placeableLeft, gridBottom);
            ctx.lineTo(placeableLeft, gridTop);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    /**
     * Draw the ground area below Y=0.
     * In Y-up coords, ground is at Y=0 and extends into negative Y.
     * Called after Y-flip transform, so draws in world coords.
     * @param {number} worldWidth - Width of the world in world units
     * @param {Object} viewport - Viewport state { zoom, panX, panY }
     */
    drawGround(_worldWidth = this.width, viewport = { zoom: 1, panX: 0, panY: 0 }) {
        const ctx = this.ctx;

        // Calculate visible world bounds (Y-up)
        const worldLeft = viewport.panX;
        const worldRight = viewport.panX + this.width / viewport.zoom;
        const worldBottom = viewport.panY;  // Lowest visible Y

        // Ground fill - extends below Y=0 (into negative Y space)
        // We need to cover from Y=0 down to the lowest visible point
        const groundDepth = Math.max(100, -worldBottom + 100);  // Ensure enough coverage
        ctx.fillStyle = this.colors.ground;
        ctx.fillRect(worldLeft, -groundDepth, worldRight - worldLeft, groundDepth);

        // Ground line at Y=0 with glow
        ctx.strokeStyle = '#FF3AF2';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#FF3AF2';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(worldLeft, 0);
        ctx.lineTo(worldRight, 0);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Ground pattern (below Y=0)
        ctx.strokeStyle = 'rgba(255, 58, 242, 0.2)';
        ctx.lineWidth = 1;
        for (let y = -Renderer.GROUND_PATTERN_SPACING; y > worldBottom - 100; y -= Renderer.GROUND_PATTERN_SPACING) {
            ctx.beginPath();
            ctx.moveTo(worldLeft, y);
            ctx.lineTo(worldRight, y);
            ctx.stroke();
        }
    }

    drawSegment(segment, simulating = false) {
        const ctx = this.ctx;
        const nodeA = segment.nodeA;
        const nodeB = segment.nodeB;

        // Get positions in world coords (Y-up)
        const posA = this.getWorldPos(nodeA, simulating);
        const posB = this.getWorldPos(nodeB, simulating);

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

        // Get position in world coords (Y-up)
        const pos = this.getWorldPos(node, simulating);

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

        // Get position in world coords (Y-up)
        // During simulation, converts from Matter.js Y-down coords
        const pos = this.getWeightWorldPos(weight, simulating);

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

        // Draw mass label (scale font with radius) - counter-flip for Y-up
        const fontSize = Math.round(8 + radius * 0.3);
        this.drawWorldText(weight.mass.toFixed(0), pos.x, pos.y, {
            font: `bold ${fontSize}px sans-serif`,
            fillStyle: '#FFFFFF'
        });

        // Draw attachment line to segment midpoint if attached to segment
        if (weight.attachedToSegment && simulating) {
            const seg = weight.attachedToSegment;

            // Get node positions in world coords (Y-up)
            const posA = this.getWorldPos(seg.nodeA, simulating);
            const posB = this.getWorldPos(seg.nodeB, simulating);

            // Attachment point on segment (interpolated)
            const attachX = posA.x + (posB.x - posA.x) * weight.position;
            const attachY = posA.y + (posB.y - posA.y) * weight.position;

            // Draw thin line from attachment point to weight body
            if (weight.body) {
                const weightPos = {
                    x: weight.body.position.x,
                    y: this.matterToWorldY(weight.body.position.y)
                };
                ctx.strokeStyle = 'rgba(255, 107, 53, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(attachX, attachY);
                ctx.lineTo(weightPos.x, weightPos.y);
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

        // Get positions in world coords (Y-up)
        const posA = this.getWorldPos(segment.nodeA, simulating);
        const posB = this.getWorldPos(segment.nodeB, simulating);

        // Calculate midpoint
        const midX = (posA.x + posB.x) / 2;
        const midY = (posA.y + posB.y) / 2;

        // Calculate segment angle for label offset (perpendicular to segment)
        const angle = Math.atan2(posB.y - posA.y, posB.x - posA.x);
        const offsetDist = 18;
        const offsetX = Math.sin(angle) * offsetDist;
        const offsetY = -Math.cos(angle) * offsetDist;

        // Label position
        const labelX = midX + offsetX;
        const labelY = midY + offsetY;

        // Get stress percentage and colour
        const stressColor = segment.getStressColor();
        const text = `${Math.round(segment.stress * 100)}`;

        // Measure text width for pill sizing
        ctx.font = 'bold 11px "DM Sans", sans-serif';
        const textWidth = ctx.measureText(text).width;
        const pillWidth = textWidth + 10;
        const pillHeight = 18;

        // Draw background pill (counter-flip for Y-up)
        this.drawWorldPill(labelX, labelY, pillWidth, pillHeight, {
            strokeStyle: stressColor
        });

        // Draw text (counter-flip for Y-up)
        this.drawWorldText(text, labelX, labelY, {
            font: 'bold 11px "DM Sans", sans-serif',
            fillStyle: stressColor
        });
    }

    /**
     * Draw joint angle arcs at a node.
     * @param {Node} node - The node with joints
     * @param {Object} jointData - { anglePairs: [...] } from JointController
     * @param {boolean} simulating - Whether physics is running
     */
    drawJointArcs(node, jointData, simulating = false) {
        const ctx = this.ctx;

        // Get node position in world coords (Y-up)
        const pos = this.getWorldPos(node, simulating);

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

            // Measure text width for pill sizing
            ctx.font = 'bold 10px "DM Sans", sans-serif';
            const textWidth = ctx.measureText(text).width;
            const pillWidth = textWidth + 6;
            const pillHeight = 14;

            // Draw label background pill (counter-flip for Y-up)
            this.drawWorldPill(labelX, labelY, pillWidth, pillHeight, {
                radius: 3
            });

            // Draw label text (counter-flip for Y-up)
            this.drawWorldText(text, labelX, labelY, {
                font: 'bold 10px "DM Sans", sans-serif',
                fillStyle: color
            });
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
        const other = segment.nodeA === node ? segment.nodeB : segment.nodeA;
        const nodePos = this.getWorldPos(node, simulating);
        const otherPos = this.getWorldPos(other, simulating);

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
     * Draw a selection box (rubber-band rectangle) in screen space.
     * @param {Object} rect - { x, y, width, height } in screen coordinates
     * @param {Node[]} nodesInside - Nodes currently inside the box (for preview highlight)
     * @param {Object} viewport - Viewport state { zoom, panX, panY }
     */
    drawSelectionBox(rect, nodesInside = [], viewport = { zoom: 1, panX: 0, panY: 0 }) {
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
        // Transform node world positions to screen positions (Y-up to Y-down)
        for (const node of nodesInside) {
            if (!node.selected) {
                // Convert world to screen coordinates (Y-up world to Y-down screen)
                const screenX = (node.x - viewport.panX) * viewport.zoom;
                // Y-flip: screenY = groundScreenY - (worldY - panY) * zoom
                const screenY = this.groundScreenY - (node.y - viewport.panY) * viewport.zoom;
                const screenRadius = (12 + 4) * viewport.zoom;

                // Draw preview highlight ring for unselected nodes
                ctx.strokeStyle = 'rgba(0, 245, 212, 0.5)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
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

            // Fixed indicator (counter-flip for Y-up)
            if (node.fixed) {
                this.drawWorldText('⚓', node.x, node.y, {
                    font: 'bold 14px sans-serif',
                    fillStyle: '#FFFFFF'
                });
            }
        }

        ctx.globalAlpha = 1;
    }

    render(structure, state = {}) {
        const {
            simulating = false,
            groundScreenY = this.height - Renderer.DEFAULT_GROUND_OFFSET,
            worldWidth = this.width,
            worldHeight = this.height - Renderer.DEFAULT_GROUND_OFFSET,
            mouseX = 0,
            mouseY = 0,
            viewport = { zoom: 1, panX: 0, panY: 0 },
            showStressLabels = false,
            showJointAngles = false,
            showCoordinates = false,
            jointData = null,
            selectionBox = null,
            pastePreview = null,
            isHoveringElement = false,
            isDragging = false
        } = state;

        // Store groundScreenY for coordinate conversions
        this.groundScreenY = groundScreenY;

        this.clear();

        // Apply viewport transform for world-space rendering with Y-flip
        // World coords: Y=0 at ground, positive Y upward
        // Screen coords: Y=0 at top, positive Y downward
        this.ctx.save();
        this.ctx.translate(0, groundScreenY);           // Move origin to ground line
        this.ctx.scale(viewport.zoom, -viewport.zoom);  // Flip Y axis (negative Y scale)
        this.ctx.translate(-viewport.panX, -viewport.panY);

        this.drawGrid(worldWidth, worldHeight, viewport);
        this.drawGround(worldWidth, viewport);

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

            // Clamp preview position to placeable bounds (Y-up: 0 to worldHeight)
            const radius = Node.radius;
            const clampedX = Math.max(radius, Math.min(worldWidth - radius, mouseX));
            const clampedY = Math.max(radius, Math.min(worldHeight - radius, mouseY));

            this.drawConnectionPreview(selectedNodes, clampedX, clampedY, showGhostNode);
        }

        // Draw paste preview (on top of everything)
        if (!simulating && pastePreview) {
            this.drawPastePreview(pastePreview);
        }

        // Restore context before drawing screen-space elements
        this.ctx.restore();

        // Draw selection box in screen space (feels more natural)
        if (!simulating && selectionBox?.rect) {
            this.drawSelectionBox(selectionBox.rect, selectionBox.nodesInside || [], viewport);
        }

        // Draw coordinate debug display (screen space, top-left corner)
        if (showCoordinates) {
            this.drawCoordinateDisplay(mouseX, mouseY);
        }
    }

    /**
     * Draw coordinate debug display showing mouse position in world coords (Y-up).
     * @param {number} worldX - Mouse X in world coordinates
     * @param {number} worldY - Mouse Y in world coordinates (Y-up, 0 at ground)
     */
    drawCoordinateDisplay(worldX, worldY) {
        const ctx = this.ctx;
        const text = `X: ${worldX.toFixed(0)}  Y: ${worldY.toFixed(0)}`;

        ctx.font = 'bold 12px "DM Sans", monospace';
        const textWidth = ctx.measureText(text).width;
        const padding = 8;
        const pillWidth = textWidth + padding * 2;
        const pillHeight = 24;
        const x = 10;
        const y = 10;

        // Background pill
        ctx.fillStyle = 'rgba(13, 13, 26, 0.9)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, pillWidth, pillHeight, 4);
        } else {
            ctx.rect(x, y, pillWidth, pillHeight);
        }
        ctx.fill();

        // Border
        ctx.strokeStyle = '#00F5D4';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#00F5D4';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + padding, y + pillHeight / 2);
    }
}
