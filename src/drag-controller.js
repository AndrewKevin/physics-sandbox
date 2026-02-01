/**
 * DragController
 * Manages node dragging state machine and position updates.
 * Supports both single-node and multi-node dragging.
 */

import { clampToCanvas, distance, snapToGrid } from './position-utils.js';

export class DragController {
    /** Distance threshold before a mousedown becomes a drag */
    static TAP_THRESHOLD = 15;

    /**
     * @param {Object} options - Configuration options
     * @param {Function} options.getBounds - Returns { width, groundY } for clamping
     * @param {Function} options.getNodeRadius - Returns node radius for clamping
     * @param {Function} [options.getSnapEnabled] - Returns true if snap-to-grid is enabled
     * @param {Function} [options.getGridSize] - Returns grid size in pixels (default 20)
     * @param {Function} [options.getSelectedNodes] - Returns array of currently selected nodes
     * @param {Function} [options.onDragStart] - Called when drag begins (node)
     * @param {Function} [options.onDragMove] - Called during drag (node, clampedPos)
     * @param {Function} [options.onMultiDragMove] - Called during multi-drag (Map<node, pos>)
     * @param {Function} [options.onDragEnd] - Called when drag ends (node)
     * @param {Function} [options.onMultiDragEnd] - Called when multi-drag ends (nodes[])
     * @param {Function} [options.onDragCancel] - Called when drag is cancelled (node, originalPos)
     */
    constructor(options = {}) {
        // Dependencies (injected)
        this.getBounds = options.getBounds ?? (() => ({ width: 800, groundY: 540 }));
        this.getNodeRadius = options.getNodeRadius ?? (() => 12);
        this.getSnapEnabled = options.getSnapEnabled ?? (() => false);
        this.getGridSize = options.getGridSize ?? (() => 20);
        this.getSelectedNodes = options.getSelectedNodes ?? (() => []);

        // Callbacks
        this.onDragStart = options.onDragStart ?? (() => {});
        this.onDragMove = options.onDragMove ?? (() => {});
        this.onMultiDragMove = options.onMultiDragMove ?? (() => {});
        this.onDragEnd = options.onDragEnd ?? (() => {});
        this.onMultiDragEnd = options.onMultiDragEnd ?? (() => {});
        this.onDragCancel = options.onDragCancel ?? (() => {});

        // Internal state
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.wasJustDragging = false;

        // Multi-node drag state
        this.draggedNodes = [];
        this.nodeOffsets = new Map();  // Map<Node, {dx, dy}> - offset from mouse position
        this.dragStartPositions = new Map();  // Map<Node, {x, y}> - original positions for cancel
    }

    /**
     * Begin tracking a potential drag on a node.
     * If the node is part of a multi-selection, tracks all selected nodes.
     * Call this on mousedown/touchstart when a node is found.
     * @param {Object} node - The node being dragged
     * @param {Object} mousePos - Current mouse position { x, y }
     */
    beginPotentialDrag(node, mousePos) {
        const selectedNodes = this.getSelectedNodes();

        // Check if we're dragging a selected node in a multi-selection
        if (selectedNodes.includes(node) && selectedNodes.length > 1) {
            // Multi-node drag: store all selected nodes and their offsets from mouse
            this.draggedNodes = [...selectedNodes];
            this.nodeOffsets = new Map();
            this.dragStartPositions = new Map();

            for (const n of this.draggedNodes) {
                this.nodeOffsets.set(n, {
                    dx: n.x - mousePos.x,
                    dy: n.y - mousePos.y
                });
                this.dragStartPositions.set(n, { x: n.x, y: n.y });
            }
        } else {
            // Single node drag
            this.draggedNodes = [node];
            this.nodeOffsets = new Map();
            this.dragStartPositions = new Map([[node, { x: node.x, y: node.y }]]);
        }

        this.draggedNode = node;
        this.dragStartMousePos = { x: mousePos.x, y: mousePos.y };
        this.dragStartNodePos = { x: node.x, y: node.y };
    }

    /**
     * Update drag position during mousemove/touchmove.
     * For multi-node drag, moves all selected nodes maintaining relative positions.
     * @param {Object} mousePos - Current mouse position { x, y }
     * @returns {{ isDragging: boolean, shouldStartDrag: boolean, clampedPos: Object|null, isMultiDrag: boolean }}
     */
    updateDrag(mousePos) {
        if (!this.draggedNode || !this.dragStartMousePos) {
            return { isDragging: false, shouldStartDrag: false, clampedPos: null, isMultiDrag: false };
        }

        const dist = distance(mousePos, this.dragStartMousePos);

        // Check if we should start dragging (past threshold)
        const shouldStartDrag = dist > DragController.TAP_THRESHOLD;

        if (shouldStartDrag || this.isDragging) {
            const wasAlreadyDragging = this.isDragging;
            this.isDragging = true;

            const bounds = this.getBounds();
            const radius = this.getNodeRadius();
            const isMulti = this.draggedNodes.length > 1;

            // Notify start if this is the first drag frame
            if (!wasAlreadyDragging) {
                this.onDragStart(this.draggedNode);
            }

            if (isMulti) {
                // Multi-node drag: calculate positions for all nodes using offsets
                const positions = new Map();

                for (const node of this.draggedNodes) {
                    const offset = this.nodeOffsets.get(node);
                    let targetX = mousePos.x + offset.dx;
                    let targetY = mousePos.y + offset.dy;

                    // Clamp each node individually
                    let finalPos = clampToCanvas(targetX, targetY, bounds, radius);

                    if (this.getSnapEnabled()) {
                        const gridSize = this.getGridSize();
                        finalPos = snapToGrid(finalPos.x, finalPos.y, gridSize);
                        finalPos = clampToCanvas(finalPos.x, finalPos.y, bounds, radius);
                    }

                    positions.set(node, finalPos);
                }

                // Notify multi-drag move with all positions
                this.onMultiDragMove(positions);

                return {
                    isDragging: true,
                    shouldStartDrag: !wasAlreadyDragging,
                    clampedPos: positions.get(this.draggedNode),
                    isMultiDrag: true
                };
            } else {
                // Single node drag (existing behaviour)
                let finalPos = clampToCanvas(mousePos.x, mousePos.y, bounds, radius);

                if (this.getSnapEnabled()) {
                    const gridSize = this.getGridSize();
                    finalPos = snapToGrid(finalPos.x, finalPos.y, gridSize);
                    finalPos = clampToCanvas(finalPos.x, finalPos.y, bounds, radius);
                }

                this.onDragMove(this.draggedNode, finalPos);

                return {
                    isDragging: true,
                    shouldStartDrag: !wasAlreadyDragging,
                    clampedPos: finalPos,
                    isMultiDrag: false
                };
            }
        }

        return { isDragging: false, shouldStartDrag: false, clampedPos: null, isMultiDrag: false };
    }

    /**
     * End the drag operation on mouseup/touchend.
     * @returns {{ wasDrag: boolean, node: Object|null, wasMultiDrag: boolean, nodes: Object[] }}
     */
    endDrag() {
        const node = this.draggedNode;
        const wasDrag = this.isDragging;
        const wasMultiDrag = this.draggedNodes.length > 1;
        const nodes = [...this.draggedNodes];

        // Clear drag state
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.draggedNodes = [];
        this.nodeOffsets = new Map();
        this.dragStartPositions = new Map();

        if (wasDrag) {
            this.isDragging = false;
            this.wasJustDragging = true;

            if (wasMultiDrag) {
                this.onMultiDragEnd(nodes);
            } else {
                this.onDragEnd(node);
            }
        }

        return { wasDrag, node, wasMultiDrag, nodes };
    }

    /**
     * Cancel the drag operation and restore all nodes to their original positions.
     * Call this on ESC key.
     * @returns {{ wasDrag: boolean, node: Object|null, originalPos: Object|null, wasMultiDrag: boolean }}
     */
    cancelDrag() {
        const node = this.draggedNode;
        const originalPos = this.dragStartNodePos;
        const wasDrag = this.isDragging;
        const wasMultiDrag = this.draggedNodes.length > 1;

        // Restore original positions if we were dragging
        if (wasDrag) {
            for (const [n, pos] of this.dragStartPositions) {
                this.onDragCancel(n, pos);
            }
        }

        // Clear all state
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.draggedNodes = [];
        this.nodeOffsets = new Map();
        this.dragStartPositions = new Map();
        this.wasJustDragging = false;

        return { wasDrag, node, originalPos, wasMultiDrag };
    }

    /**
     * Check if currently in an active drag.
     * @returns {boolean}
     */
    get isActive() {
        return this.isDragging;
    }

    /**
     * Check if a drag just ended (should suppress click).
     * @returns {boolean}
     */
    get shouldSuppressClick() {
        return this.wasJustDragging;
    }

    /**
     * Clear the click suppression flag.
     * Call this after handling a suppressed click.
     */
    clearClickSuppression() {
        this.wasJustDragging = false;
    }

    /**
     * Check if we're tracking a potential drag (mousedown on node, but not yet dragging).
     * @returns {boolean}
     */
    get isTracking() {
        return this.draggedNode !== null;
    }

    /**
     * Get the node currently being dragged or tracked.
     * @returns {Object|null}
     */
    get currentNode() {
        return this.draggedNode;
    }

    /**
     * Reset all drag state.
     * Call this when resetting the application.
     */
    reset() {
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.wasJustDragging = false;
        this.draggedNodes = [];
        this.nodeOffsets = new Map();
        this.dragStartPositions = new Map();
    }

    /**
     * Check if currently in a multi-node drag.
     * @returns {boolean}
     */
    get isMultiDrag() {
        return this.draggedNodes.length > 1;
    }
}
