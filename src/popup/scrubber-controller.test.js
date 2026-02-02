/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrubberController } from './scrubber-controller.js';

/**
 * ScrubberController tests - User intent focused
 */
describe('ScrubberController - User Intent', () => {
    let controller;
    let target;
    let mockScrubberEl;
    let onValueChangeSpy;

    const propertyConfigs = {
        mass: {
            min: 1,
            max: 100,
            sensitivity: 0.5,
            round: (v) => Math.round(v),
            format: (v) => `${v} kg`
        },
        position: {
            min: 0,
            max: 1,
            sensitivity: 0.005,
            format: (v) => `${Math.round(v * 100)}%`
        }
    };

    beforeEach(() => {
        target = { mass: 10, position: 0.5 };
        onValueChangeSpy = vi.fn();

        controller = new ScrubberController({
            getPropertyValue: (prop) => target[prop],
            setPropertyValue: (prop, value) => { target[prop] = value; },
            propertyConfigs,
            onValueChange: onValueChangeSpy
        });

        // Create mock scrubber element
        mockScrubberEl = document.createElement('div');
        mockScrubberEl.className = 'scrubber';
        mockScrubberEl.dataset.property = 'mass';
        mockScrubberEl.innerHTML = `
            <div class="scrubber-track">
                <div class="scrubber-thumb"></div>
            </div>
            <span class="scrubber-value">10 kg</span>
        `;
        document.body.appendChild(mockScrubberEl);
    });

    afterEach(() => {
        controller.destroy();
        mockScrubberEl.remove();
    });

    describe('User drags scrubber to adjust value', () => {
        it('should update value based on drag distance', () => {
            controller.bindToElement(mockScrubberEl);

            // Simulate mouse down
            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Simulate drag 20px right (sensitivity 0.5 = +10 units)
            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            expect(target.mass).toBe(20); // 10 + (20 * 0.5)
        });

        it('should call onValueChange with new value', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            expect(onValueChangeSpy).toHaveBeenCalledWith('mass', 20);
        });

        it('should update display value with formatted text', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            const valueEl = mockScrubberEl.querySelector('.scrubber-value');
            expect(valueEl.textContent).toBe('20 kg');
        });

        it('should move thumb visually during drag', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 115 });
            document.dispatchEvent(mousemove);

            const thumb = mockScrubberEl.querySelector('.scrubber-thumb');
            expect(thumb.style.transform).toBe('translateX(15px)');
        });

        it('should clamp thumb movement to maxOffset', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Drag far beyond maxOffset (30)
            const mousemove = new MouseEvent('mousemove', { clientX: 200 });
            document.dispatchEvent(mousemove);

            const thumb = mockScrubberEl.querySelector('.scrubber-thumb');
            expect(thumb.style.transform).toBe('translateX(30px)');
        });
    });

    describe('User releases scrubber', () => {
        it('should spring thumb back to center', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            const mouseup = new MouseEvent('mouseup');
            document.dispatchEvent(mouseup);

            const thumb = mockScrubberEl.querySelector('.scrubber-thumb');
            expect(thumb.style.transform).toBe('translateX(0)');
        });

        it('should remove scrubbing class', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            expect(mockScrubberEl.classList.contains('scrubbing')).toBe(true);

            const mouseup = new MouseEvent('mouseup');
            document.dispatchEvent(mouseup);

            expect(mockScrubberEl.classList.contains('scrubbing')).toBe(false);
        });

        it('should allow subsequent drags from new value', () => {
            controller.bindToElement(mockScrubberEl);

            // First drag: 10 -> 20
            const mousedown1 = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown1);
            const mousemove1 = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove1);
            const mouseup1 = new MouseEvent('mouseup');
            document.dispatchEvent(mouseup1);

            expect(target.mass).toBe(20);

            // Second drag: 20 -> 30
            const mousedown2 = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown2);
            const mousemove2 = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove2);

            expect(target.mass).toBe(30);
        });
    });

    describe('Value clamping', () => {
        it('should clamp value to minimum', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Drag left to go below minimum (10 - 200*0.5 = -90, clamped to 1)
            const mousemove = new MouseEvent('mousemove', { clientX: -100 });
            document.dispatchEvent(mousemove);

            expect(target.mass).toBe(1); // min is 1
        });

        it('should clamp value to maximum', () => {
            target.mass = 90;
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Drag right to go above maximum (90 + 100*0.5 = 140, clamped to 100)
            const mousemove = new MouseEvent('mousemove', { clientX: 200 });
            document.dispatchEvent(mousemove);

            expect(target.mass).toBe(100); // max is 100
        });
    });

    describe('Value rounding', () => {
        it('should apply rounding function when provided', () => {
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Drag 13px (13 * 0.5 = 6.5, should round to 17)
            const mousemove = new MouseEvent('mousemove', { clientX: 113 });
            document.dispatchEvent(mousemove);

            expect(target.mass).toBe(17); // 10 + 6.5 rounded = 17
        });

        it('should not round when no round function provided', () => {
            // Use position property which has no round function
            mockScrubberEl.dataset.property = 'position';
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Drag 10px (10 * 0.005 = 0.05)
            const mousemove = new MouseEvent('mousemove', { clientX: 110 });
            document.dispatchEvent(mousemove);

            expect(target.position).toBeCloseTo(0.55, 5); // 0.5 + 0.05
        });
    });

    describe('Touch interactions', () => {
        it('should handle touch events identically to mouse', () => {
            controller.bindToElement(mockScrubberEl);

            // Simulate touch start
            const touchstart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100 }]
            });
            mockScrubberEl.dispatchEvent(touchstart);

            expect(mockScrubberEl.classList.contains('scrubbing')).toBe(true);

            // Simulate touch move
            const touchmove = new TouchEvent('touchmove', {
                touches: [{ clientX: 120 }]
            });
            document.dispatchEvent(touchmove);

            expect(target.mass).toBe(20);

            // Simulate touch end
            const touchend = new TouchEvent('touchend');
            document.dispatchEvent(touchend);

            expect(mockScrubberEl.classList.contains('scrubbing')).toBe(false);
        });

        it('should ignore multi-touch gestures on start', () => {
            controller.bindToElement(mockScrubberEl);

            const touchstart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100 }, { clientX: 200 }]
            });
            mockScrubberEl.dispatchEvent(touchstart);

            expect(controller.isScrubbing).toBe(false);
        });

        it('should ignore multi-touch gestures during move', () => {
            controller.bindToElement(mockScrubberEl);

            // Start with single touch
            const touchstart = new TouchEvent('touchstart', {
                touches: [{ clientX: 100 }]
            });
            mockScrubberEl.dispatchEvent(touchstart);

            // Multi-touch move should be ignored
            const touchmove = new TouchEvent('touchmove', {
                touches: [{ clientX: 120 }, { clientX: 200 }]
            });
            document.dispatchEvent(touchmove);

            // Value should not have changed
            expect(target.mass).toBe(10);
        });
    });

    describe('Cleanup', () => {
        it('should remove all listeners on destroy', () => {
            controller.bindToElement(mockScrubberEl);

            // Start a scrub
            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Destroy while scrubbing
            controller.destroy();

            // Mouse events should no longer work
            const mousemove = new MouseEvent('mousemove', { clientX: 200 });
            document.dispatchEvent(mousemove);

            // Value should not have changed (listeners removed)
            expect(target.mass).toBe(10);
        });

        it('should handle multiple bound elements', () => {
            const mockScrubber2 = document.createElement('div');
            mockScrubber2.dataset.property = 'position';
            mockScrubber2.innerHTML = mockScrubberEl.innerHTML;
            document.body.appendChild(mockScrubber2);

            controller.bindToElement(mockScrubberEl);
            controller.bindToElement(mockScrubber2);

            expect(controller.boundElements.length).toBe(2);

            controller.destroy();

            expect(controller.boundElements.length).toBe(0);

            mockScrubber2.remove();
        });

        it('should unbind specific element with unbindElement()', () => {
            const mockScrubber2 = document.createElement('div');
            mockScrubber2.dataset.property = 'position';
            mockScrubber2.innerHTML = mockScrubberEl.innerHTML;
            document.body.appendChild(mockScrubber2);

            controller.bindToElement(mockScrubberEl);
            controller.bindToElement(mockScrubber2);

            expect(controller.boundElements.length).toBe(2);

            controller.unbindElement(mockScrubberEl);

            expect(controller.boundElements.length).toBe(1);
            expect(controller.boundElements[0].element).toBe(mockScrubber2);

            mockScrubber2.remove();
        });

        it('should clean up removed elements with cleanupRemovedElements()', () => {
            const mockScrubber2 = document.createElement('div');
            mockScrubber2.dataset.property = 'position';
            mockScrubber2.innerHTML = mockScrubberEl.innerHTML;
            document.body.appendChild(mockScrubber2);

            controller.bindToElement(mockScrubberEl);
            controller.bindToElement(mockScrubber2);

            expect(controller.boundElements.length).toBe(2);

            // Remove element from DOM
            mockScrubber2.remove();

            // Cleanup should remove stale bindings
            controller.cleanupRemovedElements();

            expect(controller.boundElements.length).toBe(1);
            expect(controller.boundElements[0].element).toBe(mockScrubberEl);
        });

        it('unbindElement should do nothing for unknown element', () => {
            controller.bindToElement(mockScrubberEl);

            const unknownEl = document.createElement('div');
            controller.unbindElement(unknownEl);

            expect(controller.boundElements.length).toBe(1);
        });
    });

    describe('State tracking', () => {
        it('should report isScrubbing correctly', () => {
            controller.bindToElement(mockScrubberEl);

            expect(controller.isScrubbing).toBe(false);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            expect(controller.isScrubbing).toBe(true);

            const mouseup = new MouseEvent('mouseup');
            document.dispatchEvent(mouseup);

            expect(controller.isScrubbing).toBe(false);
        });
    });

    describe('Missing configuration', () => {
        it('should handle unknown properties gracefully', () => {
            mockScrubberEl.dataset.property = 'unknownProperty';
            controller.bindToElement(mockScrubberEl);

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            mockScrubberEl.dispatchEvent(mousedown);

            // Should not throw
            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            // Value callback should not have been called
            expect(onValueChangeSpy).not.toHaveBeenCalled();
        });
    });
});

describe('ScrubberController - Edge Cases', () => {
    it('should handle missing thumb element', () => {
        const controller = new ScrubberController({
            getPropertyValue: () => 10,
            setPropertyValue: () => {},
            propertyConfigs: { mass: { sensitivity: 0.5 } }
        });

        const scrubber = document.createElement('div');
        scrubber.dataset.property = 'mass';
        // No thumb element
        document.body.appendChild(scrubber);

        controller.bindToElement(scrubber);

        // Should not throw
        const mousedown = new MouseEvent('mousedown', { clientX: 100 });
        scrubber.dispatchEvent(mousedown);

        const mousemove = new MouseEvent('mousemove', { clientX: 120 });
        document.dispatchEvent(mousemove);

        controller.destroy();
        scrubber.remove();
    });

    it('should handle missing value element', () => {
        const controller = new ScrubberController({
            getPropertyValue: () => 10,
            setPropertyValue: () => {},
            propertyConfigs: { mass: { sensitivity: 0.5, format: v => `${v}` } }
        });

        const scrubber = document.createElement('div');
        scrubber.dataset.property = 'mass';
        scrubber.innerHTML = '<div class="scrubber-thumb"></div>'; // No value element
        document.body.appendChild(scrubber);

        controller.bindToElement(scrubber);

        // Should not throw
        const mousedown = new MouseEvent('mousedown', { clientX: 100 });
        scrubber.dispatchEvent(mousedown);

        const mousemove = new MouseEvent('mousemove', { clientX: 120 });
        document.dispatchEvent(mousemove);

        controller.destroy();
        scrubber.remove();
    });
});
