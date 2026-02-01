/**
 * ClipboardController
 * Manages copy/paste operations for nodes and segments.
 * Supports paste preview mode where copied elements follow the cursor.
 */

export class ClipboardController {
    /**
     * @param {Object} options - Configuration options
     * @param {Function} options.getSelectedNodes - Returns array of selected nodes
     * @param {Function} options.getSegmentsBetweenNodes - (nodes) => Segment[] - Find segments connecting nodes
     * @param {Function} options.createNode - (x, y, fixed, mass) => Node - Create a new node
     * @param {Function} options.createSegment - (nodeA, nodeB, material, props) => Segment - Create a segment
     * @param {Function} [options.onPasteStart] - Called when paste preview starts
     * @param {Function} [options.onPasteMove] - Called during paste preview (previewData)
     * @param {Function} [options.onPasteEnd] - Called when paste completes (newNodes)
     * @param {Function} [options.onPasteCancel] - Called when paste is cancelled
     */
    constructor(options = {}) {
        this.getSelectedNodes = options.getSelectedNodes ?? (() => []);
        this.getSegmentsBetweenNodes = options.getSegmentsBetweenNodes ?? (() => []);
        this.createNode = options.createNode ?? (() => null);
        this.createSegment = options.createSegment ?? (() => null);

        this.onPasteStart = options.onPasteStart ?? (() => {});
        this.onPasteMove = options.onPasteMove ?? (() => {});
        this.onPasteEnd = options.onPasteEnd ?? (() => {});
        this.onPasteCancel = options.onPasteCancel ?? (() => {});

        // Clipboard data: relative positions from centroid
        this.clipboard = null;

        // Paste preview state
        this.isPasting = false;
        this.previewPos = null;
    }

    /**
     * Copy the currently selected nodes and segments between them.
     * @returns {boolean} True if something was copied
     */
    copy() {
        const nodes = this.getSelectedNodes();
        if (nodes.length === 0) return false;

        // Calculate centroid of selection
        const centroid = this.calculateCentroid(nodes);

        // Get segments connecting the selected nodes
        const segments = this.getSegmentsBetweenNodes(nodes);

        // Store node data with relative positions
        this.clipboard = {
            nodes: nodes.map(node => ({
                dx: node.x - centroid.x,
                dy: node.y - centroid.y,
                fixed: node.fixed,
                mass: node.mass
            })),
            segments: segments.map(segment => {
                const fromIndex = nodes.indexOf(segment.nodeA);
                const toIndex = nodes.indexOf(segment.nodeB);
                return {
                    fromIndex,
                    toIndex,
                    material: segment.material,
                    stiffness: segment.stiffness,
                    damping: segment.damping,
                    compressionOnly: segment.compressionOnly,
                    tensionOnly: segment.tensionOnly
                };
            })
        };

        return true;
    }

    /**
     * Calculate the centroid (average position) of a set of nodes.
     * @param {Node[]} nodes - Array of nodes
     * @returns {{ x: number, y: number }}
     */
    calculateCentroid(nodes) {
        if (nodes.length === 0) return { x: 0, y: 0 };

        let sumX = 0;
        let sumY = 0;
        for (const node of nodes) {
            sumX += node.x;
            sumY += node.y;
        }

        return {
            x: sumX / nodes.length,
            y: sumY / nodes.length
        };
    }

    /**
     * Start paste preview mode.
     * @param {Object} initialPos - Initial mouse position { x, y }
     * @returns {boolean} True if paste preview started
     */
    startPaste(initialPos) {
        if (!this.clipboard || this.clipboard.nodes.length === 0) {
            return false;
        }

        this.isPasting = true;
        this.previewPos = { ...initialPos };
        this.onPasteStart();

        return true;
    }

    /**
     * Update the paste preview position.
     * @param {Object} mousePos - Current mouse position { x, y }
     * @returns {Object|null} Preview data for rendering, or null if not pasting
     */
    updatePreview(mousePos) {
        if (!this.isPasting) return null;

        this.previewPos = { ...mousePos };
        const previewData = this.getPreviewData();
        this.onPasteMove(previewData);

        return previewData;
    }

    /**
     * Get the preview data for rendering.
     * @returns {Object|null} { nodes: [{x, y, fixed}], segments: [{fromIndex, toIndex}] }
     */
    getPreviewData() {
        if (!this.clipboard || !this.previewPos) return null;

        const nodes = this.clipboard.nodes.map(n => ({
            x: this.previewPos.x + n.dx,
            y: this.previewPos.y + n.dy,
            fixed: n.fixed
        }));

        return {
            nodes,
            segments: this.clipboard.segments.map(s => ({
                fromIndex: s.fromIndex,
                toIndex: s.toIndex
            }))
        };
    }

    /**
     * Commit the paste operation, creating actual nodes and segments.
     * @returns {Object|null} { nodes: Node[], segments: Segment[] } or null if not pasting
     */
    commitPaste() {
        if (!this.isPasting || !this.previewPos || !this.clipboard) {
            return null;
        }

        const newNodes = [];
        const newSegments = [];

        // Create nodes at preview positions
        for (const nodeData of this.clipboard.nodes) {
            const x = this.previewPos.x + nodeData.dx;
            const y = this.previewPos.y + nodeData.dy;
            const node = this.createNode(x, y, nodeData.fixed, nodeData.mass);
            if (node) {
                newNodes.push(node);
            }
        }

        // Create segments between new nodes
        for (const segData of this.clipboard.segments) {
            const nodeA = newNodes[segData.fromIndex];
            const nodeB = newNodes[segData.toIndex];
            if (nodeA && nodeB) {
                const segment = this.createSegment(nodeA, nodeB, segData.material, {
                    stiffness: segData.stiffness,
                    damping: segData.damping,
                    compressionOnly: segData.compressionOnly,
                    tensionOnly: segData.tensionOnly
                });
                if (segment) {
                    newSegments.push(segment);
                }
            }
        }

        // Clear paste state
        this.isPasting = false;
        this.previewPos = null;

        this.onPasteEnd(newNodes, newSegments);

        return { nodes: newNodes, segments: newSegments };
    }

    /**
     * Cancel the paste operation without creating elements.
     */
    cancelPaste() {
        if (!this.isPasting) return;

        this.isPasting = false;
        this.previewPos = null;
        this.onPasteCancel();
    }

    /**
     * Check if currently in paste preview mode.
     * @returns {boolean}
     */
    get isActive() {
        return this.isPasting;
    }

    /**
     * Check if clipboard has content.
     * @returns {boolean}
     */
    get hasContent() {
        return this.clipboard !== null && this.clipboard.nodes.length > 0;
    }

    /**
     * Get the number of nodes in clipboard.
     * @returns {number}
     */
    get clipboardNodeCount() {
        return this.clipboard?.nodes?.length ?? 0;
    }

    /**
     * Get the number of segments in clipboard.
     * @returns {number}
     */
    get clipboardSegmentCount() {
        return this.clipboard?.segments?.length ?? 0;
    }

    /**
     * Reset all state.
     */
    reset() {
        this.clipboard = null;
        this.isPasting = false;
        this.previewPos = null;
    }
}
