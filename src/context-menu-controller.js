/**
 * ContextMenuController
 * Orchestrates context menus and weight popup display
 */

import { ContextMenu } from './context-menu.js';
import { WeightPopup } from './weight-popup.js';
import { NodePopup } from './node-popup.js';
import { MultiNodePopup } from './multi-node-popup.js';
import { SegmentPopup } from './segment-popup.js';
import { getPositionOnSegment, snapToGrid, clampToCanvas } from './position-utils.js';

export class ContextMenuController {
    /**
     * @param {Object} options - Configuration options
     * @param {Object} options.structure - StructureManager instance
     * @param {Object} options.ui - UIController instance
     * @param {Function} options.getGroundY - Returns current ground Y position
     * @param {Function} options.getCanvasWidth - Returns current canvas width
     * @param {Function} options.getNodeRadius - Returns node radius
     * @param {Function} [options.getGridSize] - Returns grid size in pixels (default 20)
     * @param {Function} [options.onStatsUpdate] - Called when stats need updating
     * @param {Function} [options.onMaterialChange] - Called when segment material is changed (segment, newMaterial)
     */
    constructor(options = {}) {
        this.structure = options.structure;
        this.ui = options.ui;
        this.getGroundY = options.getGroundY ?? (() => 540);
        this.getCanvasWidth = options.getCanvasWidth ?? (() => 800);
        this.getNodeRadius = options.getNodeRadius ?? (() => 12);
        this.getGridSize = options.getGridSize ?? (() => 20);
        this.onStatsUpdate = options.onStatsUpdate ?? (() => {});
        this.onMaterialChange = options.onMaterialChange ?? (() => {});

        this.contextMenu = null;
        this.weightPopup = new WeightPopup();
        this.nodePopup = new NodePopup();
        this.multiNodePopup = new MultiNodePopup();
        this.segmentPopup = new SegmentPopup();

        this.setupWeightPopupCallbacks();
        this.setupNodePopupCallbacks();
        this.setupMultiNodePopupCallbacks();
        this.setupSegmentPopupCallbacks();
    }

    /**
     * Set up callbacks for the weight popup.
     */
    setupWeightPopupCallbacks() {
        this.weightPopup.onDelete = (weight) => {
            if (this.structure.weights.includes(weight)) {
                this.structure.removeWeight(weight);
                this.structure.clearSelection();
                this.ui.updateSelection({});
                this.onStatsUpdate();
            }
        };

        this.weightPopup.onMassChange = () => {
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
                this.onStatsUpdate();
            }
        };

        this.weightPopup.onPositionChange = () => {
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
                this.onStatsUpdate();
            }
        };

        this.weightPopup.onClose = () => {
            // Optionally handle popup close
        };
    }

    /**
     * Set up callbacks for the node popup.
     */
    setupNodePopupCallbacks() {
        this.nodePopup.onDelete = (node) => {
            if (this.structure.nodes.includes(node)) {
                this.structure.removeNode(node);
                this.structure.clearSelection();
                this.ui.updateSelection({});
                this.onStatsUpdate();
            }
        };

        this.nodePopup.onPinToggle = (node) => {
            if (this.structure.nodes.includes(node)) {
                node.setFixed(!node.fixed);
                this.onStatsUpdate();
            }
        };

        this.nodePopup.onMassChange = () => {
            // Mass change is reflected in real-time via the node's mass property
            // If simulation is running, physics body mass is updated via setMass
            this.onStatsUpdate();
        };

        this.nodePopup.onClose = () => {
            // Optionally handle popup close
        };
    }

    /**
     * Set up callbacks for the multi-node popup.
     */
    setupMultiNodePopupCallbacks() {
        this.multiNodePopup.onDelete = (nodes) => {
            // Remove in reverse order to avoid index issues
            for (const node of [...nodes].reverse()) {
                if (this.structure.nodes.includes(node)) {
                    this.structure.removeNode(node);
                }
            }
            this.structure.clearSelection();
            this.ui.updateSelection({});
            this.onStatsUpdate();
        };

        this.multiNodePopup.onPinToggle = () => {
            // Update UI to reflect pin changes
            this.ui.updateSelection({ nodes: this.structure.selectedNodes });
            this.onStatsUpdate();
        };

        this.multiNodePopup.onMassChange = () => {
            // Mass change is reflected in real-time via node.setMass
            this.ui.updateSelection({ nodes: this.structure.selectedNodes });
            this.onStatsUpdate();
        };

        this.multiNodePopup.onClose = () => {
            // Optionally handle popup close
        };
    }

    /**
     * Set up callbacks for the segment popup.
     */
    setupSegmentPopupCallbacks() {
        this.segmentPopup.onMaterialChange = (segment, material) => {
            if (this.structure.segments.includes(segment)) {
                this.onMaterialChange(segment, material);
            }
        };

        this.segmentPopup.onAddNode = (segment, clickPos) => {
            if (this.structure.segments.includes(segment)) {
                const position = getPositionOnSegment(segment, clickPos.x, clickPos.y);
                const { node } = this.structure.splitSegment(segment, position);
                this.structure.selectNode(node);
                this.ui.updateSelection({ node });
                this.onStatsUpdate();
            }
        };

        this.segmentPopup.onAddWeight = (segment, clickPos) => {
            if (this.structure.segments.includes(segment)) {
                const position = getPositionOnSegment(segment, clickPos.x, clickPos.y);
                const weight = this.structure.addWeight(segment, position);
                this.structure.selectWeight(weight);
                this.ui.updateSelection({ weight });
                this.onStatsUpdate();
            }
        };

        this.segmentPopup.onDelete = (segment) => {
            if (this.structure.segments.includes(segment)) {
                this.structure.removeSegment(segment);
                this.structure.clearSelection();
                this.ui.updateSelection({});
                this.onStatsUpdate();
            }
        };

        this.segmentPopup.onClose = () => {
            // Optionally handle popup close
        };
    }

    /**
     * Handle right-click at a position.
     * @param {Event} event - The mouse event
     * @param {number} x - Canvas X position
     * @param {number} y - Canvas Y position
     * @param {Array} elements - Elements at position from findAllElementsAt
     */
    handleRightClick(event, x, y, elements) {
        // Check for multi-node selection first
        const selectedNodes = this.structure.selectedNodes || [];
        if (selectedNodes.length > 1) {
            // Check if right-clicking on one of the selected nodes
            const node = this.structure.findNodeAt(x, y);
            if (node && selectedNodes.includes(node)) {
                this.closeAll();
                this.multiNodePopup.show(selectedNodes, event.clientX, event.clientY);
                return;
            }
        }

        // Fall through to standard element-based menu
        if (elements.length === 0) {
            const menuItems = this.getEmptySpaceMenuItems(x, y);
            this.showContextMenu(event, menuItems);
        } else if (elements.length === 1) {
            this.showElementMenu(elements[0], event, { x, y });
        } else {
            const menuItems = this.getElementPickerMenuItems(elements, event, { x, y });
            this.showContextMenu(event, menuItems);
        }
    }

    /**
     * Show a context menu with specified items.
     * @param {Event} event - Mouse event for positioning
     * @param {Array} menuItems - Array of { label, callback } objects
     */
    showContextMenu(event, menuItems) {
        this.closeAll();
        this.contextMenu = new ContextMenu();
        this.contextMenu.show(event.clientX, event.clientY, menuItems);
    }

    /**
     * Show the appropriate menu/popup for an element.
     * @param {Object} item - { type, element } object
     * @param {Event} event - Mouse event
     * @param {Object} pos - { x, y } canvas position
     */
    showElementMenu(item, event, pos) {
        if (item.type === 'weight') {
            this.closeAll();
            this.structure.selectWeight(item.element);
            this.ui.updateSelection({ weight: item.element });
            this.weightPopup.show(item.element, event.clientX, event.clientY);
        } else if (item.type === 'node') {
            this.closeAll();
            this.structure.selectNode(item.element);
            this.ui.updateSelection({ node: item.element });
            this.nodePopup.show(item.element, event.clientX, event.clientY);
        } else if (item.type === 'segment') {
            this.closeAll();
            this.structure.selectSegment(item.element);
            this.ui.updateSelection({ segment: item.element });
            this.segmentPopup.show(item.element, event.clientX, event.clientY, pos);
        }
    }

    /**
     * Generate menu items for empty space.
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {Array} Menu items
     */
    getEmptySpaceMenuItems(x, y) {
        const bounds = {
            width: this.getCanvasWidth(),
            groundY: this.getGroundY()
        };
        const nodeRadius = this.getNodeRadius();

        // Clamp first, then snap, then re-clamp (ensures final position is on-grid AND in-bounds)
        let pos = clampToCanvas(x, y, bounds, nodeRadius);
        if (this.ui.snapToGrid) {
            pos = snapToGrid(pos.x, pos.y, this.getGridSize());
            pos = clampToCanvas(pos.x, pos.y, bounds, nodeRadius);
        }

        return [
            {
                label: '📍  Add Node',
                callback: () => {
                    const node = this.structure.addNode(pos.x, pos.y);
                    this.structure.selectNode(node);
                    this.ui.updateSelection({ node });
                    this.onStatsUpdate();
                }
            }
        ];
    }

    /**
     * Generate picker menu for overlapping elements.
     * @param {Array} elements - Array of { type, element } objects
     * @param {Event} event - Mouse event
     * @param {Object} pos - { x, y } canvas position
     * @returns {Array} Menu items
     */
    getElementPickerMenuItems(elements, event, pos) {
        return elements.map(item => {
            let label;
            if (item.type === 'weight') {
                label = `⚖️  Weight #${item.element.id}`;
            } else if (item.type === 'node') {
                label = `📍  Node #${item.element.id}`;
            } else if (item.type === 'segment') {
                label = `📏  Segment #${item.element.id}`;
            }

            return {
                label,
                callback: () => {
                    this.showElementMenu(item, event, pos);
                }
            };
        });
    }

    /**
     * Close all menus and popups.
     */
    closeAll() {
        if (this.contextMenu) {
            this.contextMenu.close();
            this.contextMenu = null;
        }
        if (this.weightPopup?.isOpen()) {
            this.weightPopup.close();
        }
        if (this.nodePopup?.isOpen()) {
            this.nodePopup.close();
        }
        if (this.multiNodePopup?.isOpen()) {
            this.multiNodePopup.close();
        }
        if (this.segmentPopup?.isOpen()) {
            this.segmentPopup.close();
        }
    }

    /**
     * Check if context menu is open.
     * @returns {boolean}
     */
    isContextMenuOpen() {
        return this.contextMenu?.isOpen() ?? false;
    }

    /**
     * Check if weight popup is open.
     * @returns {boolean}
     */
    isWeightPopupOpen() {
        return this.weightPopup?.isOpen() ?? false;
    }

    /**
     * Check if node popup is open.
     * @returns {boolean}
     */
    isNodePopupOpen() {
        return this.nodePopup?.isOpen() ?? false;
    }

    /**
     * Check if multi-node popup is open.
     * @returns {boolean}
     */
    isMultiNodePopupOpen() {
        return this.multiNodePopup?.isOpen() ?? false;
    }

    /**
     * Check if segment popup is open.
     * @returns {boolean}
     */
    isSegmentPopupOpen() {
        return this.segmentPopup?.isOpen() ?? false;
    }

    /**
     * Check if any menu/popup is open.
     * @returns {boolean}
     */
    isAnyOpen() {
        return this.isContextMenuOpen() || this.isWeightPopupOpen() || this.isNodePopupOpen() || this.isMultiNodePopupOpen() || this.isSegmentPopupOpen();
    }

    /**
     * Get the weight currently shown in popup (if any).
     * @returns {Object|null}
     */
    get popupWeight() {
        return this.weightPopup?.weight ?? null;
    }

    /**
     * Get the node currently shown in popup (if any).
     * @returns {Object|null}
     */
    get popupNode() {
        return this.nodePopup?.node ?? null;
    }

    /**
     * Get the segment currently shown in popup (if any).
     * @returns {Object|null}
     */
    get popupSegment() {
        return this.segmentPopup?.segment ?? null;
    }
}
