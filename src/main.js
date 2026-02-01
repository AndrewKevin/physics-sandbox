/**
 * Physics Sandbox - Main Entry Point
 * Interactive physics simulation for exploring load and stress
 */

import { StructureManager, Node, MATERIALS } from './structure.js';
import { Renderer } from './renderer.js';
import { UIController } from './ui.js';
import { clampToCanvas, snapToGrid } from './position-utils.js';
import { DragController } from './drag-controller.js';
import { HoverController } from './hover-controller.js';
import { PhysicsController } from './physics-controller.js';
import { ContextMenuController } from './context-menu-controller.js';
import { InputController } from './input-controller.js';
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
            getSnapEnabled: () => this.ui?.snapToGrid ?? false,
            getGridSize: () => Renderer.GRID_SIZE,
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
        this.initInput();

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
            getCanvasWidth: () => this.renderer.width,
            getNodeRadius: () => Node.radius,
            getGridSize: () => Renderer.GRID_SIZE,
            onStatsUpdate: () => this.updateStats()
        });
    }

    initInput() {
        this.input = new InputController(this.canvas, {
            isSimulating: () => this.isSimulating,
            findNodeAt: (x, y) => this.structure.findNodeAt(x, y),
            findElementAt: (x, y) => this.findElementAt(x, y),
            getDrag: () => this.drag,
            getHover: () => this.hover,
            onMousePosChange: (x, y) => {
                this.mouseX = x;
                this.mouseY = y;
            },
            onClick: (x, y) => {
                this.handleClick(x, y);
                this.updateStats();
            },
            onRightClick: (e, x, y) => {
                const elements = this.findAllElementsAt(x, y);
                this.menus.handleRightClick(e, x, y, elements);
            },
            onEscape: () => this.handleEscape(),
            onDelete: () => this.deleteSelectedElement(),
            onWindowResize: () => {
                this.groundY = this.renderer.height - PhysicsSandbox.GROUND_OFFSET;
                if (this.isSimulating) {
                    this.physics.updateGroundPosition({
                        width: this.renderer.width,
                        groundY: this.groundY,
                        groundOffset: PhysicsSandbox.GROUND_OFFSET
                    });
                }
            }
        });
    }

    /**
     * Handle Escape key - closes modals/menus, cancels drag, or clears selection.
     */
    handleEscape() {
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
            this.structure.clearSelection();
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedNode) {
            // Close popup if it's showing a weight attached to this node
            if (this.menus.isWeightPopupOpen() && this.menus.popupWeight?.isAttachedTo(selectedNode)) {
                this.closeAllMenus();
            }
            this.structure.removeNode(selectedNode);
            this.structure.clearSelection();
            this.ui.updateSelection({});
            this.updateStats();
        } else if (selectedSegment) {
            // Close popup if it's showing a weight attached to this segment
            if (this.menus.isWeightPopupOpen() && this.menus.popupWeight?.isAttachedTo(selectedSegment)) {
                this.closeAllMenus();
            }
            this.structure.removeSegment(selectedSegment);
            this.structure.clearSelection();
            this.ui.updateSelection({});
            this.updateStats();
        }
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

            // Clamp first, then snap, then re-clamp (ensures final position is on-grid AND in-bounds)
            let pos = clampToCanvas(x, y, bounds, Node.radius);
            if (this.ui.snapToGrid) {
                pos = snapToGrid(pos.x, pos.y, Renderer.GRID_SIZE);
                pos = clampToCanvas(pos.x, pos.y, bounds, Node.radius);
            }

            const newNode = this.structure.addNode(pos.x, pos.y);
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
