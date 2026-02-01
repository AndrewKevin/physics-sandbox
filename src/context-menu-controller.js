/**
 * ContextMenuController
 * Orchestrates context menus and weight popup display
 */

import { ContextMenu } from './context-menu.js';
import { WeightPopup } from './weight-popup.js';
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
     */
    constructor(options = {}) {
        this.structure = options.structure;
        this.ui = options.ui;
        this.getGroundY = options.getGroundY ?? (() => 540);
        this.getCanvasWidth = options.getCanvasWidth ?? (() => 800);
        this.getNodeRadius = options.getNodeRadius ?? (() => 12);
        this.getGridSize = options.getGridSize ?? (() => 20);
        this.onStatsUpdate = options.onStatsUpdate ?? (() => {});

        this.contextMenu = null;
        this.weightPopup = new WeightPopup();

        this.setupWeightPopupCallbacks();
    }

    /**
     * Set up callbacks for the weight popup.
     */
    setupWeightPopupCallbacks() {
        this.weightPopup.onDelete = (weight) => {
            if (this.structure.weights.includes(weight)) {
                this.structure.removeWeight(weight);
                this.ui.updateSelection({});
                this.onStatsUpdate();
            }
        };

        this.weightPopup.onMassChange = () => {
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
            }
        };

        this.weightPopup.onPositionChange = () => {
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
            }
        };

        this.weightPopup.onClose = () => {
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
            const menuItems = this.getNodeMenuItems(item.element);
            this.showContextMenu(event, menuItems);
        } else if (item.type === 'segment') {
            const menuItems = this.getSegmentMenuItems(item.element, pos.x, pos.y);
            this.showContextMenu(event, menuItems);
        }
    }

    /**
     * Generate menu items for a node.
     * @param {Object} node - The node
     * @returns {Array} Menu items
     */
    getNodeMenuItems(node) {
        return [
            {
                label: `⚓  ${node.fixed ? 'Unpin' : 'Pin'} Node`,
                callback: () => {
                    if (this.structure.nodes.includes(node)) {
                        node.setFixed(!node.fixed);
                    }
                }
            },
            {
                label: '✕  Delete Node',
                callback: () => {
                    if (this.structure.nodes.includes(node)) {
                        this.structure.removeNode(node);
                        this.ui.updateSelection({});
                        this.onStatsUpdate();
                    }
                }
            }
        ];
    }

    /**
     * Generate menu items for a segment.
     * @param {Object} segment - The segment
     * @param {number} clickX - Click X position
     * @param {number} clickY - Click Y position
     * @returns {Array} Menu items
     */
    getSegmentMenuItems(segment, clickX, clickY) {
        return [
            {
                label: '⚙️  Edit Properties',
                callback: () => {
                    this.structure.selectSegment(segment);
                    this.ui.updateSelection({ segment });
                }
            },
            {
                label: '⚖️  Add Weight',
                callback: () => {
                    if (this.structure.segments.includes(segment)) {
                        const position = getPositionOnSegment(segment, clickX, clickY);
                        const weight = this.structure.addWeight(segment, position);
                        this.structure.selectWeight(weight);
                        this.ui.updateSelection({ weight });
                        this.onStatsUpdate();
                    }
                }
            },
            {
                label: '✕  Delete Segment',
                callback: () => {
                    if (this.structure.segments.includes(segment)) {
                        this.structure.removeSegment(segment);
                        this.ui.updateSelection({});
                        this.onStatsUpdate();
                    }
                }
            }
        ];
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
     * Check if any menu/popup is open.
     * @returns {boolean}
     */
    isAnyOpen() {
        return this.isContextMenuOpen() || this.isWeightPopupOpen();
    }

    /**
     * Get the weight currently shown in popup (if any).
     * @returns {Object|null}
     */
    get popupWeight() {
        return this.weightPopup?.weight ?? null;
    }
}
