/**
 * ViewportController
 * Manages viewport state (zoom, pan) and coordinate transformations.
 * Follows the callback-based controller pattern for testability.
 *
 * Coordinate spaces:
 * - Screen: Canvas pixel coordinates (0,0 at top-left)
 * - World: Logical coordinates where structures exist (same convention, but offset/scaled)
 */

import { distance } from './position-utils.js';

export class ViewportController {
    // Zoom constraints
    static MIN_ZOOM = 0.25;
    static MAX_ZOOM = 4.0;
    static ZOOM_STEP = 0.1;

    // Pan detection threshold (distinguishes pan from context menu click)
    static PAN_THRESHOLD = 5;

    /**
     * @param {Object} options - Configuration options
     * @param {Function} [options.onViewportChange] - Called when zoom/pan changes
     */
    constructor(options = {}) {
        // Callbacks
        this.onViewportChange = options.onViewportChange ?? (() => {});

        // Viewport state
        this.zoom = 1.0;
        this.panX = 0;  // World offset (how much the view has shifted)
        this.panY = 0;

        // Pan tracking state
        this.isPanning = false;
        this.panStartMouse = null;
        this.panStartOffset = null;
        this.wasJustPanning = false;
    }

    /**
     * Clamp pan values (no-op - unlimited panning).
     */
    clampPan() {
        // No clamping - allow unlimited panning
    }

    // === Coordinate Transformation ===

    /**
     * Convert screen coordinates to world coordinates.
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     * @returns {{ x: number, y: number }} World position
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.zoom) + this.panX,
            y: (screenY / this.zoom) + this.panY
        };
    }

    /**
     * Convert world coordinates to screen coordinates.
     * @param {number} worldX - World X position
     * @param {number} worldY - World Y position
     * @returns {{ x: number, y: number }} Screen position
     */
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX - this.panX) * this.zoom,
            y: (worldY - this.panY) * this.zoom
        };
    }

    /**
     * Scale a distance from world space to screen space.
     * @param {number} worldDistance - Distance in world units
     * @returns {number} Distance in screen pixels
     */
    worldDistanceToScreen(worldDistance) {
        return worldDistance * this.zoom;
    }

    /**
     * Scale a distance from screen space to world space.
     * @param {number} screenDistance - Distance in screen pixels
     * @returns {number} Distance in world units
     */
    screenDistanceToWorld(screenDistance) {
        return screenDistance / this.zoom;
    }

    // === Zoom ===

    /**
     * Zoom toward a screen position (typically mouse cursor).
     * Adjusts pan so the world point under the cursor stays fixed.
     * @param {number} delta - Zoom delta (+1 to zoom in, -1 to zoom out)
     * @param {number} screenX - Screen X position to zoom toward
     * @param {number} screenY - Screen Y position to zoom toward
     */
    zoomAt(delta, screenX, screenY) {
        // Get world position before zoom
        const worldBefore = this.screenToWorld(screenX, screenY);

        // Apply zoom with clamping
        const newZoom = Math.max(
            ViewportController.MIN_ZOOM,
            Math.min(ViewportController.MAX_ZOOM, this.zoom + delta * ViewportController.ZOOM_STEP)
        );

        if (newZoom === this.zoom) return;

        this.zoom = newZoom;

        // Adjust pan so world position stays under cursor
        const worldAfter = this.screenToWorld(screenX, screenY);
        this.panX += worldBefore.x - worldAfter.x;
        this.panY += worldBefore.y - worldAfter.y;

        // Clamp to world bounds
        this.clampPan();

        this.onViewportChange();
    }

    /**
     * Set zoom level directly (for UI controls).
     * @param {number} newZoom - New zoom level
     * @param {number} [screenX] - Optional screen X to zoom toward
     * @param {number} [screenY] - Optional screen Y to zoom toward
     */
    setZoom(newZoom, screenX, screenY) {
        const clampedZoom = Math.max(
            ViewportController.MIN_ZOOM,
            Math.min(ViewportController.MAX_ZOOM, newZoom)
        );

        if (clampedZoom === this.zoom) return;

        if (screenX !== undefined && screenY !== undefined) {
            const worldBefore = this.screenToWorld(screenX, screenY);
            this.zoom = clampedZoom;
            const worldAfter = this.screenToWorld(screenX, screenY);
            this.panX += worldBefore.x - worldAfter.x;
            this.panY += worldBefore.y - worldAfter.y;
        } else {
            this.zoom = clampedZoom;
        }

        // Clamp to world bounds
        this.clampPan();

        this.onViewportChange();
    }

    // === Pan (right-click drag) ===

    /**
     * Begin tracking a potential pan operation.
     * Call this on right-click mousedown.
     * @param {{ x: number, y: number }} screenPos - Mouse position in screen coords
     */
    beginPan(screenPos) {
        this.panStartMouse = { x: screenPos.x, y: screenPos.y };
        this.panStartOffset = { x: this.panX, y: this.panY };
        this.isPanning = false;
        this.wasJustPanning = false;
    }

    /**
     * Update pan position during mousemove.
     * @param {{ x: number, y: number }} screenPos - Current mouse position
     * @returns {{ isPanning: boolean, cursor: string }} Pan state and recommended cursor
     */
    updatePan(screenPos) {
        if (!this.panStartMouse) {
            return { isPanning: false, cursor: 'default' };
        }

        const dist = distance(screenPos, this.panStartMouse);

        if (dist > ViewportController.PAN_THRESHOLD || this.isPanning) {
            this.isPanning = true;

            // Pan is inverse: dragging right moves viewport left (world shifts right)
            const dx = screenPos.x - this.panStartMouse.x;
            const dy = screenPos.y - this.panStartMouse.y;

            this.panX = this.panStartOffset.x - (dx / this.zoom);
            this.panY = this.panStartOffset.y - (dy / this.zoom);

            // Clamp to world bounds
            this.clampPan();

            this.onViewportChange();
            return { isPanning: true, cursor: 'grabbing' };
        }

        return { isPanning: false, cursor: 'grab' };
    }

    /**
     * End the pan operation on mouseup.
     * @returns {{ wasPanning: boolean }} Whether a pan actually occurred
     */
    endPan() {
        const wasPanning = this.isPanning;

        this.panStartMouse = null;
        this.panStartOffset = null;
        this.isPanning = false;
        this.wasJustPanning = wasPanning;

        return { wasPanning };
    }

    /**
     * Cancel pan and restore original position.
     * Call this on ESC key during pan.
     */
    cancelPan() {
        if (this.isPanning && this.panStartOffset) {
            this.panX = this.panStartOffset.x;
            this.panY = this.panStartOffset.y;
            this.onViewportChange();
        }

        this.panStartMouse = null;
        this.panStartOffset = null;
        this.isPanning = false;
        this.wasJustPanning = false;
    }

    // === State Queries ===

    /**
     * Check if currently tracking a potential pan (right-click held).
     * @returns {boolean}
     */
    get isTracking() {
        return this.panStartMouse !== null;
    }

    /**
     * Check if actively panning (moved past threshold).
     * @returns {boolean}
     */
    get isActive() {
        return this.isPanning;
    }

    /**
     * Check if a pan just ended (should suppress context menu).
     * @returns {boolean}
     */
    get shouldSuppressContextMenu() {
        return this.wasJustPanning;
    }

    /**
     * Clear the context menu suppression flag.
     * Call this after handling a suppressed context menu.
     */
    clearContextMenuSuppression() {
        this.wasJustPanning = false;
    }

    /**
     * Get recommended cursor based on current state.
     * @returns {string} CSS cursor value
     */
    getCursor() {
        if (this.isPanning) return 'grabbing';
        if (this.isTracking) return 'grab';
        return null;  // Let other controllers decide
    }

    /**
     * Check if viewport is at default state (no zoom, no pan).
     * @returns {boolean}
     */
    get isDefault() {
        return this.zoom === 1.0 && this.panX === 0 && this.panY === 0;
    }

    /**
     * Reset viewport to default state (zoom=1, pan=0,0).
     */
    reset() {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStartMouse = null;
        this.panStartOffset = null;
        this.wasJustPanning = false;
        this.onViewportChange();
    }

    /**
     * Get current viewport state for rendering.
     * @returns {{ zoom: number, panX: number, panY: number }}
     */
    getState() {
        return {
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY
        };
    }
}
