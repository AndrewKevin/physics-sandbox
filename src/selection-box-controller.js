/**
 * SelectionBoxController
 * Manages rubber-band selection box state and hit testing for multi-select.
 */

export class SelectionBoxController {
    /** Minimum drag distance (px) before showing selection box */
    static MIN_SIZE = 5;

    /**
     * @param {Object} options - Configuration options
     * @param {Function} options.findNodesInRect - (rect) => Node[] - Find nodes within rectangle
     * @param {Function} [options.onSelectionStart] - Called when selection box starts
     * @param {Function} [options.onSelectionMove] - Called during selection (rect, nodesInside)
     * @param {Function} [options.onSelectionEnd] - Called when selection ends (selectedNodes, additive)
     * @param {Function} [options.onSelectionCancel] - Called when cancelled
     */
    constructor(options = {}) {
        this.findNodesInRect = options.findNodesInRect ?? (() => []);
        this.onSelectionStart = options.onSelectionStart ?? (() => {});
        this.onSelectionMove = options.onSelectionMove ?? (() => {});
        this.onSelectionEnd = options.onSelectionEnd ?? (() => {});
        this.onSelectionCancel = options.onSelectionCancel ?? (() => {});

        // State
        this.isSelecting = false;
        this.startPos = null;
        this.currentPos = null;
        this.isAdditive = false;
        this.wasJustSelecting = false;
    }

    /**
     * Begin a potential selection box.
     * @param {Object} mousePos - { x, y }
     * @param {boolean} additive - True if shift is held (add to existing selection)
     */
    beginSelection(mousePos, additive = false) {
        this.startPos = { x: mousePos.x, y: mousePos.y };
        this.currentPos = { x: mousePos.x, y: mousePos.y };
        this.isAdditive = additive;
        this.isSelecting = false;
        this.wasJustSelecting = false;
    }

    /**
     * Update selection box during mouse move.
     * @param {Object} mousePos - { x, y }
     * @returns {{ isSelecting: boolean, rect: Object|null, nodesInside: Node[] }}
     */
    updateSelection(mousePos) {
        if (!this.startPos) {
            return { isSelecting: false, rect: null, nodesInside: [] };
        }

        this.currentPos = { x: mousePos.x, y: mousePos.y };
        const rect = this.getRect();

        // Check if past minimum size threshold
        const size = Math.max(rect.width, rect.height);
        const wasSelecting = this.isSelecting;

        if (size >= SelectionBoxController.MIN_SIZE) {
            this.isSelecting = true;

            if (!wasSelecting) {
                this.onSelectionStart();
            }

            const nodesInside = this.findNodesInRect(rect);
            this.onSelectionMove(rect, nodesInside);

            return { isSelecting: true, rect, nodesInside };
        }

        return { isSelecting: false, rect: null, nodesInside: [] };
    }

    /**
     * End the selection box operation.
     * @returns {{ wasSelection: boolean, selectedNodes: Node[], additive: boolean }}
     */
    endSelection() {
        const wasSelection = this.isSelecting;
        let selectedNodes = [];
        const additive = this.isAdditive;

        if (wasSelection && this.startPos && this.currentPos) {
            const rect = this.getRect();
            selectedNodes = this.findNodesInRect(rect);
            this.onSelectionEnd(selectedNodes, additive);
        }

        this.wasJustSelecting = wasSelection;
        this.reset();

        return { wasSelection, selectedNodes, additive };
    }

    /**
     * Cancel the selection box without selecting.
     */
    cancelSelection() {
        if (this.isSelecting) {
            this.onSelectionCancel();
        }
        this.reset();
    }

    /**
     * Get the current selection rectangle (normalised with positive dimensions).
     * @returns {Object|null} { x, y, width, height } or null
     */
    getRect() {
        if (!this.startPos || !this.currentPos) return null;

        return {
            x: Math.min(this.startPos.x, this.currentPos.x),
            y: Math.min(this.startPos.y, this.currentPos.y),
            width: Math.abs(this.currentPos.x - this.startPos.x),
            height: Math.abs(this.currentPos.y - this.startPos.y)
        };
    }

    /**
     * Reset all state.
     */
    reset() {
        this.isSelecting = false;
        this.startPos = null;
        this.currentPos = null;
        this.isAdditive = false;
    }

    /**
     * Check if a selection box is actively being drawn.
     * @returns {boolean}
     */
    get isActive() {
        return this.isSelecting;
    }

    /**
     * Check if we're tracking a potential selection (mouse down but not yet past threshold).
     * @returns {boolean}
     */
    get isTracking() {
        return this.startPos !== null;
    }

    /**
     * Check if a selection just finished (for click suppression).
     * @returns {boolean}
     */
    get shouldSuppressClick() {
        return this.wasJustSelecting;
    }

    /**
     * Clear click suppression flag.
     */
    clearClickSuppression() {
        this.wasJustSelecting = false;
    }
}
