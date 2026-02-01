/**
 * HoverController
 * Manages hover state tracking and cursor feedback
 */

export class HoverController {
    /** Cursor styles for different element types */
    static CURSORS = {
        node: 'grab',
        nodeDragging: 'grabbing',
        segment: 'pointer',
        weight: 'pointer',
        default: 'default'
    };

    /**
     * @param {HTMLCanvasElement} canvas - The canvas element for cursor control
     * @param {Object} [options] - Configuration options
     * @param {Function} [options.onHoverChange] - Called when hover state changes (element, type)
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.onHoverChange = options.onHoverChange ?? (() => {});

        // Tracked hover state
        this.hoveredNode = null;
        this.hoveredSegment = null;
        this.hoveredWeight = null;
    }

    /**
     * Update hover state based on element detection result.
     * Sets the hovered property on elements and updates cursor.
     *
     * Note: onHoverChange is only called when hovering a new element,
     * not when moving to empty space (unhover). This is intentional—
     * consumers typically only need to react to hover, not unhover.
     *
     * @param {Object|null} found - Result from findElementAt: { type, element } or null
     */
    update(found) {
        // Clear previous hover states
        this.clear();

        if (!found) {
            this.setCursor('default');
            return;
        }

        const { type, element } = found;
        element.hovered = true;

        if (type === 'weight') {
            this.hoveredWeight = element;
            this.setCursor('pointer');
        } else if (type === 'node') {
            this.hoveredNode = element;
            this.setCursor('grab');
        } else if (type === 'segment') {
            this.hoveredSegment = element;
            this.setCursor('pointer');
        }

        this.onHoverChange(element, type);
    }

    /**
     * Clear all hover states.
     */
    clear() {
        if (this.hoveredNode) {
            this.hoveredNode.hovered = false;
            this.hoveredNode = null;
        }
        if (this.hoveredSegment) {
            this.hoveredSegment.hovered = false;
            this.hoveredSegment = null;
        }
        if (this.hoveredWeight) {
            this.hoveredWeight.hovered = false;
            this.hoveredWeight = null;
        }
    }

    /**
     * Set the cursor style.
     * @param {string} cursor - Cursor style name from CURSORS or CSS cursor value
     */
    setCursor(cursor) {
        this.canvas.style.cursor = HoverController.CURSORS[cursor] ?? cursor;
    }

    /**
     * Check if any element is currently hovered.
     * @returns {boolean}
     */
    get hasHover() {
        return this.hoveredNode !== null ||
               this.hoveredSegment !== null ||
               this.hoveredWeight !== null;
    }

    /**
     * Get the currently hovered element and its type.
     * @returns {{ type: string, element: Object }|null}
     */
    get current() {
        if (this.hoveredWeight) return { type: 'weight', element: this.hoveredWeight };
        if (this.hoveredNode) return { type: 'node', element: this.hoveredNode };
        if (this.hoveredSegment) return { type: 'segment', element: this.hoveredSegment };
        return null;
    }

    /**
     * Reset hover controller state.
     */
    reset() {
        this.clear();
    }
}
