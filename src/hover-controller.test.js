import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoverController } from './hover-controller.js';

/**
 * Intent-focused tests describing user experience
 */
describe('HoverController - User Intent', () => {
    let controller;
    let mockCanvas;

    beforeEach(() => {
        mockCanvas = { style: { cursor: '' } };
        controller = new HoverController(mockCanvas);
    });

    describe('User moves mouse over a node', () => {
        it('should show grab cursor indicating node is draggable', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            expect(mockCanvas.style.cursor).toBe('grab');
        });

        it('should visually highlight the node', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            expect(node.hovered).toBe(true);
        });
    });

    describe('User moves mouse over a segment', () => {
        it('should show pointer cursor indicating segment is clickable', () => {
            const segment = { hovered: false };
            controller.update({ type: 'segment', element: segment });

            expect(mockCanvas.style.cursor).toBe('pointer');
        });
    });

    describe('User moves mouse over a weight', () => {
        it('should show pointer cursor for weight interaction', () => {
            const weight = { hovered: false };
            controller.update({ type: 'weight', element: weight });

            expect(mockCanvas.style.cursor).toBe('pointer');
        });
    });

    describe('User moves mouse from one element to another', () => {
        it('should un-highlight the previous element', () => {
            const node1 = { hovered: false };
            const node2 = { hovered: false };

            controller.update({ type: 'node', element: node1 });
            expect(node1.hovered).toBe(true);

            controller.update({ type: 'node', element: node2 });
            expect(node1.hovered).toBe(false);
            expect(node2.hovered).toBe(true);
        });
    });

    describe('User moves mouse to empty space', () => {
        it('should reset cursor to default', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });
            controller.update(null);

            expect(mockCanvas.style.cursor).toBe('default');
        });

        it('should un-highlight any previously hovered element', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });
            controller.update(null);

            expect(node.hovered).toBe(false);
        });
    });

    describe('Priority order when elements overlap', () => {
        it('should track weight when hovering weight (smallest hit area gets priority)', () => {
            const weight = { hovered: false };
            controller.update({ type: 'weight', element: weight });

            expect(controller.hoveredWeight).toBe(weight);
            expect(controller.hoveredNode).toBe(null);
        });
    });
});

describe('HoverController', () => {
    let controller;
    let mockCanvas;
    let onHoverChange;

    beforeEach(() => {
        mockCanvas = { style: { cursor: '' } };
        onHoverChange = vi.fn();
        controller = new HoverController(mockCanvas, { onHoverChange });
    });

    describe('initial state', () => {
        it('should have no hovered elements', () => {
            expect(controller.hasHover).toBe(false);
            expect(controller.current).toBe(null);
        });

        it('should have null for all hover properties', () => {
            expect(controller.hoveredNode).toBe(null);
            expect(controller.hoveredSegment).toBe(null);
            expect(controller.hoveredWeight).toBe(null);
        });
    });

    describe('update', () => {
        it('should track hovered node', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            expect(controller.hoveredNode).toBe(node);
            expect(controller.hasHover).toBe(true);
        });

        it('should track hovered segment', () => {
            const segment = { hovered: false };
            controller.update({ type: 'segment', element: segment });

            expect(controller.hoveredSegment).toBe(segment);
        });

        it('should track hovered weight', () => {
            const weight = { hovered: false };
            controller.update({ type: 'weight', element: weight });

            expect(controller.hoveredWeight).toBe(weight);
        });

        it('should call onHoverChange callback', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            expect(onHoverChange).toHaveBeenCalledWith(node, 'node');
        });

        it('should not call onHoverChange when update receives null (unhover is silent)', () => {
            // onHoverChange is intentionally only called when hovering, not when unhovering
            controller.update(null);

            expect(onHoverChange).not.toHaveBeenCalled();
        });
    });

    describe('clear', () => {
        it('should clear all hover states', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            controller.clear();

            expect(controller.hoveredNode).toBe(null);
            expect(node.hovered).toBe(false);
        });

        it('should handle clearing when nothing is hovered', () => {
            // Should not throw
            expect(() => controller.clear()).not.toThrow();
        });
    });

    describe('setCursor', () => {
        it('should map cursor names to CSS values', () => {
            controller.setCursor('node');
            expect(mockCanvas.style.cursor).toBe('grab');

            controller.setCursor('nodeDragging');
            expect(mockCanvas.style.cursor).toBe('grabbing');

            controller.setCursor('segment');
            expect(mockCanvas.style.cursor).toBe('pointer');

            controller.setCursor('default');
            expect(mockCanvas.style.cursor).toBe('default');
        });

        it('should pass through unknown cursor values', () => {
            controller.setCursor('crosshair');
            expect(mockCanvas.style.cursor).toBe('crosshair');
        });
    });

    describe('current getter', () => {
        it('should return weight with highest priority', () => {
            controller.hoveredWeight = { id: 'weight' };
            controller.hoveredNode = { id: 'node' };

            const current = controller.current;
            expect(current.type).toBe('weight');
        });

        it('should return node over segment', () => {
            controller.hoveredNode = { id: 'node' };
            controller.hoveredSegment = { id: 'segment' };

            const current = controller.current;
            expect(current.type).toBe('node');
        });

        it('should return segment if nothing else hovered', () => {
            controller.hoveredSegment = { id: 'segment' };

            const current = controller.current;
            expect(current.type).toBe('segment');
        });
    });

    describe('reset', () => {
        it('should clear all state', () => {
            const node = { hovered: false };
            controller.update({ type: 'node', element: node });

            controller.reset();

            expect(controller.hasHover).toBe(false);
            expect(node.hovered).toBe(false);
        });
    });

    describe('static CURSORS', () => {
        it('should have correct cursor mappings', () => {
            expect(HoverController.CURSORS.node).toBe('grab');
            expect(HoverController.CURSORS.nodeDragging).toBe('grabbing');
            expect(HoverController.CURSORS.segment).toBe('pointer');
            expect(HoverController.CURSORS.weight).toBe('pointer');
            expect(HoverController.CURSORS.default).toBe('default');
        });
    });
});
