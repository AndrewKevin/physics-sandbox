import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock window before importing InputController
const windowAddEventListener = vi.fn();
vi.stubGlobal('window', {
    addEventListener: windowAddEventListener
});

// Now import InputController (after window is mocked)
const { InputController } = await import('./input-controller.js');

/**
 * Tests for InputController - verifies event handling and delegation
 */
describe('InputController', () => {
    let canvas;
    let controller;
    let options;
    let mockDrag;
    let mockHover;

    beforeEach(() => {
        // Reset window mock
        windowAddEventListener.mockClear();

        // Create mock canvas with event listeners
        canvas = {
            addEventListener: vi.fn(),
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
            style: { cursor: 'default' }
        };

        // Mock drag controller
        mockDrag = {
            isTracking: false,
            isActive: false,
            shouldSuppressClick: false,
            beginPotentialDrag: vi.fn(),
            updateDrag: vi.fn(() => ({ isDragging: false })),
            endDrag: vi.fn(() => ({ wasDrag: false })),
            clearClickSuppression: vi.fn()
        };

        // Mock hover controller
        mockHover = {
            clear: vi.fn(),
            update: vi.fn()
        };

        // Mock options/callbacks
        options = {
            isSimulating: vi.fn(() => false),
            findNodeAt: vi.fn(() => null),
            findElementAt: vi.fn(() => null),
            getDrag: vi.fn(() => mockDrag),
            getHover: vi.fn(() => mockHover),
            onMousePosChange: vi.fn(),
            onClick: vi.fn(),
            onRightClick: vi.fn(),
            onEscape: vi.fn(),
            onDelete: vi.fn(),
            onWindowResize: vi.fn()
        };

        controller = new InputController(canvas, options);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Event binding', () => {
        it('should bind mouse events to canvas', () => {
            const eventTypes = canvas.addEventListener.mock.calls.map(call => call[0]);

            expect(eventTypes).toContain('mousedown');
            expect(eventTypes).toContain('mousemove');
            expect(eventTypes).toContain('mouseup');
            expect(eventTypes).toContain('mouseleave');
            expect(eventTypes).toContain('click');
            expect(eventTypes).toContain('contextmenu');
        });

        it('should bind touch events to canvas', () => {
            const eventTypes = canvas.addEventListener.mock.calls.map(call => call[0]);

            expect(eventTypes).toContain('touchstart');
            expect(eventTypes).toContain('touchmove');
            expect(eventTypes).toContain('touchend');
        });

        it('should bind keyboard, resize, and mouse tracking events to window', () => {
            const eventTypes = windowAddEventListener.mock.calls.map(call => call[0]);

            expect(eventTypes).toContain('keydown');
            expect(eventTypes).toContain('keyup');
            expect(eventTypes).toContain('resize');
            expect(eventTypes).toContain('mousemove');
            expect(eventTypes).toContain('mouseup');
        });
    });

    describe('Coordinate conversion', () => {
        it('should convert mouse event to canvas coordinates', () => {
            canvas.getBoundingClientRect = () => ({ left: 100, top: 50 });

            const pos = controller.getMousePos({ clientX: 150, clientY: 100 });

            expect(pos.x).toBe(50);
            expect(pos.y).toBe(50);
        });

        it('should convert touch to canvas coordinates', () => {
            canvas.getBoundingClientRect = () => ({ left: 100, top: 50 });

            const pos = controller.getTouchPos({ clientX: 200, clientY: 150 });

            expect(pos.x).toBe(100);
            expect(pos.y).toBe(100);
        });
    });

    describe('Mouse handlers', () => {
        it('should begin potential drag when clicking on a node', () => {
            const mockNode = { id: 1, isEditable: true };
            options.findNodeAt.mockReturnValue(mockNode);

            controller.onMouseDown({ button: 0, clientX: 100, clientY: 100 });

            expect(mockDrag.beginPotentialDrag).toHaveBeenCalledWith(
                mockNode,
                { x: 100, y: 100 }
            );
        });

        it('should not begin drag when simulating', () => {
            options.isSimulating.mockReturnValue(true);

            controller.onMouseDown({ button: 0, clientX: 100, clientY: 100 });

            expect(mockDrag.beginPotentialDrag).not.toHaveBeenCalled();
        });

        it('should not begin drag for non-left clicks', () => {
            controller.onMouseDown({ button: 2, clientX: 100, clientY: 100 });

            expect(options.findNodeAt).not.toHaveBeenCalled();
        });

        it('should end drag on mouse up', () => {
            controller.onMouseUp({ button: 0 });

            expect(mockDrag.endDrag).toHaveBeenCalled();
        });

        it('should update mouse position on move', () => {
            controller.onMouseMove({ clientX: 150, clientY: 200 });

            expect(options.onMousePosChange).toHaveBeenCalledWith(150, 200);
        });

        it('should update hover state on mouse move when not simulating', () => {
            const mockElement = { type: 'node', element: { id: 1 } };
            options.findElementAt.mockReturnValue(mockElement);

            controller.onMouseMove({ clientX: 100, clientY: 100 });

            expect(mockHover.clear).toHaveBeenCalled();
            expect(mockHover.update).toHaveBeenCalledWith(mockElement);
        });

        it('should not update hover when simulating', () => {
            options.isSimulating.mockReturnValue(true);

            controller.onMouseMove({ clientX: 100, clientY: 100 });

            expect(mockHover.clear).not.toHaveBeenCalled();
        });

        it('should set cursor to grabbing during drag', () => {
            mockDrag.isTracking = true;
            mockDrag.updateDrag.mockReturnValue({ isDragging: true });

            controller.onMouseMove({ clientX: 100, clientY: 100 });

            expect(canvas.style.cursor).toBe('grabbing');
        });

        it('should call onClick callback on click', () => {
            controller.onClick({ clientX: 100, clientY: 100 });

            expect(options.onClick).toHaveBeenCalledWith(100, 100);
        });

        it('should suppress click after drag', () => {
            mockDrag.shouldSuppressClick = true;

            controller.onClick({ clientX: 100, clientY: 100 });

            expect(options.onClick).not.toHaveBeenCalled();
            expect(mockDrag.clearClickSuppression).toHaveBeenCalled();
        });

        it('should not handle click when simulating', () => {
            options.isSimulating.mockReturnValue(true);

            controller.onClick({ clientX: 100, clientY: 100 });

            expect(options.onClick).not.toHaveBeenCalled();
        });

        it('should call onRightClick and prevent default', () => {
            const event = {
                clientX: 100,
                clientY: 100,
                preventDefault: vi.fn()
            };

            controller.onRightClick(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(options.onRightClick).toHaveBeenCalledWith(event, 100, 100);
        });

        it('should not call onRightClick when simulating', () => {
            options.isSimulating.mockReturnValue(true);
            const event = {
                clientX: 100,
                clientY: 100,
                preventDefault: vi.fn()
            };

            controller.onRightClick(event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(options.onRightClick).not.toHaveBeenCalled();
        });

        it('should not cancel selection box when mouse leaves canvas', () => {
            const mockSelectionBox = {
                isTracking: true,
                cancelSelection: vi.fn()
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);

            // Re-create controller with selection box
            controller = new InputController(canvas, options);
            controller.onMouseLeave({});

            // Selection continues outside canvas - handled by window events
            expect(mockSelectionBox.cancelSelection).not.toHaveBeenCalled();
        });

        it('should not error when mouse leaves canvas without selection box', () => {
            options.getSelectionBox = undefined;
            controller = new InputController(canvas, options);

            expect(() => controller.onMouseLeave({})).not.toThrow();
        });
    });

    describe('Touch handlers', () => {
        it('should begin potential drag on touch start over node', () => {
            const mockNode = { id: 1, isEditable: true };
            options.findNodeAt.mockReturnValue(mockNode);
            const event = {
                touches: [{ clientX: 100, clientY: 100 }],
                preventDefault: vi.fn()
            };

            controller.onTouchStart(event);

            expect(mockDrag.beginPotentialDrag).toHaveBeenCalled();
        });

        it('should ignore multi-touch', () => {
            const event = {
                touches: [
                    { clientX: 100, clientY: 100 },
                    { clientX: 200, clientY: 200 }
                ],
                preventDefault: vi.fn()
            };

            controller.onTouchStart(event);

            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('should trigger click on tap (no drag)', () => {
            // Start touch
            controller.onTouchStart({
                touches: [{ clientX: 100, clientY: 100 }],
                preventDefault: vi.fn()
            });

            // End touch at same position
            controller.onTouchEnd({
                changedTouches: [{ clientX: 100, clientY: 100 }],
                preventDefault: vi.fn()
            });

            expect(options.onClick).toHaveBeenCalledWith(100, 100);
        });

        it('should not trigger click after drag', () => {
            mockDrag.endDrag.mockReturnValue({ wasDrag: true });

            controller.onTouchStart({
                touches: [{ clientX: 100, clientY: 100 }],
                preventDefault: vi.fn()
            });

            controller.onTouchEnd({
                changedTouches: [{ clientX: 100, clientY: 100 }],
                preventDefault: vi.fn()
            });

            expect(options.onClick).not.toHaveBeenCalled();
        });
    });

    describe('Keyboard handler', () => {
        it('should call onEscape for Escape key', () => {
            controller.onKeyDown({ key: 'Escape', target: { tagName: 'CANVAS' } });

            expect(options.onEscape).toHaveBeenCalled();
        });

        it('should call onDelete for Delete key', () => {
            controller.onKeyDown({
                key: 'Delete',
                target: { tagName: 'CANVAS' },
                preventDefault: vi.fn()
            });

            expect(options.onDelete).toHaveBeenCalled();
        });

        it('should call onDelete for Backspace key', () => {
            controller.onKeyDown({
                key: 'Backspace',
                target: { tagName: 'CANVAS' },
                preventDefault: vi.fn()
            });

            expect(options.onDelete).toHaveBeenCalled();
        });

        it('should not delete when simulating', () => {
            options.isSimulating.mockReturnValue(true);

            controller.onKeyDown({
                key: 'Delete',
                target: { tagName: 'CANVAS' },
                preventDefault: vi.fn()
            });

            expect(options.onDelete).not.toHaveBeenCalled();
        });

        it('should not delete when typing in input', () => {
            controller.onKeyDown({
                key: 'Delete',
                target: { tagName: 'INPUT' },
                preventDefault: vi.fn()
            });

            expect(options.onDelete).not.toHaveBeenCalled();
        });

        it('should not delete during active drag', () => {
            mockDrag.isActive = true;

            controller.onKeyDown({
                key: 'Delete',
                target: { tagName: 'CANVAS' },
                preventDefault: vi.fn()
            });

            expect(options.onDelete).not.toHaveBeenCalled();
        });

        it('should call onCopy for Ctrl+C', () => {
            options.onCopy = vi.fn();
            controller = new InputController(canvas, options);

            controller.onKeyDown({
                key: 'c',
                ctrlKey: true,
                target: { tagName: 'CANVAS' }
            });

            expect(options.onCopy).toHaveBeenCalled();
        });

        it('should call onCopy for Cmd+C on Mac', () => {
            options.onCopy = vi.fn();
            controller = new InputController(canvas, options);

            controller.onKeyDown({
                key: 'c',
                metaKey: true,
                target: { tagName: 'CANVAS' }
            });

            expect(options.onCopy).toHaveBeenCalled();
        });

        it('should call onPaste for Ctrl+V', () => {
            options.onPaste = vi.fn();
            controller = new InputController(canvas, options);

            controller.onKeyDown({
                key: 'v',
                ctrlKey: true,
                target: { tagName: 'CANVAS' }
            });

            expect(options.onPaste).toHaveBeenCalled();
        });

        it('should not call onCopy when typing in input', () => {
            options.onCopy = vi.fn();
            controller = new InputController(canvas, options);

            controller.onKeyDown({
                key: 'c',
                ctrlKey: true,
                target: { tagName: 'INPUT' }
            });

            expect(options.onCopy).not.toHaveBeenCalled();
        });

        it('should not call onCopy when simulating', () => {
            options.onCopy = vi.fn();
            options.isSimulating.mockReturnValue(true);
            controller = new InputController(canvas, options);

            controller.onKeyDown({
                key: 'c',
                ctrlKey: true,
                target: { tagName: 'CANVAS' }
            });

            expect(options.onCopy).not.toHaveBeenCalled();
        });
    });

    describe('Paste preview handling', () => {
        let mockClipboard;

        beforeEach(() => {
            mockClipboard = {
                isActive: false,
                updatePreview: vi.fn(),
                commitPaste: vi.fn(),
                cancelPaste: vi.fn()
            };
            options.getClipboard = vi.fn(() => mockClipboard);
            controller = new InputController(canvas, options);
        });

        it('should update paste preview on mouse move when active', () => {
            mockClipboard.isActive = true;

            controller.onMouseMove({ clientX: 100, clientY: 100 });

            expect(mockClipboard.updatePreview).toHaveBeenCalled();
            expect(canvas.style.cursor).toBe('copy');
        });

        it('should commit paste on click when active', () => {
            mockClipboard.isActive = true;

            controller.onClick({ clientX: 100, clientY: 100 });

            expect(mockClipboard.commitPaste).toHaveBeenCalled();
        });

        it('should cancel paste on right-click when active', () => {
            mockClipboard.isActive = true;

            controller.onRightClick({
                clientX: 100,
                clientY: 100,
                preventDefault: vi.fn()
            });

            expect(mockClipboard.cancelPaste).toHaveBeenCalled();
        });

        it('should cancel paste on Escape when active', () => {
            mockClipboard.isActive = true;

            controller.onKeyDown({ key: 'Escape', target: { tagName: 'CANVAS' } });

            expect(mockClipboard.cancelPaste).toHaveBeenCalled();
        });

        it('should not start drag during paste preview', () => {
            mockClipboard.isActive = true;
            options.findNodeAt.mockReturnValue({ id: 1 });

            controller.onMouseDown({ button: 0, clientX: 100, clientY: 100 });

            expect(mockDrag.beginPotentialDrag).not.toHaveBeenCalled();
        });
    });

    describe('Window mouse handlers (for outside canvas)', () => {
        let outsideTarget;

        beforeEach(() => {
            // Mock target representing an element outside canvas
            outsideTarget = { tagName: 'BODY' };
        });

        it('should complete selection box on window mouseup', () => {
            const mockSelectionBox = {
                isTracking: true,
                endSelection: vi.fn()
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);
            controller = new InputController(canvas, options);

            // Simulate mouseup outside canvas (target is not canvas)
            controller.onWindowMouseUp({ button: 0, target: outsideTarget });

            expect(mockSelectionBox.endSelection).toHaveBeenCalled();
        });

        it('should complete drag on window mouseup', () => {
            mockDrag.isTracking = true;
            controller = new InputController(canvas, options);

            controller.onWindowMouseUp({ button: 0, target: outsideTarget });

            expect(mockDrag.endDrag).toHaveBeenCalled();
        });

        it('should not handle window mouseup if event is from canvas', () => {
            const mockSelectionBox = {
                isTracking: true,
                endSelection: vi.fn()
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);
            controller = new InputController(canvas, options);

            // Event target is the canvas - should be handled by canvas mouseup
            controller.onWindowMouseUp({ button: 0, target: canvas });

            expect(mockSelectionBox.endSelection).not.toHaveBeenCalled();
        });

        it('should update selection box on window mousemove', () => {
            const mockSelectionBox = {
                isTracking: true,
                updateSelection: vi.fn(() => ({ isSelecting: true }))
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);
            controller = new InputController(canvas, options);

            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: outsideTarget });

            expect(mockSelectionBox.updateSelection).toHaveBeenCalled();
        });

        it('should update drag on window mousemove', () => {
            mockDrag.isTracking = true;
            mockDrag.updateDrag.mockReturnValue({ isDragging: true });
            controller = new InputController(canvas, options);

            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: outsideTarget });

            expect(mockDrag.updateDrag).toHaveBeenCalled();
        });

        it('should not handle window mousemove if event is from canvas', () => {
            const mockSelectionBox = {
                isTracking: true,
                updateSelection: vi.fn(() => ({ isSelecting: true }))
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);
            controller = new InputController(canvas, options);

            // Event target is the canvas - handled by canvas mousemove
            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: canvas });

            expect(mockSelectionBox.updateSelection).not.toHaveBeenCalled();
        });

        it('should not process window mousemove if not tracking anything', () => {
            mockDrag.isTracking = false;
            options.getSelectionBox = vi.fn(() => ({ isTracking: false }));
            controller = new InputController(canvas, options);

            // Should return early without calling getMousePos extensively
            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: outsideTarget });

            expect(mockDrag.updateDrag).not.toHaveBeenCalled();
        });

        it('should set cursor to crosshair during selection outside canvas', () => {
            const mockSelectionBox = {
                isTracking: true,
                updateSelection: vi.fn(() => ({ isSelecting: true }))
            };
            options.getSelectionBox = vi.fn(() => mockSelectionBox);
            controller = new InputController(canvas, options);

            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: outsideTarget });

            expect(canvas.style.cursor).toBe('crosshair');
        });

        it('should set cursor to grabbing during drag outside canvas', () => {
            mockDrag.isTracking = true;
            mockDrag.updateDrag.mockReturnValue({ isDragging: true });
            controller = new InputController(canvas, options);

            controller.onWindowMouseMove({ clientX: 200, clientY: 200, target: outsideTarget });

            expect(canvas.style.cursor).toBe('grabbing');
        });
    });
});
