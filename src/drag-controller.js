/**
 * DragController
 * Manages node dragging state machine and position updates
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
     * @param {Function} [options.onDragStart] - Called when drag begins (node)
     * @param {Function} [options.onDragMove] - Called during drag (node, clampedPos)
     * @param {Function} [options.onDragEnd] - Called when drag ends (node)
     * @param {Function} [options.onDragCancel] - Called when drag is cancelled (node, originalPos)
     */
    constructor(options = {}) {
        // Dependencies (injected)
        this.getBounds = options.getBounds ?? (() => ({ width: 800, groundY: 540 }));
        this.getNodeRadius = options.getNodeRadius ?? (() => 12);
        this.getSnapEnabled = options.getSnapEnabled ?? (() => false);
        this.getGridSize = options.getGridSize ?? (() => 20);

        // Callbacks
        this.onDragStart = options.onDragStart ?? (() => {});
        this.onDragMove = options.onDragMove ?? (() => {});
        this.onDragEnd = options.onDragEnd ?? (() => {});
        this.onDragCancel = options.onDragCancel ?? (() => {});

        // Internal state
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.wasJustDragging = false;
    }

    /**
     * Begin tracking a potential drag on a node.
     * Call this on mousedown/touchstart when a node is found.
     * @param {Object} node - The node being dragged
     * @param {Object} mousePos - Current mouse position { x, y }
     */
    beginPotentialDrag(node, mousePos) {
        this.draggedNode = node;
        this.dragStartMousePos = { x: mousePos.x, y: mousePos.y };
        this.dragStartNodePos = { x: node.x, y: node.y };
    }

    /**
     * Update drag position during mousemove/touchmove.
     * @param {Object} mousePos - Current mouse position { x, y }
     * @returns {{ isDragging: boolean, shouldStartDrag: boolean, clampedPos: Object|null }}
     */
    updateDrag(mousePos) {
        if (!this.draggedNode || !this.dragStartMousePos) {
            return { isDragging: false, shouldStartDrag: false, clampedPos: null };
        }

        const dist = distance(mousePos, this.dragStartMousePos);

        // Check if we should start dragging (past threshold)
        const shouldStartDrag = dist > DragController.TAP_THRESHOLD;

        if (shouldStartDrag || this.isDragging) {
            const wasAlreadyDragging = this.isDragging;
            this.isDragging = true;

            // Clamp position to canvas bounds
            const bounds = this.getBounds();
            const radius = this.getNodeRadius();
            let finalPos = clampToCanvas(mousePos.x, mousePos.y, bounds, radius);

            // Apply snap-to-grid if enabled
            if (this.getSnapEnabled()) {
                const gridSize = this.getGridSize();
                finalPos = snapToGrid(finalPos.x, finalPos.y, gridSize);
                // Re-clamp after snapping to ensure we stay in bounds
                finalPos = clampToCanvas(finalPos.x, finalPos.y, bounds, radius);
            }

            // Notify start if this is the first drag frame
            if (!wasAlreadyDragging) {
                this.onDragStart(this.draggedNode);
            }

            // Notify move
            this.onDragMove(this.draggedNode, finalPos);

            return {
                isDragging: true,
                shouldStartDrag: !wasAlreadyDragging,
                clampedPos: finalPos
            };
        }

        return { isDragging: false, shouldStartDrag: false, clampedPos: null };
    }

    /**
     * End the drag operation on mouseup/touchend.
     * @returns {{ wasDrag: boolean, node: Object|null }}
     */
    endDrag() {
        const node = this.draggedNode;
        const wasDrag = this.isDragging;

        // Clear drag state
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;

        if (wasDrag) {
            this.isDragging = false;
            this.wasJustDragging = true;
            this.onDragEnd(node);
        }

        return { wasDrag, node };
    }

    /**
     * Cancel the drag operation and restore the node's original position.
     * Call this on ESC key.
     * @returns {{ wasDrag: boolean, node: Object|null, originalPos: Object|null }}
     */
    cancelDrag() {
        const node = this.draggedNode;
        const originalPos = this.dragStartNodePos;
        const wasDrag = this.isDragging;

        // Restore original position if we were dragging
        if (wasDrag && node && originalPos) {
            this.onDragCancel(node, originalPos);
        }

        // Clear all state
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.wasJustDragging = false;

        return { wasDrag, node, originalPos };
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
    }
}
