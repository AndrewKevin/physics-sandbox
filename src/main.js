/**
 * Physics Sandbox - Main Entry Point
 * Interactive physics simulation for exploring load and stress
 */

import Matter from 'matter-js';
import { StructureManager, Node, Weight, MATERIALS } from './structure.js';
import { Renderer } from './renderer.js';
import { UIController } from './ui.js';
import { WeightPopup } from './weight-popup.js';
import { ContextMenu } from './context-menu.js';

class PhysicsSandbox {
    // Constants
    static GROUND_OFFSET = 60;
    static TOUCH_TAP_THRESHOLD = 15;
    static GROUND_WIDTH_MULTIPLIER = 2;

    constructor() {
        // Core state
        this.material = 'beam';
        this.isSimulating = false;
        this.groundY = 0;

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.hoveredNode = null;
        this.hoveredSegment = null;
        this.hoveredWeight = null;

        // Drag state
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;  // Mouse position when drag started
        this.dragStartNodePos = null;   // Original node position for restoration
        this.wasJustDragging = false;

        // Physics references
        this.groundBody = null;
        this.animationId = null;

        // Initialise components
        this.initCanvas();
        this.initStructure();
        this.initPhysics();
        this.initUI();
        this.initContextMenu();
        this.initWeightPopup();
        this.initEvents();

        // Start render loop
        this.animate();
    }

    initCanvas() {
        this.canvas = document.getElementById('physics-canvas');
        this.renderer = new Renderer(this.canvas);
        this.groundY = this.renderer.height - PhysicsSandbox.GROUND_OFFSET;
    }

    initStructure() {
        this.structure = new StructureManager();
    }

    initPhysics() {
        // Create Matter.js engine (dormant until simulation starts)
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 2 }  // Higher gravity for visible load
        });

        this.runner = Matter.Runner.create({
            delta: 1000 / 60,
            isFixed: true
        });
    }

    initUI() {
        this.ui = new UIController(
            (material) => this.setMaterial(material),
            (simulating) => this.toggleSimulation(simulating),
            () => this.reset()
        );

        // Wire up property change callbacks
        this.ui.setSegmentCompressionCallback((compression) => {
            const seg = this.structure.selectedSegment;
            if (seg) {
                seg.compressionOnly = compression;
                if (compression) seg.tensionOnly = false;
                this.ui.updateSelection({ segment: seg });
            }
        });

        this.ui.setSegmentTensionCallback((tension) => {
            const seg = this.structure.selectedSegment;
            if (seg) {
                seg.tensionOnly = tension;
                if (tension) seg.compressionOnly = false;
                this.ui.updateSelection({ segment: seg });
            }
        });

        this.ui.setSegmentMaterialCallback((material) => {
            const seg = this.structure.selectedSegment;
            if (seg) {
                seg.material = material;
                // Update stiffness/damping from new material defaults
                seg.stiffness = MATERIALS[material].stiffness;
                seg.damping = MATERIALS[material].damping;
                seg.tensionOnly = MATERIALS[material].tensionOnly;
                seg.compressionOnly = MATERIALS[material].compressionOnly;
                this.ui.updateSelection({ segment: seg });
            }
        });

        this.ui.setSegmentStiffnessCallback((stiffness) => {
            const seg = this.structure.selectedSegment;
            if (seg) {
                seg.stiffness = stiffness;
            }
        });

        this.ui.setSegmentDampingCallback((damping) => {
            const seg = this.structure.selectedSegment;
            if (seg) {
                seg.damping = damping;
            }
        });
    }

    initContextMenu() {
        // Context menu will be created dynamically when needed
        //
        // Extensible Context Menu System:
        // 1. Create a new get*MenuItems() method for your element type
        // 2. Add element detection in onRightClick()
        // 3. Call showContextMenu(event, menuItems) with your items
        //
        // Example:
        //   const items = this.getMyElementMenuItems(element);
        //   this.showContextMenu(e, items);
        this.contextMenu = null;
    }

    initWeightPopup() {
        this.weightPopup = new WeightPopup();

        this.weightPopup.onDelete = (weight) => {
            if (this.structure.weights.includes(weight)) {
                this.structure.removeWeight(weight);
                this.ui.updateSelection({});
                this.updateStats();
            }
        };

        this.weightPopup.onMassChange = () => {
            // Weight mass is updated directly by the popup
            // Just refresh the UI selection info
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
            }
        };

        this.weightPopup.onPositionChange = () => {
            // Weight position is updated directly by the popup
            const weight = this.structure.selectedWeight;
            if (weight) {
                this.ui.updateSelection({ weight });
            }
        };

        this.weightPopup.onClose = () => {
            // Optionally clear selection when popup closes
        };
    }

    /**
     * Show a context menu with specified items at event position.
     * @param {Event} event - The mouse event for positioning
     * @param {Array} menuItems - Array of menu item objects {label, callback}
     */
    showContextMenu(event, menuItems) {
        // Close all existing menus first
        this.closeAllMenus();

        // Show context menu at click position
        this.contextMenu = new ContextMenu();
        this.contextMenu.show(event.clientX, event.clientY, menuItems);
    }

    /**
     * Generate menu items for a node context menu.
     * @param {Node} node - The node to create menu items for
     * @returns {Array} Array of menu item objects
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
                        this.updateStats();
                    }
                }
            }
        ];
    }

    /**
     * Generate menu items for a segment context menu.
     * @param {Segment} segment - The segment to create menu items for
     * @param {number} clickX - X position of click (for weight placement)
     * @param {number} clickY - Y position of click (for weight placement)
     * @returns {Array} Array of menu item objects
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
                        // Calculate position along segment (0-1) based on click position
                        const position = this.getPositionOnSegment(segment, clickX, clickY);
                        const weight = this.structure.addWeight(segment, position);
                        this.structure.selectWeight(weight);
                        this.ui.updateSelection({ weight });
                        this.updateStats();
                    }
                }
            },
            {
                label: '✕  Delete Segment',
                callback: () => {
                    if (this.structure.segments.includes(segment)) {
                        this.structure.removeSegment(segment);
                        this.ui.updateSelection({});
                        this.updateStats();
                    }
                }
            }
        ];
    }

    /**
     * Calculate the position (0-1) of a point projected onto a segment.
     * @param {Segment} segment - The segment
     * @param {number} px - Point X
     * @param {number} py - Point Y
     * @returns {number} Position along segment (0-1)
     */
    getPositionOnSegment(segment, px, py) {
        const x1 = segment.nodeA.x;
        const y1 = segment.nodeA.y;
        const x2 = segment.nodeB.x;
        const y2 = segment.nodeB.y;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) return 0.5;

        const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        return Math.max(0, Math.min(1, t));
    }

    initEvents() {
        // Mouse events on canvas
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            // Don't prevent default yet - let onRightClick decide
            this.onRightClick(e);
        });

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

        // Keyboard events
        window.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Window resize
        window.addEventListener('resize', () => {
            this.groundY = this.renderer.height - PhysicsSandbox.GROUND_OFFSET;

            // Update ground body position during simulation
            if (this.isSimulating && this.groundBody) {
                Matter.Body.setPosition(this.groundBody, {
                    x: this.renderer.width / 2,
                    y: this.groundY + PhysicsSandbox.GROUND_OFFSET / 2
                });
            }
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    getTouchPos(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    onKeyDown(e) {
        // ESC key priority: 1) close menus, 2) cancel drag, 3) clear selection
        if (e.key === 'Escape') {
            // First, close any open menus/popups
            if (this.contextMenu?.isOpen() || this.weightPopup?.isOpen()) {
                this.closeAllMenus();
                return;
            }

            // Second, cancel drag and restore node position
            if (this.isDragging) {
                if (this.draggedNode && this.dragStartNodePos) {
                    this.draggedNode.updatePosition(this.dragStartNodePos.x, this.dragStartNodePos.y);
                }
                this.isDragging = false;
                this.draggedNode = null;
                this.dragStartMousePos = null;
                this.dragStartNodePos = null;
                this.wasJustDragging = false;
                return;
            }

            // Finally, clear selection
            this.structure.clearSelection();
            this.ui.updateSelection({});
            return;
        }

        // Delete selected element on Delete/Backspace
        if ((e.key === 'Delete' || e.key === 'Backspace') && !this.isSimulating && !this.isDragging) {
            // Don't handle if typing in an input element
            const tagName = e.target.tagName;
            if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') return;

            e.preventDefault();
            this.deleteSelectedElement();
        }
    }

    /**
     * Delete the currently selected element (weight, node, or segment).
     */
    deleteSelectedElement() {
        const selectedWeight = this.structure.selectedWeight;
        const selectedNode = this.structure.selectedNodes[0];  // selectedNodes is an array
        const selectedSegment = this.structure.selectedSegment;

        if (selectedWeight) {
            // Close popup if it's showing this weight
            if (this.weightPopup?.isOpen() && this.weightPopup.weight === selectedWeight) {
                this.weightPopup.close();
            }
            this.structure.removeWeight(selectedWeight);
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedNode) {
            // Close popup if it's showing a weight attached to this node
            if (this.weightPopup?.isOpen() && this.weightPopup.weight?.isAttachedTo(selectedNode)) {
                this.weightPopup.close();
            }
            this.structure.removeNode(selectedNode);
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedSegment) {
            // Close popup if it's showing a weight attached to this segment
            if (this.weightPopup?.isOpen() && this.weightPopup.weight?.isAttachedTo(selectedSegment)) {
                this.weightPopup.close();
            }
            this.structure.removeSegment(selectedSegment);
            this.ui.updateSelection({});
            this.updateStats();
        }
    }

    /**
     * Clamp position to canvas bounds, keeping node fully visible.
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {{x: number, y: number}} Clamped position
     */
    clampToCanvas(x, y) {
        const minX = Node.radius;
        const maxX = this.renderer.width - Node.radius;
        const minY = Node.radius;
        const maxY = this.groundY - Node.radius;

        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y))
        };
    }

    /**
     * Clear hover states from all elements.
     */
    clearHoverStates() {
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

    onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.touches[0]);
            this.mouseX = pos.x;
            this.mouseY = pos.y;
            this.touchStartPos = pos;

            // Check if touching a node for potential drag
            if (!this.isSimulating) {
                const node = this.structure.findNodeAt(pos.x, pos.y);
                if (node) {
                    this.draggedNode = node;
                    this.dragStartMousePos = { x: pos.x, y: pos.y };
                    this.dragStartNodePos = { x: node.x, y: node.y };
                }
            }
        }
    }

    onTouchMove(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.touches[0]);
            this.mouseX = pos.x;
            this.mouseY = pos.y;

            // Handle dragging
            if (!this.isSimulating && this.draggedNode && this.dragStartMousePos) {
                const dx = pos.x - this.dragStartMousePos.x;
                const dy = pos.y - this.dragStartMousePos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > PhysicsSandbox.TOUCH_TAP_THRESHOLD || this.isDragging) {
                    this.isDragging = true;
                    const clamped = this.clampToCanvas(pos.x, pos.y);
                    this.draggedNode.updatePosition(clamped.x, clamped.y);
                    return;
                }
            }

            // Update hover states for visual feedback
            if (!this.isSimulating) {
                this.clearHoverStates();
                this.updateHoverState(pos.x, pos.y);
            }
        }
    }

    onTouchEnd(e) {
        if (this.touchStartPos && e.changedTouches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.changedTouches[0]);

            const draggedNode = this.draggedNode;

            // Clear drag state
            this.draggedNode = null;
            this.dragStartMousePos = null;
            this.dragStartNodePos = null;

            if (this.isDragging) {
                this.isDragging = false;

                // Update rest lengths of connected segments after drag
                for (const segment of this.structure.segments) {
                    if (segment.nodeA === draggedNode || segment.nodeB === draggedNode) {
                        segment.restLength = segment.calculateLength();
                    }
                }
            } else {
                // Only trigger click if finger didn't move much (tap vs drag)
                const dx = pos.x - this.touchStartPos.x;
                const dy = pos.y - this.touchStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < PhysicsSandbox.TOUCH_TAP_THRESHOLD) {
                    // Simulate click at touch position (skip wasJustDragging check as we handle it here)
                    this.wasJustDragging = false;
                    this.onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
                }
            }
        }
        this.touchStartPos = null;
    }

    onMouseDown(e) {
        if (this.isSimulating || e.button !== 0) return;

        const pos = this.getMousePos(e);
        const node = this.structure.findNodeAt(pos.x, pos.y);

        if (node) {
            this.draggedNode = node;
            this.dragStartMousePos = { x: pos.x, y: pos.y };
            this.dragStartNodePos = { x: node.x, y: node.y };
        }
    }

    onMouseUp(e) {
        if (e.button !== 0) return;

        const draggedNode = this.draggedNode;

        // Clear drag state
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;

        if (this.isDragging) {
            this.isDragging = false;
            this.wasJustDragging = true;

            // Update rest lengths of connected segments after drag
            for (const segment of this.structure.segments) {
                if (segment.nodeA === draggedNode || segment.nodeB === draggedNode) {
                    segment.restLength = segment.calculateLength();
                }
            }
        }
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        // Handle dragging
        if (!this.isSimulating && this.draggedNode && this.dragStartMousePos) {
            const dx = pos.x - this.dragStartMousePos.x;
            const dy = pos.y - this.dragStartMousePos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Start dragging after moving past threshold
            if (distance > PhysicsSandbox.TOUCH_TAP_THRESHOLD || this.isDragging) {
                this.isDragging = true;
                const clamped = this.clampToCanvas(pos.x, pos.y);
                this.draggedNode.updatePosition(clamped.x, clamped.y);
                this.canvas.style.cursor = 'grabbing';
                return;
            }
        }

        // Update hover states and cursor
        if (!this.isSimulating) {
            this.clearHoverStates();
            this.updateHoverState(pos.x, pos.y);
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    /**
     * Update hover state for element at position and set appropriate cursor.
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    updateHoverState(x, y) {
        const found = this.findElementAt(x, y);

        if (!found) {
            this.canvas.style.cursor = 'default';
            return;
        }

        const { type, element } = found;
        element.hovered = true;

        if (type === 'weight') {
            this.hoveredWeight = element;
            this.canvas.style.cursor = 'pointer';
        } else if (type === 'node') {
            this.hoveredNode = element;
            this.canvas.style.cursor = 'grab';
        } else if (type === 'segment') {
            this.hoveredSegment = element;
            this.canvas.style.cursor = 'pointer';
        }
    }

    onClick(e) {
        if (this.isSimulating) return;

        // Skip click if we just finished dragging
        if (this.wasJustDragging) {
            this.wasJustDragging = false;
            return;
        }

        const pos = this.getMousePos(e);
        this.handleClick(pos.x, pos.y);
        this.updateStats();
    }

    /**
     * Unified click handler - routes to element-specific handlers.
     * Uses centralised element detection with priority: weight > node > segment.
     */
    handleClick(x, y) {
        const found = this.findElementAt(x, y);

        if (found) {
            const { type, element } = found;
            if (type === 'weight') {
                this.handleWeightClick(element);
            } else if (type === 'node') {
                this.handleNodeClick(element);
            } else if (type === 'segment') {
                this.handleSegmentClick(element);
            }
        } else {
            this.handleEmptySpaceClick(x, y);
        }
    }

    /**
     * Handle click on a weight - toggles selection.
     */
    handleWeightClick(weight) {
        if (weight.selected) {
            this.structure.clearSelection();
            this.ui.updateSelection({});
        } else {
            this.structure.selectWeight(weight);
            this.ui.updateSelection({ weight });
        }
    }

    /**
     * Handle click on a node - selects it, or creates segment if another node is selected.
     * Enables node chaining by always selecting the clicked node.
     */
    handleNodeClick(node) {
        const currentlySelectedNode = this.structure.selectedNodes[0];

        // Toggle off if clicking same node
        if (currentlySelectedNode === node) {
            this.structure.clearSelection();
            this.ui.updateSelection({});
            return;
        }

        // Create segment if another node is selected
        if (currentlySelectedNode) {
            this.structure.addSegment(currentlySelectedNode, node, this.material);
        }

        // Always select the clicked node to enable chaining
        this.structure.selectNode(node);
        this.ui.updateSelection({ node });
    }

    /**
     * Handle click on a segment - toggles selection.
     */
    handleSegmentClick(segment) {
        if (segment.selected) {
            this.structure.clearSelection();
            this.ui.updateSelection({});
        } else {
            this.structure.selectSegment(segment);
            this.ui.updateSelection({ segment });
        }
    }

    /**
     * Handle click on empty space - creates new node and connects if node selected,
     * otherwise clears selection.
     */
    handleEmptySpaceClick(x, y) {
        const currentlySelectedNode = this.structure.selectedNodes[0];

        if (currentlySelectedNode) {
            // Create new node and connect to selected node
            const clamped = this.clampToCanvas(x, y);
            const newNode = this.structure.addNode(clamped.x, clamped.y);
            this.structure.addSegment(currentlySelectedNode, newNode, this.material);

            // Select new node to continue chaining
            this.structure.selectNode(newNode);
            this.ui.updateSelection({ node: newNode });
        } else {
            // Clear selection
            this.structure.clearSelection();
            this.ui.updateSelection({});
        }
    }

    onRightClick(e) {
        // Always prevent default browser context menu
        e.preventDefault();

        if (this.isSimulating) return;

        const pos = this.getMousePos(e);

        // Find all elements at this position
        const elements = this.findAllElementsAt(pos.x, pos.y);

        if (elements.length === 0) {
            // Right-click on empty space - show menu with "Add Node" option
            const menuItems = this.getEmptySpaceMenuItems(pos.x, pos.y);
            this.showContextMenu(e, menuItems);
        } else if (elements.length === 1) {
            // Single element - show its menu directly
            this.showElementMenu(elements[0], e, pos);
        } else {
            // Multiple elements - show picker menu
            const menuItems = this.getElementPickerMenuItems(elements, e, pos);
            this.showContextMenu(e, menuItems);
        }
    }

    /**
     * Find all elements at a given position.
     * Segments are excluded from the picker (they're large and can be clicked elsewhere).
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {Array} Array of {type, element} objects
     */
    findAllElementsAt(x, y) {
        const elements = [];

        const weight = this.structure.findWeightAt(x, y);
        if (weight) elements.push({ type: 'weight', element: weight });

        const node = this.structure.findNodeAt(x, y);
        if (node) elements.push({ type: 'node', element: node });

        // Only include segment if no other elements found (segments are large, easily clicked elsewhere)
        if (elements.length === 0) {
            const segment = this.structure.findSegmentAt(x, y);
            if (segment) elements.push({ type: 'segment', element: segment });
        }

        return elements;
    }

    /**
     * Find the highest-priority element at a position.
     * Priority order: weight > node > segment (smallest to largest hit areas).
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {{type: string, element: Object}|null} The element, or null if none found
     */
    findElementAt(x, y) {
        const weight = this.structure.findWeightAt(x, y);
        if (weight) return { type: 'weight', element: weight };

        const node = this.structure.findNodeAt(x, y);
        if (node) return { type: 'node', element: node };

        const segment = this.structure.findSegmentAt(x, y);
        if (segment) return { type: 'segment', element: segment };

        return null;
    }

    /**
     * Show the appropriate menu for an element.
     * @param {Object} item - {type, element} object
     * @param {Event} e - The mouse event
     * @param {Object} pos - {x, y} canvas position
     */
    showElementMenu(item, e, pos) {
        if (item.type === 'weight') {
            this.closeAllMenus();
            this.structure.selectWeight(item.element);
            this.ui.updateSelection({ weight: item.element });
            this.weightPopup.show(item.element, e.clientX, e.clientY);
        } else if (item.type === 'node') {
            const menuItems = this.getNodeMenuItems(item.element);
            this.showContextMenu(e, menuItems);
        } else if (item.type === 'segment') {
            const menuItems = this.getSegmentMenuItems(item.element, pos.x, pos.y);
            this.showContextMenu(e, menuItems);
        }
    }

    /**
     * Generate picker menu items for overlapping elements.
     * @param {Array} elements - Array of {type, element} objects
     * @param {Event} e - The mouse event (for submenu positioning)
     * @param {Object} pos - {x, y} canvas position
     * @returns {Array} Array of menu item objects
     */
    getElementPickerMenuItems(elements, e, pos) {
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
                    // showElementMenu calls closeAllMenus() first, so no delay needed
                    this.showElementMenu(item, e, pos);
                }
            };
        });
    }

    /**
     * Generate menu items for empty space context menu.
     * @param {number} x - X position for new node
     * @param {number} y - Y position for new node
     * @returns {Array} Array of menu item objects
     */
    getEmptySpaceMenuItems(x, y) {
        // Clamp position above ground
        const clampedY = Math.min(y, this.groundY - Node.radius);

        return [
            {
                label: '📍  Add Node',
                callback: () => {
                    const node = this.structure.addNode(x, clampedY);
                    this.structure.selectNode(node);
                    this.ui.updateSelection({ node });
                    this.updateStats();
                }
            }
        ];
    }

    /**
     * Close all open menus (context menu and weight popup).
     */
    closeAllMenus() {
        if (this.contextMenu) {
            this.contextMenu.close();
            this.contextMenu = null;
        }
        if (this.weightPopup?.isOpen()) {
            this.weightPopup.close();
        }
    }

    setMaterial(material) {
        this.material = material;
    }

    toggleSimulation(start) {
        if (start) {
            this.startSimulation();
        } else {
            this.stopSimulation();
        }
    }

    startSimulation() {
        this.isSimulating = true;
        this.ui.setSimulating(true);

        // Clear hover states
        this.clearHoverStates();

        // Clear existing physics world
        Matter.World.clear(this.engine.world);
        Matter.Engine.clear(this.engine);

        // Recreate engine to ensure clean state
        // Higher gravity for more visible stress
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 2 }
        });

        // Collision categories - used to prevent weight/node overlap issues
        const CATEGORY_NODE = 0x0001;
        const CATEGORY_WEIGHT = 0x0002;
        const CATEGORY_GROUND = 0x0004;

        // Create ground
        this.groundBody = Matter.Bodies.rectangle(
            this.renderer.width / 2,
            this.groundY + PhysicsSandbox.GROUND_OFFSET / 2,
            this.renderer.width * PhysicsSandbox.GROUND_WIDTH_MULTIPLIER,  // Extra wide to handle resize
            PhysicsSandbox.GROUND_OFFSET,
            {
                isStatic: true,
                label: 'ground',
                collisionFilter: {
                    category: CATEGORY_GROUND,
                    mask: CATEGORY_NODE | CATEGORY_WEIGHT  // Collide with both
                }
            }
        );
        Matter.World.add(this.engine.world, this.groundBody);

        // Create physics bodies for nodes
        for (const node of this.structure.nodes) {
            const body = Matter.Bodies.circle(node.x, node.y, Node.radius, {
                isStatic: node.fixed,
                mass: 5,              // Heavier nodes = more gravitational load
                restitution: 0.2,
                friction: 0.8,
                frictionStatic: 1.0,
                frictionAir: 0.01,    // Slight air resistance for stability
                collisionFilter: {
                    category: CATEGORY_NODE,
                    mask: CATEGORY_GROUND  // Only collide with ground, not weights
                }
            });
            node.body = body;
            Matter.World.add(this.engine.world, body);
        }

        // Create constraints for segments
        for (const segment of this.structure.segments) {
            const materialData = MATERIALS[segment.material];

            // Use segment's own stiffness/damping if set, otherwise fall back to material defaults
            const stiffness = segment.stiffness !== undefined ? segment.stiffness : materialData.stiffness;
            const damping = segment.damping !== undefined ? segment.damping : materialData.damping;

            const constraint = Matter.Constraint.create({
                bodyA: segment.nodeA.body,
                bodyB: segment.nodeB.body,
                stiffness: stiffness,
                damping: damping,
                length: segment.restLength
            });

            segment.constraint = constraint;
            Matter.World.add(this.engine.world, constraint);
        }

        // Create physics bodies for weights
        for (const weight of this.structure.weights) {
            const pos = weight.getPosition();

            // Create weight body (heavier, affected by gravity)
            // Use dynamic radius based on mass
            const body = Matter.Bodies.circle(pos.x, pos.y, weight.getRadius(), {
                mass: weight.mass,
                restitution: 0.1,
                friction: 0.8,
                frictionStatic: 1.0,
                frictionAir: 0.02,
                label: 'weight',
                collisionFilter: {
                    category: CATEGORY_WEIGHT,
                    mask: CATEGORY_GROUND  // Only collide with ground, not nodes
                }
            });
            weight.body = body;
            Matter.World.add(this.engine.world, body);

            // Create constraint to attachment point
            if (weight.attachedToNode) {
                // Simple constraint to node body
                const constraint = Matter.Constraint.create({
                    bodyA: weight.body,
                    bodyB: weight.attachedToNode.body,
                    stiffness: 0.9,
                    damping: 0.1,
                    length: 0
                });
                weight.constraint = constraint;
                Matter.World.add(this.engine.world, constraint);
            } else if (weight.attachedToSegment) {
                // For segment attachment, create a constraint to a world point
                // This will be updated each frame in updateWeightConstraints()
                const constraint = Matter.Constraint.create({
                    bodyA: weight.body,
                    pointB: pos,
                    stiffness: 0.9,
                    damping: 0.1,
                    length: 0
                });
                weight.constraint = constraint;
                Matter.World.add(this.engine.world, constraint);
            }
        }

        // Add physics update listener for tension-only/compression-only behaviour
        // Store reference so we can remove it later
        this.constraintModeHandler = () => {
            this.updateConstraintModes();
            this.updateWeightConstraints();
        };
        Matter.Events.on(this.engine, 'beforeUpdate', this.constraintModeHandler);

        // Start physics runner
        Matter.Runner.run(this.runner, this.engine);

        // Clear selection during simulation
        this.structure.clearSelection();
        this.ui.updateSelection({});
    }

    /**
     * Update constraint modes and cache segment lengths.
     * Called each physics frame via Matter.Events beforeUpdate.
     *
     * For tension-only/compression-only segments, we set stiffness=0
     * when the constraint should be inactive. This is the standard
     * Matter.js approach for soft-disabling constraints.
     */
    updateConstraintModes() {
        // Small tolerance to prevent flickering at exact rest length (0.5% of rest length)
        const TOLERANCE_RATIO = 0.005;

        for (const segment of this.structure.segments) {
            // Skip if no constraint or missing bodies
            if (!segment.constraint || !segment.nodeA.body || !segment.nodeB.body) continue;

            // Use Matter.js Vector for length calculation (reused by stress calculation)
            const posA = segment.nodeA.body.position;
            const posB = segment.nodeB.body.position;
            segment.currentLength = Matter.Vector.magnitude(Matter.Vector.sub(posB, posA));

            // Standard segments don't need mode logic
            if (!segment.tensionOnly && !segment.compressionOnly) {
                segment.isSlack = false;
                continue;
            }

            // Calculate tolerance based on rest length
            const tolerance = segment.restLength * TOLERANCE_RATIO;

            // Determine if in tension or compression (with tolerance band)
            const inTension = segment.currentLength > segment.restLength + tolerance;
            const inCompression = segment.currentLength < segment.restLength - tolerance;

            // Apply tension-only / compression-only logic
            const shouldBeSlack =
                (segment.tensionOnly && inCompression) ||
                (segment.compressionOnly && inTension);

            segment.isSlack = shouldBeSlack;
            segment.constraint.stiffness = shouldBeSlack ? 0 : segment.stiffness;
        }
    }

    /**
     * Update segment-attached weight constraints.
     * The attachment point moves with the segment, so we need to
     * recalculate pointB each frame.
     */
    updateWeightConstraints() {
        for (const weight of this.structure.weights) {
            // Only need to update segment-attached weights
            if (!weight.attachedToSegment || !weight.constraint) continue;

            const seg = weight.attachedToSegment;
            if (!seg.nodeA.body || !seg.nodeB.body) continue;

            // Calculate current attachment point on segment
            const posA = seg.nodeA.body.position;
            const posB = seg.nodeB.body.position;
            const attachPoint = {
                x: posA.x + (posB.x - posA.x) * weight.position,
                y: posA.y + (posB.y - posA.y) * weight.position
            };

            // Update constraint's world attachment point
            weight.constraint.pointB = attachPoint;
        }
    }

    stopSimulation() {
        this.isSimulating = false;
        this.ui.setSimulating(false);

        // Stop physics runner
        Matter.Runner.stop(this.runner);

        // Remove the constraint mode event listener to prevent accumulation
        if (this.constraintModeHandler) {
            Matter.Events.off(this.engine, 'beforeUpdate', this.constraintModeHandler);
            this.constraintModeHandler = null;
        }

        // Reset node positions from bodies
        for (const node of this.structure.nodes) {
            if (node.body) {
                node.x = node.body.position.x;
                node.y = node.body.position.y;
                node.body = null;
            }
        }

        // Clear constraints and reset slack state
        for (const segment of this.structure.segments) {
            segment.constraint = null;
            segment.isSlack = false;  // Reset visual state
        }

        // Clear weight bodies and constraints
        for (const weight of this.structure.weights) {
            weight.body = null;
            weight.constraint = null;
        }

        // Clear physics world
        Matter.World.clear(this.engine.world);
        this.groundBody = null;
    }

    reset() {
        this.stopSimulation();
        this.structure.clear();
        this.hoveredNode = null;
        this.hoveredSegment = null;
        this.hoveredWeight = null;
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartMousePos = null;
        this.dragStartNodePos = null;
        this.wasJustDragging = false;
        this.ui.updateSelection({});
        this.updateStats();
    }

    updateStats() {
        const stats = this.structure.getStats();
        this.ui.updateStats(stats);
    }

    animate() {
        // Update stress values during simulation
        if (this.isSimulating) {
            this.structure.updateAllStress();
            this.updateStats();
        }

        // Render
        this.renderer.render(this.structure, {
            simulating: this.isSimulating,
            groundY: this.groundY,
            mouseX: this.mouseX,
            mouseY: this.mouseY
        });

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * Stop the render loop. Call this if destroying the sandbox.
     */
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.stopSimulation();
    }
}

// Initialise when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.sandbox = new PhysicsSandbox();
    });
} else {
    window.sandbox = new PhysicsSandbox();
}
