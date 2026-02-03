/**
 * Input Controller - Handles all input events (mouse, touch, keyboard)
 * Converts coordinates and delegates to callbacks for high-level actions.
 */

import { DragController } from './drag-controller.js';

export class InputController {
    /**
     * @param {HTMLCanvasElement} canvas - The canvas element to bind events to
     * @param {Object} options - Callback options
     * @param {Function} options.isSimulating - Returns true if simulation is running
     * @param {Function} options.findNodeAt - (x, y) => Node|null
     * @param {Function} options.findElementAt - (x, y) => {type, element}|null
     * @param {Function} options.getDrag - () => DragController
     * @param {Function} options.getHover - () => HoverController
     * @param {Function} [options.getViewport] - () => ViewportController|null
     * @param {Function} [options.getGroundScreenY] - () => number - Screen Y of ground line (for Y-up coords)
     * @param {Function} [options.getSelectionBox] - () => SelectionBoxController|null
     * @param {Function} [options.getClipboard] - () => ClipboardController|null
     * @param {Function} options.onMousePosChange - (x, y) => void
     * @param {Function} options.onClick - (x, y) => void
     * @param {Function} [options.onShiftClick] - (x, y) => void - Called for shift+click
     * @param {Function} options.onRightClick - (e, x, y) => void
     * @param {Function} options.onEscape - () => void
     * @param {Function} options.onDelete - () => void
     * @param {Function} [options.onCopy] - () => void - Called for Ctrl+C
     * @param {Function} [options.onPaste] - (x, y) => void - Called for Ctrl+V with current mouse pos
     * @param {Function} options.onWindowResize - () => void
     */
    constructor(canvas, options) {
        this.canvas = canvas;
        this.options = options;

        // Touch state
        this.touchStartPos = null;

        // Modifier key state
        this.shiftHeld = false;

        // Pending context menu (for macOS where contextmenu fires on mousedown)
        this.pendingContextMenu = null;

        this.bindEvents();
    }

    /**
     * Bind all input events to the canvas and window.
     */
    bindEvents() {
        // Mouse events on canvas
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
        this.canvas.addEventListener('click', (e) => this.onClick(e));
        this.canvas.addEventListener('contextmenu', (e) => this.onRightClick(e));

        // Wheel event for zoom
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });

        // Keyboard events (including shift key tracking)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') this.shiftHeld = true;
            this.onKeyDown(e);
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') this.shiftHeld = false;
        });

        // Window-level mouse events for tracking outside canvas
        window.addEventListener('mousemove', (e) => this.onWindowMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onWindowMouseUp(e));

        // Pointer lock change (handles ESC key during pan)
        if (typeof document !== 'undefined') {
            document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
        }

        // Window resize
        window.addEventListener('resize', () => this.options.onWindowResize?.());
    }

    /**
     * Handle pointer lock state changes (e.g., ESC pressed during pan).
     */
    onPointerLockChange() {
        // If pointer lock was released and we were panning, end the pan
        if (!document.pointerLockElement) {
            const viewport = this.options.getViewport?.();
            if (viewport?.isPanning) {
                viewport.endPan();
            }
        }
    }

    /**
     * Convert mouse event to canvas coordinates.
     */
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Convert touch to canvas coordinates.
     */
    getTouchPos(touch) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mouse handlers
    // ─────────────────────────────────────────────────────────────────────────

    onMouseDown(e) {
        const pos = this.getMousePos(e);

        // Right-click: start potential pan
        if (e.button === 2) {
            const viewport = this.options.getViewport?.();
            if (viewport) {
                viewport.beginPan(pos);
            }
            return;
        }

        if (this.options.isSimulating() || e.button !== 0) return;

        const clipboard = this.options.getClipboard?.();

        // Don't start drag/selection during paste preview
        if (clipboard?.isActive) {
            return;
        }

        const viewport = this.options.getViewport?.();
        const groundScreenY = this.options.getGroundScreenY?.() ?? 0;

        // Convert to world coordinates for node finding and drag
        const worldPos = viewport
            ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
            : pos;

        const node = this.options.findNodeAt(worldPos.x, worldPos.y);
        const drag = this.options.getDrag();
        const selectionBox = this.options.getSelectionBox?.();

        if (node && node.isEditable) {
            // Clicking on an editable node - start potential drag (in world coords)
            drag.beginPotentialDrag(node, worldPos);
        } else if (selectionBox && !node) {
            // Clicking on empty space - start potential selection box (in screen coords)
            selectionBox.beginSelection(pos, this.shiftHeld);
        }
    }

    onMouseUp(e) {
        // Right-click release: end pan (if panning) or show context menu
        if (e.button === 2) {
            const viewport = this.options.getViewport?.();
            const pendingPos = this.pendingContextMenu;
            this.pendingContextMenu = null;

            if (viewport?.isTracking) {
                const { wasPanning } = viewport.endPan();

                // Release pointer lock if it was acquired
                if (document.pointerLockElement === this.canvas) {
                    document.exitPointerLock?.();
                }

                if (wasPanning) {
                    // Was panning, don't show context menu
                    return;
                }
            }

            // If we deferred a context menu (macOS fires on mousedown), show it now
            if (pendingPos) {
                this.showContextMenu(e, pendingPos);
            }
            // On Windows/Linux, contextmenu fires after mouseup, so it handles itself
            return;
        }

        if (e.button !== 0) return;

        const drag = this.options.getDrag();
        const selectionBox = this.options.getSelectionBox?.();

        // End drag first (if active)
        drag.endDrag();

        // End selection box (if tracking)
        if (selectionBox?.isTracking) {
            selectionBox.endSelection();
        }
    }

    onMouseMove(e) {
        const drag = this.options.getDrag();
        const hover = this.options.getHover();
        const viewport = this.options.getViewport?.();
        const selectionBox = this.options.getSelectionBox?.();
        const clipboard = this.options.getClipboard?.();

        // Handle viewport panning with pointer lock (highest priority)
        if (viewport?.isTracking) {
            // When pointer is locked, use movement deltas directly
            if (document.pointerLockElement === this.canvas) {
                viewport.applyPanDelta(e.movementX, e.movementY);
                return;
            }

            // Not yet locked - use absolute position and check if we should lock
            const pos = this.getMousePos(e);
            this.options.onMousePosChange(pos.x, pos.y);
            const result = viewport.updatePan(pos);
            if (result.isPanning) {
                // Request pointer lock for infinite panning
                if (result.shouldLock && !document.pointerLockElement) {
                    this.canvas.requestPointerLock?.();
                }
                this.canvas.style.cursor = result.cursor;
                return;
            }
        }

        const pos = this.getMousePos(e);
        this.options.onMousePosChange(pos.x, pos.y);

        // Handle paste preview (follows cursor in world space)
        if (!this.options.isSimulating() && clipboard?.isActive) {
            // Convert to world coordinates for paste positioning
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            clipboard.updatePreview(worldPos);
            this.canvas.style.cursor = 'copy';
            return;
        }

        // Handle node dragging (takes priority) - use world coords
        if (!this.options.isSimulating() && drag.isTracking) {
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            const result = drag.updateDrag(worldPos);
            if (result.isDragging) {
                this.canvas.style.cursor = 'grabbing';
                return;
            }
        }

        // Handle selection box
        if (!this.options.isSimulating() && selectionBox?.isTracking) {
            const result = selectionBox.updateSelection(pos);
            if (result.isSelecting) {
                this.canvas.style.cursor = 'crosshair';
                return;
            }
        }

        // Update hover states and cursor (use world coords for element detection)
        if (!this.options.isSimulating()) {
            hover.clear();
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            hover.update(this.options.findElementAt(worldPos.x, worldPos.y));
        } else {
            this.canvas.style.cursor = 'default';
        }
    }

    onClick(e) {
        if (this.options.isSimulating()) return;

        const drag = this.options.getDrag();
        const selectionBox = this.options.getSelectionBox?.();
        const clipboard = this.options.getClipboard?.();

        // Commit paste if in paste preview mode
        if (clipboard?.isActive) {
            clipboard.commitPaste();
            return;
        }

        // Skip click if we just finished dragging
        if (drag.shouldSuppressClick) {
            drag.clearClickSuppression();
            return;
        }

        // Skip click if we just finished selection box
        if (selectionBox?.shouldSuppressClick) {
            selectionBox.clearClickSuppression();
            return;
        }

        const pos = this.getMousePos(e);

        // Check for shift+click (additive selection)
        if (this.shiftHeld && this.options.onShiftClick) {
            this.options.onShiftClick(pos.x, pos.y);
        } else {
            this.options.onClick(pos.x, pos.y);
        }
    }

    onRightClick(e) {
        // Always prevent default browser context menu
        e.preventDefault();

        const viewport = this.options.getViewport?.();

        // If tracking potential pan, defer context menu decision to mouseup
        // (On macOS, contextmenu fires on mousedown before we know if it's a pan)
        if (viewport?.isTracking) {
            this.pendingContextMenu = this.getMousePos(e);
            return;
        }

        // Check if we should suppress context menu (after panning)
        if (viewport?.shouldSuppressContextMenu) {
            viewport.clearContextMenuSuppression();
            return;
        }

        this.showContextMenu(e);
    }

    /**
     * Actually show the context menu (extracted for reuse).
     * @param {MouseEvent} e - The original event (for positioning)
     * @param {{ x: number, y: number }} [overridePos] - Optional override position
     */
    showContextMenu(e, overridePos = null) {
        if (this.options.isSimulating()) return;

        // Cancel paste preview if active
        const clipboard = this.options.getClipboard?.();
        if (clipboard?.isActive) {
            clipboard.cancelPaste();
            return;
        }

        // Cancel selection box if active
        const selectionBox = this.options.getSelectionBox?.();
        if (selectionBox?.isTracking) {
            selectionBox.cancelSelection();
        }

        const pos = overridePos || this.getMousePos(e);
        this.options.onRightClick(e, pos.x, pos.y);
    }

    onMouseLeave(e) {
        // Selection box continues outside canvas - handled by window events
        // Node dragging also continues outside canvas
    }

    /**
     * Handle mouse wheel for zooming.
     */
    onWheel(e) {
        e.preventDefault();

        const viewport = this.options.getViewport?.();
        if (!viewport) return;

        const pos = this.getMousePos(e);
        // Scroll down = zoom out, scroll up = zoom in
        const delta = e.deltaY > 0 ? -1 : 1;

        const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
        viewport.zoomAt(delta, pos.x, pos.y, groundScreenY);
    }

    /**
     * Handle mouse movement outside the canvas.
     * Continues selection box, drag, and pan operations.
     */
    onWindowMouseMove(e) {
        // Skip if event originated from canvas (handled by onMouseMove)
        if (e.target === this.canvas) return;

        const drag = this.options.getDrag();
        const viewport = this.options.getViewport?.();
        const selectionBox = this.options.getSelectionBox?.();

        // Only process if we're actively tracking something
        if (!drag.isTracking && !selectionBox?.isTracking && !viewport?.isTracking) return;

        const pos = this.getMousePos(e);

        // Update viewport pan
        if (viewport?.isTracking) {
            const result = viewport.updatePan(pos);
            if (result.isPanning) {
                this.canvas.style.cursor = result.cursor;
                return;
            }
        }

        // Update selection box position
        if (selectionBox?.isTracking) {
            const result = selectionBox.updateSelection(pos);
            if (result.isSelecting) {
                this.canvas.style.cursor = 'crosshair';
            }
        }

        // Update drag position (use world coords)
        if (drag.isTracking) {
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            const result = drag.updateDrag(worldPos);
            if (result.isDragging) {
                this.canvas.style.cursor = 'grabbing';
            }
        }
    }

    /**
     * Handle mouse up outside the canvas.
     * Completes selection box, drag, and pan operations.
     */
    onWindowMouseUp(e) {
        // Skip if event originated from canvas (handled by onMouseUp)
        if (e.target === this.canvas) return;

        // Handle right-click release for pan
        if (e.button === 2) {
            this.pendingContextMenu = null;  // Clear any deferred context menu
            const viewport = this.options.getViewport?.();
            if (viewport?.isTracking) {
                viewport.endPan();
            }
            return;
        }

        if (e.button !== 0) return;

        const drag = this.options.getDrag();
        const selectionBox = this.options.getSelectionBox?.();

        // End drag if active
        if (drag.isTracking) {
            drag.endDrag();
        }

        // End selection box if tracking
        if (selectionBox?.isTracking) {
            selectionBox.endSelection();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Touch handlers
    // ─────────────────────────────────────────────────────────────────────────

    onTouchStart(e) {
        if (e.touches.length !== 1) return;

        e.preventDefault();
        const pos = this.getTouchPos(e.touches[0]);
        this.options.onMousePosChange(pos.x, pos.y);
        this.touchStartPos = pos;

        // Check if touching a node for potential drag
        if (!this.options.isSimulating()) {
            const viewport = this.options.getViewport?.();
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            const node = this.options.findNodeAt(worldPos.x, worldPos.y);
            if (node) {
                this.options.getDrag().beginPotentialDrag(node, worldPos);
            }
        }
    }

    onTouchMove(e) {
        if (e.touches.length !== 1) return;

        e.preventDefault();
        const pos = this.getTouchPos(e.touches[0]);
        this.options.onMousePosChange(pos.x, pos.y);

        const drag = this.options.getDrag();
        const hover = this.options.getHover();
        const viewport = this.options.getViewport?.();

        // Handle dragging (use world coords)
        if (!this.options.isSimulating() && drag.isTracking) {
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            const result = drag.updateDrag(worldPos);
            if (result.isDragging) {
                return;
            }
        }

        // Update hover states for visual feedback
        if (!this.options.isSimulating()) {
            hover.clear();
            const groundScreenY = this.options.getGroundScreenY?.() ?? 0;
            const worldPos = viewport
                ? viewport.screenToWorld(pos.x, pos.y, groundScreenY)
                : pos;
            hover.update(this.options.findElementAt(worldPos.x, worldPos.y));
        }
    }

    onTouchEnd(e) {
        if (!this.touchStartPos || e.changedTouches.length !== 1) return;

        e.preventDefault();
        const pos = this.getTouchPos(e.changedTouches[0]);
        const drag = this.options.getDrag();

        const { wasDrag } = drag.endDrag();

        if (!wasDrag) {
            // Only trigger click if finger didn't move much (tap vs drag)
            const dx = pos.x - this.touchStartPos.x;
            const dy = pos.y - this.touchStartPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < DragController.TAP_THRESHOLD) {
                // Simulate click at touch position
                drag.clearClickSuppression();
                this.options.onClick(pos.x, pos.y);
            }
        }

        this.touchStartPos = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Keyboard handler
    // ─────────────────────────────────────────────────────────────────────────

    onKeyDown(e) {
        // Don't handle keyboard shortcuts if typing in input elements
        const tagName = e.target.tagName;
        const isTyping = tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA';

        if (e.key === 'Escape') {
            // Cancel viewport pan if active
            const viewport = this.options.getViewport?.();
            if (viewport?.isActive) {
                viewport.cancelPan();
                return;
            }

            // Cancel paste preview if active
            const clipboard = this.options.getClipboard?.();
            if (clipboard?.isActive) {
                clipboard.cancelPaste();
                return;
            }

            // Cancel selection box if active
            const selectionBox = this.options.getSelectionBox?.();
            if (selectionBox?.isTracking) {
                selectionBox.cancelSelection();
            }

            this.options.onEscape();
            return;
        }

        // Copy: Ctrl+C or Cmd+C
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !isTyping) {
            if (!this.options.isSimulating()) {
                this.options.onCopy?.();
            }
            return;
        }

        // Paste: Ctrl+V or Cmd+V
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !isTyping) {
            if (!this.options.isSimulating()) {
                this.options.onPaste?.();
            }
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && !this.options.isSimulating()) {
            if (isTyping) return;

            // Don't delete during drag or paste
            if (this.options.getDrag().isActive) return;
            if (this.options.getClipboard?.()?.isActive) return;

            e.preventDefault();
            this.options.onDelete();
        }
    }

    /**
     * Check if shift key is currently held.
     * @returns {boolean}
     */
    get isShiftHeld() {
        return this.shiftHeld;
    }
}
