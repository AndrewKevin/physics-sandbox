import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextMenuController } from './context-menu-controller.js';
import { MATERIAL_ORDER } from './materials.js';

/**
 * Intent-focused tests describing user interactions
 */
describe('ContextMenuController - User Intent', () => {
    let controller;
    let mockStructure;
    let mockUi;
    let onStatsUpdate;

    beforeEach(() => {
        mockStructure = {
            nodes: [],
            segments: [],
            weights: [],
            addNode: vi.fn((x, y) => ({ id: 1, x, y })),
            selectNode: vi.fn(),
            removeNode: vi.fn(),
            addSegment: vi.fn(),
            selectSegment: vi.fn(),
            removeSegment: vi.fn(),
            addWeight: vi.fn((segment, pos) => ({ id: 1, segment, position: pos })),
            selectWeight: vi.fn(),
            removeWeight: vi.fn(),
            clearSelection: vi.fn(),
            selectedWeight: null
        };

        mockUi = {
            updateSelection: vi.fn()
        };

        onStatsUpdate = vi.fn();

        controller = new ContextMenuController({
            structure: mockStructure,
            ui: mockUi,
            getGroundY: () => 540,
            getNodeRadius: () => 12,
            onStatsUpdate
        });
    });

    describe('User right-clicks on empty space', () => {
        it('should generate Add Node menu option', () => {
            const items = controller.getEmptySpaceMenuItems(200, 300);

            expect(items).toHaveLength(1);
            expect(items[0].label).toContain('Add Node');
        });

        it('clicking Add Node should create node at position', () => {
            const items = controller.getEmptySpaceMenuItems(200, 300);
            items[0].callback();

            expect(mockStructure.addNode).toHaveBeenCalledWith(200, 300);
            expect(mockStructure.selectNode).toHaveBeenCalled();
            expect(mockUi.updateSelection).toHaveBeenCalled();
        });

        it('should clamp node position above ground', () => {
            const items = controller.getEmptySpaceMenuItems(200, 600);
            items[0].callback();

            // Should clamp to groundY - nodeRadius = 540 - 12 = 528
            expect(mockStructure.addNode).toHaveBeenCalledWith(200, 528);
        });
    });

    describe('User interacts with node via popup', () => {
        it('clicking Pin should toggle fixed state', () => {
            const node = { id: 1, fixed: false, setFixed: vi.fn() };
            mockStructure.nodes = [node];

            controller.nodePopup.onPinToggle(node);

            expect(node.setFixed).toHaveBeenCalledWith(true);
        });

        it('clicking Unpin should toggle fixed state off', () => {
            const node = { id: 1, fixed: true, setFixed: vi.fn() };
            mockStructure.nodes = [node];

            controller.nodePopup.onPinToggle(node);

            expect(node.setFixed).toHaveBeenCalledWith(false);
        });

        it('clicking Delete should remove node and clear selection', () => {
            const node = { id: 1, fixed: false, setFixed: vi.fn() };
            mockStructure.nodes = [node];

            controller.nodePopup.onDelete(node);

            expect(mockStructure.removeNode).toHaveBeenCalledWith(node);
            expect(mockStructure.clearSelection).toHaveBeenCalled();
            expect(mockUi.updateSelection).toHaveBeenCalledWith({});
            expect(onStatsUpdate).toHaveBeenCalled();
        });

        it('should not delete node if not in structure', () => {
            const node = { id: 1, fixed: false, setFixed: vi.fn() };
            mockStructure.nodes = []; // Node not in structure

            controller.nodePopup.onDelete(node);

            expect(mockStructure.removeNode).not.toHaveBeenCalled();
        });
    });

    describe('User interacts with segment via popup', () => {
        it('clicking Add Node should split segment at click position', () => {
            const segment = { id: 1, material: 'beam', nodeA: { x: 0, y: 100 }, nodeB: { x: 200, y: 100 } };
            const newNode = { id: 2, x: 100, y: 100 };
            mockStructure.segments = [segment];
            mockStructure.splitSegment = vi.fn(() => ({ node: newNode, segmentA: {}, segmentB: {} }));

            // Simulate the callback with click position at midpoint
            controller.segmentPopup.onAddNode(segment, { x: 100, y: 100 });

            expect(mockStructure.splitSegment).toHaveBeenCalledWith(segment, 0.5); // Midpoint
            expect(mockStructure.selectNode).toHaveBeenCalledWith(newNode);
            expect(onStatsUpdate).toHaveBeenCalled();
        });

        it('clicking Add Weight should create weight at click position', () => {
            const segment = { id: 1, material: 'beam', nodeA: { x: 0, y: 100 }, nodeB: { x: 200, y: 100 } };
            mockStructure.segments = [segment];

            controller.segmentPopup.onAddWeight(segment, { x: 100, y: 100 });

            expect(mockStructure.addWeight).toHaveBeenCalledWith(segment, 0.5); // Midpoint
            expect(onStatsUpdate).toHaveBeenCalled();
        });

        it('clicking Delete should remove segment and clear selection', () => {
            const segment = { id: 1, material: 'beam', nodeA: { x: 0, y: 100 }, nodeB: { x: 200, y: 100 } };
            mockStructure.segments = [segment];

            controller.segmentPopup.onDelete(segment);

            expect(mockStructure.removeSegment).toHaveBeenCalledWith(segment);
            expect(mockStructure.clearSelection).toHaveBeenCalled();
            expect(mockUi.updateSelection).toHaveBeenCalledWith({});
            expect(onStatsUpdate).toHaveBeenCalled();
        });

        it('should not delete segment if not in structure', () => {
            const segment = { id: 1, material: 'beam' };
            mockStructure.segments = []; // Segment not in structure

            controller.segmentPopup.onDelete(segment);

            expect(mockStructure.removeSegment).not.toHaveBeenCalled();
        });

        it('clicking different material should call onMaterialChange', () => {
            const currentMaterial = MATERIAL_ORDER[0];
            const targetMaterial = MATERIAL_ORDER[1];
            const segment = { id: 1, material: currentMaterial };
            mockStructure.segments = [segment];
            const onMaterialChange = vi.fn();
            const ctrlWithCallback = new ContextMenuController({
                structure: mockStructure,
                ui: mockUi,
                onMaterialChange
            });

            ctrlWithCallback.segmentPopup.onMaterialChange(segment, targetMaterial);

            expect(onMaterialChange).toHaveBeenCalledWith(segment, targetMaterial);
        });

        it('should not change material if segment not in structure', () => {
            const segment = { id: 1, material: 'beam' };
            mockStructure.segments = []; // Segment not in structure
            const onMaterialChange = vi.fn();
            const ctrlWithCallback = new ContextMenuController({
                structure: mockStructure,
                ui: mockUi,
                onMaterialChange
            });

            ctrlWithCallback.segmentPopup.onMaterialChange(segment, 'spring');

            expect(onMaterialChange).not.toHaveBeenCalled();
        });
    });

    describe('User deletes weight via popup', () => {
        it('clicking Delete should remove weight and clear selection', () => {
            const weight = { id: 1 };
            mockStructure.weights = [weight];

            controller.weightPopup.onDelete(weight);

            expect(mockStructure.removeWeight).toHaveBeenCalledWith(weight);
            expect(mockStructure.clearSelection).toHaveBeenCalled();
            expect(mockUi.updateSelection).toHaveBeenCalledWith({});
            expect(onStatsUpdate).toHaveBeenCalled();
        });
    });

    describe('User right-clicks where elements overlap', () => {
        it('should generate picker menu with all elements', () => {
            const elements = [
                { type: 'weight', element: { id: 1 } },
                { type: 'node', element: { id: 2 } }
            ];

            const mockEvent = { clientX: 100, clientY: 100 };
            const items = controller.getElementPickerMenuItems(elements, mockEvent, { x: 100, y: 100 });

            expect(items).toHaveLength(2);
            expect(items[0].label).toContain('Weight');
            expect(items[1].label).toContain('Node');
        });
    });
});

describe('ContextMenuController', () => {
    let controller;
    let mockStructure;
    let mockUi;

    beforeEach(() => {
        mockStructure = {
            nodes: [],
            segments: [],
            weights: [],
            selectedWeight: null,
            addNode: vi.fn(),
            selectNode: vi.fn(),
            selectWeight: vi.fn(),
            selectSegment: vi.fn()
        };

        mockUi = {
            updateSelection: vi.fn()
        };

        controller = new ContextMenuController({
            structure: mockStructure,
            ui: mockUi
        });
    });

    describe('closeAll', () => {
        it('should handle being called when no menus are open', () => {
            expect(() => controller.closeAll()).not.toThrow();
        });
    });

    describe('isAnyOpen', () => {
        it('should return false when nothing is open', () => {
            expect(controller.isAnyOpen()).toBe(false);
        });
    });

    describe('handleRightClick', () => {
        it('should call showContextMenu for empty space', () => {
            // Mock showContextMenu to avoid DOM dependency
            controller.showContextMenu = vi.fn();
            const mockEvent = { clientX: 100, clientY: 100 };

            controller.handleRightClick(mockEvent, 100, 100, []);

            expect(controller.showContextMenu).toHaveBeenCalled();
        });

        it('should call showElementMenu for single element', () => {
            // Mock showElementMenu to avoid DOM dependency
            controller.showElementMenu = vi.fn();
            const mockEvent = { clientX: 100, clientY: 100 };
            const elements = [{ type: 'node', element: { id: 1 } }];

            controller.handleRightClick(mockEvent, 100, 100, elements);

            expect(controller.showElementMenu).toHaveBeenCalledWith(
                elements[0],
                mockEvent,
                { x: 100, y: 100 }
            );
        });

        it('should call showContextMenu with picker items for multiple elements', () => {
            controller.showContextMenu = vi.fn();
            const mockEvent = { clientX: 100, clientY: 100 };
            const elements = [
                { type: 'weight', element: { id: 1 } },
                { type: 'node', element: { id: 2 } }
            ];

            controller.handleRightClick(mockEvent, 100, 100, elements);

            expect(controller.showContextMenu).toHaveBeenCalled();
            // Verify the menu items were generated (2 items for 2 elements)
            const menuItems = controller.showContextMenu.mock.calls[0][1];
            expect(menuItems).toHaveLength(2);
        });
    });

    describe('weight popup callbacks', () => {
        it('should set up onDelete callback', () => {
            expect(controller.weightPopup.onDelete).toBeDefined();
        });

        it('should set up onMassChange callback', () => {
            expect(controller.weightPopup.onMassChange).toBeDefined();
        });

        it('should set up onPositionChange callback', () => {
            expect(controller.weightPopup.onPositionChange).toBeDefined();
        });
    });

    describe('node popup callbacks', () => {
        it('should set up onDelete callback', () => {
            expect(controller.nodePopup.onDelete).toBeDefined();
        });

        it('should set up onPinToggle callback', () => {
            expect(controller.nodePopup.onPinToggle).toBeDefined();
        });

        it('should set up onMassChange callback', () => {
            expect(controller.nodePopup.onMassChange).toBeDefined();
        });
    });

    describe('segment popup callbacks', () => {
        it('should set up onMaterialChange callback', () => {
            expect(controller.segmentPopup.onMaterialChange).toBeDefined();
        });

        it('should set up onAddNode callback', () => {
            expect(controller.segmentPopup.onAddNode).toBeDefined();
        });

        it('should set up onAddWeight callback', () => {
            expect(controller.segmentPopup.onAddWeight).toBeDefined();
        });

        it('should set up onDelete callback', () => {
            expect(controller.segmentPopup.onDelete).toBeDefined();
        });
    });

    describe('isNodePopupOpen', () => {
        it('should return false when node popup is not open', () => {
            expect(controller.isNodePopupOpen()).toBe(false);
        });
    });

    describe('isSegmentPopupOpen', () => {
        it('should return false when segment popup is not open', () => {
            expect(controller.isSegmentPopupOpen()).toBe(false);
        });
    });
});
