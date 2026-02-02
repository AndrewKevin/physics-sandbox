/**
 * ClipboardController
 * Manages copy/paste operations for nodes, segments, and weights.
 * Supports paste preview mode where copied elements follow the cursor.
 * Copies to system clipboard as JSON for sharing between sessions.
 */

// Clipboard format identifier
const CLIPBOARD_FORMAT = {
    type: 'physics-sandbox-structure',
    version: 1
};

export class ClipboardController {
    /**
     * @param {Object} options - Configuration options
     * @param {Function} options.getSelectedNodes - Returns array of selected nodes
     * @param {Function} options.getSegmentsBetweenNodes - (nodes) => Segment[] - Find segments connecting nodes
     * @param {Function} options.getWeightsForNodes - (nodes) => Weight[] - Find weights attached to nodes
     * @param {Function} options.getWeightsForSegments - (segments) => Weight[] - Find weights attached to segments
     * @param {Function} options.createNode - (x, y, fixed, mass) => Node - Create a new node
     * @param {Function} options.createSegment - (nodeA, nodeB, material, props) => Segment - Create a segment
     * @param {Function} options.createWeight - (target, position, mass) => Weight - Create a weight
     * @param {Function} [options.onPasteStart] - Called when paste preview starts
     * @param {Function} [options.onPasteMove] - Called during paste preview (previewData)
     * @param {Function} [options.onPasteEnd] - Called when paste completes (newNodes, newSegments, newWeights)
     * @param {Function} [options.onPasteCancel] - Called when paste is cancelled
     * @param {Function} [options.onPasteError] - Called when paste fails (errorMessage)
     */
    constructor(options = {}) {
        this.getSelectedNodes = options.getSelectedNodes ?? (() => []);
        this.getSegmentsBetweenNodes = options.getSegmentsBetweenNodes ?? (() => []);
        this.getWeightsForNodes = options.getWeightsForNodes ?? (() => []);
        this.getWeightsForSegments = options.getWeightsForSegments ?? (() => []);
        this.createNode = options.createNode ?? (() => null);
        this.createSegment = options.createSegment ?? (() => null);
        this.createWeight = options.createWeight ?? (() => null);

        this.onPasteStart = options.onPasteStart ?? (() => {});
        this.onPasteMove = options.onPasteMove ?? (() => {});
        this.onPasteEnd = options.onPasteEnd ?? (() => {});
        this.onPasteCancel = options.onPasteCancel ?? (() => {});
        this.onPasteError = options.onPasteError ?? (() => {});

        // Clipboard data: relative positions from centroid
        this.clipboard = null;

        // Paste preview state
        this.isPasting = false;
        this.previewPos = null;
    }

    /**
     * Copy the currently selected nodes, segments between them, and attached weights.
     * Also writes to system clipboard as JSON for sharing.
     * @returns {boolean} True if something was copied
     */
    copy() {
        const nodes = this.getSelectedNodes();
        if (nodes.length === 0) return false;

        // Calculate centroid of selection
        const centroid = this.calculateCentroid(nodes);

        // Get segments connecting the selected nodes
        const segments = this.getSegmentsBetweenNodes(nodes);

        // Get weights attached to nodes and segments
        const nodeWeights = this.getWeightsForNodes(nodes);
        const segmentWeights = this.getWeightsForSegments(segments);

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
            }),
            weights: [
                // Weights attached to nodes
                ...nodeWeights.map(weight => ({
                    attachedToNodeIndex: nodes.indexOf(weight.attachedToNode),
                    attachedToSegmentIndex: null,
                    position: 0,
                    mass: weight.mass
                })),
                // Weights attached to segments
                ...segmentWeights.map(weight => ({
                    attachedToNodeIndex: null,
                    attachedToSegmentIndex: segments.indexOf(weight.attachedToSegment),
                    position: weight.position,
                    mass: weight.mass
                }))
            ]
        };

        // Write to system clipboard as JSON
        this.writeToSystemClipboard(this.clipboard);

        return true;
    }

    /**
     * Write clipboard data to system clipboard as JSON.
     * @param {Object} data - The clipboard data to write
     */
    async writeToSystemClipboard(data) {
        if (!navigator.clipboard?.writeText) return;

        const json = JSON.stringify({
            ...CLIPBOARD_FORMAT,
            data
        }, null, 2);

        try {
            await navigator.clipboard.writeText(json);
        } catch (err) {
            // Clipboard access denied or unavailable - silent fail
            console.debug('Could not write to system clipboard:', err.message);
        }
    }

    /**
     * Try to read structure data from system clipboard.
     * @returns {Promise<{ data: Object|null, error: string|null }>} Clipboard data and error message
     */
    async readFromSystemClipboard() {
        if (!navigator.clipboard?.readText) {
            return { data: null, error: null }; // Silent fail if API unavailable
        }

        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            return { data: null, error: null }; // Silent fail if access denied
        }

        // Empty clipboard
        if (!text || text.trim() === '') {
            return { data: null, error: null };
        }

        // Try to parse as JSON
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return { data: null, error: 'Clipboard does not contain valid JSON' };
        }

        // Validate format type
        if (parsed.type !== CLIPBOARD_FORMAT.type) {
            return { data: null, error: 'Clipboard does not contain structure data' };
        }

        // Version compatibility check
        if (parsed.version > CLIPBOARD_FORMAT.version) {
            return { data: null, error: `Structure data is from a newer version (v${parsed.version})` };
        }

        // Validate structure
        if (!parsed.data?.nodes || !Array.isArray(parsed.data.nodes)) {
            return { data: null, error: 'Structure data is missing nodes' };
        }

        if (parsed.data.nodes.length === 0) {
            return { data: null, error: 'Structure has no nodes to paste' };
        }

        return { data: parsed.data, error: null };
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
     * First tries internal clipboard, then system clipboard.
     * @param {Object} initialPos - Initial mouse position { x, y }
     * @returns {Promise<boolean>} True if paste preview started
     */
    async startPaste(initialPos) {
        // Try internal clipboard first
        let clipboardData = this.clipboard;

        // If internal clipboard is empty, try system clipboard
        if (!clipboardData || clipboardData.nodes.length === 0) {
            const { data, error } = await this.readFromSystemClipboard();
            if (error) {
                this.onPasteError(error);
                return false;
            }
            clipboardData = data;
            if (clipboardData) {
                this.clipboard = clipboardData;
            }
        }

        if (!clipboardData || clipboardData.nodes.length === 0) {
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
     * Commit the paste operation, creating actual nodes, segments, and weights.
     * @returns {Object|null} { nodes: Node[], segments: Segment[], weights: Weight[] } or null if not pasting
     */
    commitPaste() {
        if (!this.isPasting || !this.previewPos || !this.clipboard) {
            return null;
        }

        const newNodes = [];
        const newSegments = [];
        const newWeights = [];

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

        // Create weights attached to new nodes/segments
        for (const weightData of this.clipboard.weights ?? []) {
            let target = null;
            if (weightData.attachedToNodeIndex !== null) {
                target = newNodes[weightData.attachedToNodeIndex];
            } else if (weightData.attachedToSegmentIndex !== null) {
                target = newSegments[weightData.attachedToSegmentIndex];
            }

            if (target) {
                const weight = this.createWeight(target, weightData.position, weightData.mass);
                if (weight) {
                    newWeights.push(weight);
                }
            }
        }

        // Clear paste state
        this.isPasting = false;
        this.previewPos = null;

        this.onPasteEnd(newNodes, newSegments, newWeights);

        return { nodes: newNodes, segments: newSegments, weights: newWeights };
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
     * Check if internal clipboard has content.
     * Note: Does not check system clipboard (use startPaste which checks both).
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
     * Get the number of weights in clipboard.
     * @returns {number}
     */
    get clipboardWeightCount() {
        return this.clipboard?.weights?.length ?? 0;
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
