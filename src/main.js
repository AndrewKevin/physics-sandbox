/**
 * Physics Sandbox - Main Entry Point
 * Interactive physics simulation for exploring load and stress
 */

import Matter from 'matter-js';
import VanillaContextMenu from 'vanilla-context-menu';
import { StructureManager, Node, MATERIALS } from './structure.js';
import { Renderer } from './renderer.js';
import { UIController } from './ui.js';

class PhysicsSandbox {
    // Constants
    static GROUND_OFFSET = 60;
    static TOUCH_TAP_THRESHOLD = 15;
    static GROUND_WIDTH_MULTIPLIER = 2;

    constructor() {
        // Core state
        this.mode = 'connect';
        this.material = 'beam';
        this.isSimulating = false;
        this.groundY = 0;

        // Mouse state
        this.mouseX = 0;
        this.mouseY = 0;
        this.connectStartNode = null;
        this.hoveredNode = null;
        this.hoveredSegment = null;

        // Physics references
        this.groundBody = null;
        this.animationId = null;

        // Context menu state
        this.contextMenuNode = null;

        // Initialise components
        console.log('[PhysicsSandbox] Starting initialization...');
        this.initCanvas();
        console.log('[PhysicsSandbox] Canvas initialized');
        this.initStructure();
        console.log('[PhysicsSandbox] Structure initialized');
        this.initPhysics();
        console.log('[PhysicsSandbox] Physics initialized');
        this.initUI();
        console.log('[PhysicsSandbox] UI initialized');
        this.initContextMenu();
        console.log('[PhysicsSandbox] Context menu initialized');
        this.initEvents();
        console.log('[PhysicsSandbox] Events initialized');

        // Start render loop
        this.animate();
        console.log('[PhysicsSandbox] Animation started - initialization complete');
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
            (mode) => this.setMode(mode),
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
        // Using vanilla-context-menu package for proper positioning
        new VanillaContextMenu({
            scope: this.canvas,
            customThemeClass: 'physics-context-menu',
            customClass: 'physics-context-menu',
            transitionDuration: 100,
            menuItems: [
                {
                    label: '⚓  Toggle Fixed Point',
                    callback: () => {
                        // Verify node still exists in structure before acting
                        if (this.contextMenuNode && this.structure.nodes.includes(this.contextMenuNode)) {
                            this.contextMenuNode.setFixed(!this.contextMenuNode.fixed);
                        }
                        this.contextMenuNode = null;
                    }
                },
                {
                    label: '✕  Delete Node',
                    callback: () => {
                        // Verify node still exists in structure before acting
                        if (this.contextMenuNode && this.structure.nodes.includes(this.contextMenuNode)) {
                            if (this.connectStartNode === this.contextMenuNode) {
                                this.connectStartNode = null;
                            }
                            this.structure.removeNode(this.contextMenuNode);
                            this.ui.updateSelection({});
                            this.updateStats();
                        }
                        this.contextMenuNode = null;
                    }
                }
            ],
            preventCloseOnClick: false
        });
    }

    initEvents() {
        // Mouse events on canvas
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

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

    onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.touches[0]);
            this.mouseX = pos.x;
            this.mouseY = pos.y;
            this.touchStartPos = pos;
        }
    }

    onTouchMove(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.touches[0]);
            this.mouseX = pos.x;
            this.mouseY = pos.y;

            // Update hover states for visual feedback
            if (!this.isSimulating) {
                // Clear previously hovered elements
                if (this.hoveredNode) {
                    this.hoveredNode.hovered = false;
                    this.hoveredNode = null;
                }
                if (this.hoveredSegment) {
                    this.hoveredSegment.hovered = false;
                    this.hoveredSegment = null;
                }

                const node = this.structure.findNodeAt(pos.x, pos.y);
                if (node) {
                    node.hovered = true;
                    this.hoveredNode = node;
                } else {
                    const segment = this.structure.findSegmentAt(pos.x, pos.y);
                    if (segment) {
                        segment.hovered = true;
                        this.hoveredSegment = segment;
                    }
                }
            }
        }
    }

    onTouchEnd(e) {
        if (this.touchStartPos && e.changedTouches.length === 1) {
            e.preventDefault();
            const pos = this.getTouchPos(e.changedTouches[0]);

            // Only trigger click if finger didn't move much (tap vs drag)
            const dx = pos.x - this.touchStartPos.x;
            const dy = pos.y - this.touchStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < PhysicsSandbox.TOUCH_TAP_THRESHOLD) {
                // Simulate click at touch position
                this.onClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
            }
        }
        this.touchStartPos = null;
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        // Update hover states and cursor
        if (!this.isSimulating) {
            // Clear previously hovered elements
            if (this.hoveredNode) {
                this.hoveredNode.hovered = false;
                this.hoveredNode = null;
            }
            if (this.hoveredSegment) {
                this.hoveredSegment.hovered = false;
                this.hoveredSegment = null;
            }

            // Check for hover
            const node = this.structure.findNodeAt(pos.x, pos.y);
            if (node) {
                node.hovered = true;
                this.hoveredNode = node;
                this.canvas.style.cursor = this.getCursorForMode(true);
            } else {
                const segment = this.structure.findSegmentAt(pos.x, pos.y);
                if (segment) {
                    segment.hovered = true;
                    this.hoveredSegment = segment;
                    this.canvas.style.cursor = this.getCursorForMode(true);
                } else {
                    this.canvas.style.cursor = this.getCursorForMode(false);
                }
            }
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    getCursorForMode(overElement) {
        if (overElement) {
            switch (this.mode) {
                case 'connect':
                    return 'crosshair';
                case 'select':
                    return 'pointer';
                case 'delete':
                    return 'not-allowed';
                default:
                    return 'crosshair';
            }
        } else {
            switch (this.mode) {
                case 'connect':
                    return 'crosshair';
                case 'select':
                    return 'default';
                case 'delete':
                    return 'default';
                default:
                    return 'crosshair';
            }
        }
    }

    onClick(e) {
        if (this.isSimulating) return;

        const pos = this.getMousePos(e);

        switch (this.mode) {
            case 'connect':
                this.handleConnect(pos.x, pos.y);
                break;
            case 'select':
                this.handleSelect(pos.x, pos.y);
                break;
            case 'delete':
                this.handleDelete(pos.x, pos.y);
                break;
        }

        this.updateStats();
    }

    onRightClick(e) {
        if (this.isSimulating) return;

        const pos = this.getMousePos(e);
        const node = this.structure.findNodeAt(pos.x, pos.y);

        if (node) {
            // Store node for context menu callbacks
            this.contextMenuNode = node;
            // Library handles showing the menu
        } else {
            // Cancel current action (no context menu for empty space)
            this.connectStartNode = null;
            this.structure.clearSelection();
            this.ui.updateSelection({});
        }
    }

    handleConnect(x, y) {
        // Clamp position above ground
        if (y > this.groundY - Node.radius) {
            y = this.groundY - Node.radius;
        }

        // Find existing node or create new one
        let node = this.structure.findNodeAt(x, y);
        if (!node) {
            node = this.structure.addNode(x, y);
        }

        if (!this.connectStartNode) {
            // First node selected
            this.connectStartNode = node;
            node.selected = true;
        } else if (this.connectStartNode !== node) {
            // Second node selected - create segment
            const segment = this.structure.addSegment(
                this.connectStartNode,
                node,
                this.material
            );

            if (segment) {
                this.structure.selectSegment(segment);
                this.ui.updateSelection({ segment });
            }

            // Clear start node selection visual
            this.connectStartNode.selected = false;
            this.connectStartNode = null;
        }
    }

    handleSelect(x, y) {
        // Try to select node first
        const node = this.structure.findNodeAt(x, y);
        if (node) {
            this.structure.selectNode(node);
            this.ui.updateSelection({ node });
            return;
        }

        // Try to select segment
        const segment = this.structure.findSegmentAt(x, y);
        if (segment) {
            this.structure.selectSegment(segment);
            this.ui.updateSelection({ segment });
            return;
        }

        // Clear selection
        this.structure.clearSelection();
        this.ui.updateSelection({});
    }

    handleDelete(x, y) {
        // Try to delete node first
        const node = this.structure.findNodeAt(x, y);
        if (node) {
            // Clear connectStartNode if we're deleting it
            if (this.connectStartNode === node) {
                this.connectStartNode = null;
            }
            this.structure.removeNode(node);
            this.ui.updateSelection({});
            return;
        }

        // Try to delete segment
        const segment = this.structure.findSegmentAt(x, y);
        if (segment) {
            this.structure.removeSegment(segment);
            this.ui.updateSelection({});
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.connectStartNode = null;

        // Clear selection when changing modes
        if (mode !== 'select') {
            this.structure.clearSelection();
            this.ui.updateSelection({});
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
        this.hoveredNode = null;
        this.hoveredSegment = null;

        // Clear existing physics world
        Matter.World.clear(this.engine.world);
        Matter.Engine.clear(this.engine);

        // Recreate engine to ensure clean state
        // Higher gravity for more visible stress
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 2 }
        });

        // Create ground
        this.groundBody = Matter.Bodies.rectangle(
            this.renderer.width / 2,
            this.groundY + PhysicsSandbox.GROUND_OFFSET / 2,
            this.renderer.width * PhysicsSandbox.GROUND_WIDTH_MULTIPLIER,  // Extra wide to handle resize
            PhysicsSandbox.GROUND_OFFSET,
            { isStatic: true, label: 'ground' }
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
                frictionAir: 0.01     // Slight air resistance for stability
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

        // Add physics update listener for tension-only/compression-only behaviour
        // Store reference so we can remove it later
        this.constraintModeHandler = () => {
            this.updateConstraintModes();
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

        // Clear physics world
        Matter.World.clear(this.engine.world);
        this.groundBody = null;
    }

    reset() {
        this.stopSimulation();
        this.structure.clear();
        this.connectStartNode = null;
        this.contextMenuNode = null;
        this.hoveredNode = null;
        this.hoveredSegment = null;
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
            mouseY: this.mouseY,
            mode: this.mode,
            connectStartNode: this.connectStartNode
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
