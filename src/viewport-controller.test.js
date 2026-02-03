import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewportController } from './viewport-controller.js';

describe('ViewportController', () => {
    let viewport;
    let onViewportChange;
    // Standard test groundScreenY (simulating a canvas with ground at Y=600 in screen coords)
    const GROUND_SCREEN_Y = 600;

    beforeEach(() => {
        onViewportChange = vi.fn();
        viewport = new ViewportController({ onViewportChange });
    });

    describe('Initial state', () => {
        it('should start at zoom=1, pan=0,0', () => {
            expect(viewport.zoom).toBe(1.0);
            expect(viewport.panX).toBe(0);
            expect(viewport.panY).toBe(0);
        });

        it('should report isDefault as true initially', () => {
            expect(viewport.isDefault).toBe(true);
        });

        it('should not be tracking or panning initially', () => {
            expect(viewport.isTracking).toBe(false);
            expect(viewport.isActive).toBe(false);
        });
    });

    describe('screenToWorld / worldToScreen (Y-up coords)', () => {
        it('should convert screen to world with Y-flip at zoom=1, pan=0', () => {
            // Screen Y=200 with groundScreenY=600 → world Y = 600-200 = 400
            const world = viewport.screenToWorld(100, 200, GROUND_SCREEN_Y);
            expect(world.x).toBe(100);
            expect(world.y).toBe(400);  // 400 units above ground
        });

        it('should convert world to screen with Y-flip at zoom=1, pan=0', () => {
            // World Y=400 with groundScreenY=600 → screen Y = 600-400 = 200
            const screen = viewport.worldToScreen(100, 400, GROUND_SCREEN_Y);
            expect(screen.x).toBe(100);
            expect(screen.y).toBe(200);
        });

        it('should place ground (world Y=0) at screen Y=groundScreenY', () => {
            const world = viewport.screenToWorld(100, GROUND_SCREEN_Y, GROUND_SCREEN_Y);
            expect(world.y).toBe(0);  // Ground level

            const screen = viewport.worldToScreen(100, 0, GROUND_SCREEN_Y);
            expect(screen.y).toBe(GROUND_SCREEN_Y);  // At ground line
        });

        it('should scale correctly at zoom=2', () => {
            viewport.zoom = 2;

            // Screen 100 at zoom 2 = world 50 (for X)
            // Screen 200 from ground at 600, at zoom 2: world Y = (600-200)/2 = 200
            const world = viewport.screenToWorld(100, 200, GROUND_SCREEN_Y);
            expect(world.x).toBe(50);
            expect(world.y).toBe(200);

            // Round-trip back
            const screen = viewport.worldToScreen(50, 200, GROUND_SCREEN_Y);
            expect(screen.x).toBe(100);
            expect(screen.y).toBe(200);
        });

        it('should offset correctly with pan', () => {
            viewport.panX = 50;
            viewport.panY = 100;

            // X: screen 100 / 1 + panX 50 = world 150
            // Y: (600-200) / 1 + panY 100 = world 500
            const world = viewport.screenToWorld(100, 200, GROUND_SCREEN_Y);
            expect(world.x).toBe(150);
            expect(world.y).toBe(500);

            // Round-trip back
            const screen = viewport.worldToScreen(150, 500, GROUND_SCREEN_Y);
            expect(screen.x).toBe(100);
            expect(screen.y).toBe(200);
        });

        it('should handle combined zoom and pan', () => {
            viewport.zoom = 2;
            viewport.panX = 50;
            viewport.panY = 100;

            // X: (100/2) + 50 = 100
            // Y: (600-200)/2 + 100 = 300
            const world = viewport.screenToWorld(100, 200, GROUND_SCREEN_Y);
            expect(world.x).toBe(100);
            expect(world.y).toBe(300);

            // Round-trip back
            const screen = viewport.worldToScreen(100, 300, GROUND_SCREEN_Y);
            expect(screen.x).toBe(100);
            expect(screen.y).toBe(200);
        });

        it('should round-trip correctly', () => {
            viewport.zoom = 1.5;
            viewport.panX = 75;
            viewport.panY = 120;

            const originalScreen = { x: 300, y: 450 };
            const world = viewport.screenToWorld(originalScreen.x, originalScreen.y, GROUND_SCREEN_Y);
            const backToScreen = viewport.worldToScreen(world.x, world.y, GROUND_SCREEN_Y);

            expect(backToScreen.x).toBeCloseTo(originalScreen.x);
            expect(backToScreen.y).toBeCloseTo(originalScreen.y);
        });
    });

    describe('Distance conversion', () => {
        it('should scale world distance to screen', () => {
            viewport.zoom = 2;
            expect(viewport.worldDistanceToScreen(50)).toBe(100);
        });

        it('should scale screen distance to world', () => {
            viewport.zoom = 2;
            expect(viewport.screenDistanceToWorld(100)).toBe(50);
        });
    });

    describe('zoomAt', () => {
        it('should increase zoom on positive delta', () => {
            viewport.zoomAt(1, 400, 300, GROUND_SCREEN_Y);
            expect(viewport.zoom).toBe(1.1);
            expect(onViewportChange).toHaveBeenCalled();
        });

        it('should decrease zoom on negative delta', () => {
            viewport.zoomAt(-1, 400, 300, GROUND_SCREEN_Y);
            expect(viewport.zoom).toBe(0.9);
        });

        it('should clamp to MIN_ZOOM', () => {
            viewport.zoom = ViewportController.MIN_ZOOM;
            viewport.zoomAt(-1, 400, 300, GROUND_SCREEN_Y);
            expect(viewport.zoom).toBe(ViewportController.MIN_ZOOM);
        });

        it('should clamp to MAX_ZOOM', () => {
            viewport.zoom = ViewportController.MAX_ZOOM;
            viewport.zoomAt(1, 400, 300, GROUND_SCREEN_Y);
            expect(viewport.zoom).toBe(ViewportController.MAX_ZOOM);
        });

        it('should keep world point under cursor fixed', () => {
            const screenPos = { x: 400, y: 300 };

            // Get world position before zoom
            const worldBefore = viewport.screenToWorld(screenPos.x, screenPos.y, GROUND_SCREEN_Y);

            // Zoom in
            viewport.zoomAt(1, screenPos.x, screenPos.y, GROUND_SCREEN_Y);

            // Get world position after zoom (at same screen pos)
            const worldAfter = viewport.screenToWorld(screenPos.x, screenPos.y, GROUND_SCREEN_Y);

            // World position should be the same
            expect(worldAfter.x).toBeCloseTo(worldBefore.x);
            expect(worldAfter.y).toBeCloseTo(worldBefore.y);
        });

        it('should not call callback if zoom unchanged', () => {
            viewport.zoom = ViewportController.MAX_ZOOM;
            viewport.zoomAt(1, 400, 300, GROUND_SCREEN_Y);
            expect(onViewportChange).not.toHaveBeenCalled();
        });

        it('should report isDefault as false after zoom', () => {
            viewport.zoomAt(1, 400, 300, GROUND_SCREEN_Y);
            expect(viewport.isDefault).toBe(false);
        });
    });

    describe('setZoom', () => {
        it('should set zoom directly', () => {
            viewport.setZoom(2);
            expect(viewport.zoom).toBe(2);
        });

        it('should clamp to valid range', () => {
            viewport.setZoom(10);
            expect(viewport.zoom).toBe(ViewportController.MAX_ZOOM);

            viewport.setZoom(0.1);
            expect(viewport.zoom).toBe(ViewportController.MIN_ZOOM);
        });

        it('should zoom toward point when provided', () => {
            const screenPos = { x: 400, y: 300 };
            const worldBefore = viewport.screenToWorld(screenPos.x, screenPos.y, GROUND_SCREEN_Y);

            viewport.setZoom(2, screenPos.x, screenPos.y, GROUND_SCREEN_Y);

            const worldAfter = viewport.screenToWorld(screenPos.x, screenPos.y, GROUND_SCREEN_Y);
            expect(worldAfter.x).toBeCloseTo(worldBefore.x);
            expect(worldAfter.y).toBeCloseTo(worldBefore.y);
        });
    });

    describe('Pan lifecycle', () => {
        it('should track after beginPan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            expect(viewport.isTracking).toBe(true);
            expect(viewport.isActive).toBe(false);
        });

        it('should not pan below threshold', () => {
            viewport.beginPan({ x: 100, y: 100 });
            const result = viewport.updatePan({ x: 102, y: 102 });

            expect(result.isPanning).toBe(false);
            expect(viewport.panX).toBe(0);
            expect(viewport.panY).toBe(0);
        });

        it('should start panning above threshold', () => {
            viewport.beginPan({ x: 100, y: 100 });
            const result = viewport.updatePan({ x: 110, y: 100 });

            expect(result.isPanning).toBe(true);
            expect(viewport.isActive).toBe(true);
            expect(viewport.panX).toBe(-10);  // Dragged right, world shifts left
        });

        it('should return grab cursor when tracking but not panning', () => {
            viewport.beginPan({ x: 100, y: 100 });
            const result = viewport.updatePan({ x: 102, y: 102 });
            expect(result.cursor).toBe('grab');
        });

        it('should return grabbing cursor when actively panning', () => {
            viewport.beginPan({ x: 100, y: 100 });
            const result = viewport.updatePan({ x: 150, y: 150 });
            expect(result.cursor).toBe('grabbing');
        });

        it('should continue panning once threshold passed', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 110, y: 100 });  // Past threshold

            // Small movement should still pan
            const result = viewport.updatePan({ x: 111, y: 100 });
            expect(result.isPanning).toBe(true);
        });

        it('should call onViewportChange during pan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 150, y: 150 });
            expect(onViewportChange).toHaveBeenCalled();
        });

        it('should return wasPanning=true on endPan after pan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 150, y: 150 });
            const result = viewport.endPan();

            expect(result.wasPanning).toBe(true);
            expect(viewport.isTracking).toBe(false);
            expect(viewport.isActive).toBe(false);
        });

        it('should return wasPanning=false on endPan without pan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            const result = viewport.endPan();

            expect(result.wasPanning).toBe(false);
        });

        it('should suppress context menu after pan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 150, y: 150 });
            viewport.endPan();

            expect(viewport.shouldSuppressContextMenu).toBe(true);
        });

        it('should not suppress context menu without pan', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.endPan();

            expect(viewport.shouldSuppressContextMenu).toBe(false);
        });

        it('should clear suppression flag', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 150, y: 150 });
            viewport.endPan();

            viewport.clearContextMenuSuppression();
            expect(viewport.shouldSuppressContextMenu).toBe(false);
        });
    });

    describe('Pan with zoom', () => {
        it('should pan correctly when zoomed in', () => {
            viewport.zoom = 2;
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 120, y: 100 });

            // At zoom 2, 20px screen movement = 10px world shift
            expect(viewport.panX).toBe(-10);
        });

        it('should pan correctly when zoomed out', () => {
            viewport.zoom = 0.5;
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 120, y: 100 });

            // At zoom 0.5, 20px screen movement = 40px world shift
            expect(viewport.panX).toBe(-40);
        });
    });

    describe('cancelPan', () => {
        it('should restore original pan position', () => {
            viewport.panX = 50;
            viewport.panY = 50;

            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 200, y: 200 });

            expect(viewport.panX).not.toBe(50);

            viewport.cancelPan();

            expect(viewport.panX).toBe(50);
            expect(viewport.panY).toBe(50);
            expect(viewport.isTracking).toBe(false);
        });

        it('should call onViewportChange on cancel', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 200, y: 200 });
            onViewportChange.mockClear();

            viewport.cancelPan();
            expect(onViewportChange).toHaveBeenCalled();
        });

        it('should not suppress context menu after cancel', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 200, y: 200 });
            viewport.cancelPan();

            expect(viewport.shouldSuppressContextMenu).toBe(false);
        });
    });

    describe('getCursor', () => {
        it('should return null when idle', () => {
            expect(viewport.getCursor()).toBe(null);
        });

        it('should return grab when tracking', () => {
            viewport.beginPan({ x: 100, y: 100 });
            expect(viewport.getCursor()).toBe('grab');
        });

        it('should return grabbing when panning', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 200, y: 200 });
            expect(viewport.getCursor()).toBe('grabbing');
        });
    });

    describe('reset', () => {
        it('should restore default state', () => {
            viewport.zoom = 2;
            viewport.panX = 100;
            viewport.panY = 200;

            viewport.reset();

            expect(viewport.zoom).toBe(1.0);
            expect(viewport.panX).toBe(0);
            expect(viewport.panY).toBe(0);
            expect(viewport.isDefault).toBe(true);
        });

        it('should clear pan tracking state', () => {
            viewport.beginPan({ x: 100, y: 100 });
            viewport.updatePan({ x: 200, y: 200 });

            viewport.reset();

            expect(viewport.isTracking).toBe(false);
            expect(viewport.isActive).toBe(false);
            expect(viewport.shouldSuppressContextMenu).toBe(false);
        });

        it('should call onViewportChange', () => {
            viewport.reset();
            expect(onViewportChange).toHaveBeenCalled();
        });
    });

    describe('getState', () => {
        it('should return current viewport state', () => {
            viewport.zoom = 1.5;
            viewport.panX = 100;
            viewport.panY = 200;

            const state = viewport.getState();

            expect(state.zoom).toBe(1.5);
            expect(state.panX).toBe(100);
            expect(state.panY).toBe(200);
        });
    });

    describe('updatePan without beginPan', () => {
        it('should return not panning', () => {
            const result = viewport.updatePan({ x: 100, y: 100 });
            expect(result.isPanning).toBe(false);
            expect(result.cursor).toBe('default');
        });
    });
});
