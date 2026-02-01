/**
 * Physics Sandbox - Main Entry Point
 * Interactive physics simulation for exploring load and stress
 */

import { StructureManager, Node, MATERIALS } from './structure.js';
import { Renderer } from './renderer.js';
import { UIController } from './ui.js';
import { clampToCanvas } from './position-utils.js';
import { DragController } from './drag-controller.js';
import { HoverController } from './hover-controller.js';
import { PhysicsController } from './physics-controller.js';
import { ContextMenuController } from './context-menu-controller.js';
import { StateModal } from './state-modal.js';

class PhysicsSandbox {
    // Constants
    static GROUND_OFFSET = 60;
    static GROUND_WIDTH_MULTIPLIER = 2;

    constructor() {
        // Core state
        this.material = 'beam';
        this.isSimulating = false;
        this.groundY = 0;

        // Snapshot for simulation restore
        this.preSimulationSnapshot = null;

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;

        // Drag controller
        this.drag = new DragController({
            getBounds: () => ({ width: this.renderer.width, groundY: this.groundY }),
            getNodeRadius: () => Node.radius,
            onDragStart: (node) => {
                // Cursor feedback handled in onMouseMove
            },
            onDragMove: (node, pos) => {
                node.updatePosition(pos.x, pos.y);
            },
            onDragEnd: (node) => {
                // Update rest lengths of connected segments
                for (const segment of this.structure.segments) {
                    if (segment.nodeA === node || segment.nodeB === node) {
                        segment.restLength = segment.calculateLength();
                    }
                }
            },
            onDragCancel: (node, originalPos) => {
                node.updatePosition(originalPos.x, originalPos.y);
            }
        });

        // Animation reference
        this.animationId = null;

        // State modal for save/load
        this.stateModal = new StateModal();

        // Initialise components
        this.initCanvas();
        this.initStructure();
        this.initPhysics();
        this.initUI();
        this.initContextMenu();
        this.initEvents();

        // Start render loop
        this.animate();
    }

    initCanvas() {
        this.canvas = document.getElementById('physics-canvas');
        this.renderer = new Renderer(this.canvas);
        this.groundY = this.renderer.height - PhysicsSandbox.GROUND_OFFSET;

        // Initialise hover controller (needs canvas)
        this.hover = new HoverController(this.canvas);
    }

    initStructure() {
        this.structure = new StructureManager();
    }

    initPhysics() {
        this.physics = new PhysicsController({
            getCanvasDimensions: () => ({
                width: this.renderer.width,
                groundY: this.groundY,
                groundOffset: PhysicsSandbox.GROUND_OFFSET
            }),
            getNodeRadius: () => Node.radius,
            groundWidthMultiplier: PhysicsSandbox.GROUND_WIDTH_MULTIPLIER
        });
        this.physics.init();
    }

    initUI() {
        this.ui = new UIController(
            (material) => this.setMaterial(material),
            (simulating) => this.toggleSimulation(simulating),
            () => this.clear()
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

        // Wire up save/load callbacks
        this.ui.setSaveCallback(() => this.saveState());
        this.ui.setLoadCallback(() => this.loadState());
    }

    initContextMenu() {
        this.menus = new ContextMenuController({
            structure: this.structure,
            ui: this.ui,
            getGroundY: () => this.groundY,
            getNodeRadius: () => Node.radius,
            onStatsUpdate: () => this.updateStats()
        });
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
            if (this.isSimulating) {
                this.physics.updateGroundPosition({
                    width: this.renderer.width,
                    groundY: this.groundY,
                    groundOffset: PhysicsSandbox.GROUND_OFFSET
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
        // ESC key priority: 1) close state modal, 2) close menus, 3) cancel drag, 4) clear selection
        if (e.key === 'Escape') {
            // First, close state modal if open
            if (this.stateModal.isOpen()) {
                this.stateModal.close();
                return;
            }

            // Second, close any open menus/popups
            if (this.menus.isAnyOpen()) {
                this.closeAllMenus();
                return;
            }

            // Third, cancel drag and restore node position
            if (this.drag.isActive) {
                this.drag.cancelDrag();
                return;
            }

            // Finally, clear selection
            this.structure.clearSelection();
            this.ui.updateSelection({});
            return;
        }

        // Delete selected element on Delete/Backspace
        if ((e.key === 'Delete' || e.key === 'Backspace') && !this.isSimulating && !this.drag.isActive) {
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
            if (this.menus.isWeightPopupOpen() && this.menus.popupWeight === selectedWeight) {
                this.closeAllMenus();
            }
            this.structure.removeWeight(selectedWeight);
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedNode) {
            // Close popup if it's showing a weight attached to this node
            if (this.menus.isWeightPopupOpen() && this.menus.popupWeight?.isAttachedTo(selectedNode)) {
                this.closeAllMenus();
            }
            this.structure.removeNode(selectedNode);
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedSegment) {
            // Close popup if it's showing a weight attached to this segment
            if (this.menus.isWeightPopupOpen() && this.menus.popupWeight?.isAttachedTo(selectedSegment)) {
                this.closeAllMenus();
            }
            this.structure.removeSegment(selectedSegment);
            this.ui.updateSelection({});
            this.updateStats();
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
                    this.drag.beginPotentialDrag(node, pos);
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
            if (!this.isSimulating && this.drag.isTracking) {
                const result = this.drag.updateDrag(pos);
                if (result.isDragging) {
                    return;
                }
            }

            // Update hover states for visual feedback
            if (!this.isSimulating) {
                this.hover.clear();
                this.hover.update(this.findElementAt(pos.x, pos.y));
            }
        }
    }

    onTouchEnd(e) {
        if (this.touchStartPos && e.changedTouches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.changedTouches[0]);

            const { wasDrag } = this.drag.endDrag();

            if (!wasDrag) {
                // Only trigger click if finger didn't move much (tap vs drag)
                const dx = pos.x - this.touchStartPos.x;
                const dy = pos.y - this.touchStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < DragController.TAP_THRESHOLD) {
                    // Simulate click at touch position (skip wasJustDragging check as we handle it here)
                    this.drag.clearClickSuppression();
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
            this.drag.beginPotentialDrag(node, pos);
        }
    }

    onMouseUp(e) {
        if (e.button !== 0) return;
        this.drag.endDrag();
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        // Handle dragging
        if (!this.isSimulating && this.drag.isTracking) {
            const result = this.drag.updateDrag(pos);
            if (result.isDragging) {
                this.canvas.style.cursor = 'grabbing';
                return;
            }
        }

        // Update hover states and cursor
        if (!this.isSimulating) {
            this.hover.clear();
            this.hover.update(this.findElementAt(pos.x, pos.y));
        } else {
            this.canvas.style.cursor = 'default';
        }
    }


    onClick(e) {
        if (this.isSimulating) return;

        // Skip click if we just finished dragging
        if (this.drag.shouldSuppressClick) {
            this.drag.clearClickSuppression();
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
            const bounds = { width: this.renderer.width, groundY: this.groundY };
            const clamped = clampToCanvas(x, y, bounds, Node.radius);
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
        const elements = this.findAllElementsAt(pos.x, pos.y);
        this.menus.handleRightClick(e, pos.x, pos.y, elements);
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
     * Close all open menus (context menu and weight popup).
     */
    closeAllMenus() {
        this.menus.closeAll();
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
        // Take snapshot before simulation for restore on stop
        this.preSimulationSnapshot = this.structure.snapshot();

        this.isSimulating = true;
        this.ui.setSimulating(true);

        // Clear hover states
        this.hover.clear();

        // Start physics simulation
        this.physics.start(this.structure);

        // Clear selection during simulation
        this.structure.clearSelection();
        this.ui.updateSelection({});
    }

    stopSimulation() {
        this.isSimulating = false;
        this.ui.setSimulating(false);

        // Stop physics
        this.physics.stop(this.structure);

        // Restore to pre-simulation state
        if (this.preSimulationSnapshot) {
            this.structure.restore(this.preSimulationSnapshot);
            this.preSimulationSnapshot = null;
        }
    }

    clear() {
        this.stopSimulation();
        this.structure.clear();
        this.hover.reset();
        this.drag.reset();
        this.preSimulationSnapshot = null;
        this.ui.updateSelection({});
        this.updateStats();
    }

    /**
     * Show save modal with current structure state.
     */
    saveState() {
        // Stop simulation if running (so we save the pre-simulation state)
        if (this.isSimulating) {
            this.stopSimulation();
        }

        const state = this.structure.serialize();
        const json = JSON.stringify(state, null, 2);
        this.stateModal.showSave(json);
    }

    /**
     * Show load modal and restore structure from pasted state.
     */
    loadState() {
        // Stop simulation if running
        if (this.isSimulating) {
            this.stopSimulation();
        }

        this.stateModal.showLoad((state) => {
            this.structure.deserialize(state);
            this.preSimulationSnapshot = null;
            this.hover.reset();
            this.drag.reset();
            this.ui.updateSelection({});
            this.updateStats();
        });
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
            mouseY: this.mouseY,
            showStressLabels: this.ui.showStressLabels
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
