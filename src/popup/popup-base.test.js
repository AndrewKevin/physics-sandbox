/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PopupBase } from './popup-base.js';

/**
 * Concrete implementation for testing
 */
class TestPopup extends PopupBase {
    constructor() {
        super();
        this.onMassChange = null;
    }

    getClassName() {
        return 'test-popup';
    }

    buildHTML(target) {
        return `
            <div class="test-popup-header">
                <span class="test-popup-title">Test #${target.id}</span>
            </div>
            <div class="test-popup-controls">
                ${this.renderScrubber('mass', 'Mass', `${target.mass} kg`)}
                ${this.renderActionRow('delete', '🗑️', 'Delete', { isDelete: true })}
            </div>
        `;
    }

    getPropertyConfigs() {
        return {
            mass: {
                min: 1,
                max: 100,
                sensitivity: 0.5,
                format: v => `${Math.round(v)} kg`
            }
        };
    }

    setTargetProperty(property, value) {
        if (property === 'mass' && this.target?.setMass) {
            this.target.setMass(value);
        } else {
            super.setTargetProperty(property, value);
        }
    }

    onPropertyChange(property, value) {
        if (property === 'mass') {
            this.onMassChange?.(value);
        }
    }

    bindEvents() {
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.target);
            this.close();
        });
    }
}

describe('PopupBase - User Intent', () => {
    let popup;
    let target;

    beforeEach(() => {
        popup = new TestPopup();
        target = {
            id: 1,
            mass: 10,
            setMass: vi.fn((v) => { target.mass = Math.max(1, Math.min(100, v)); })
        };
    });

    afterEach(() => {
        popup.close();
    });

    describe('User opens a popup', () => {
        it('should create popup element in the DOM', () => {
            popup.show(target, 100, 100);

            const popupEl = document.querySelector('.test-popup');
            expect(popupEl).not.toBeNull();
        });

        it('should display target information', () => {
            popup.show(target, 100, 100);

            const title = document.querySelector('.test-popup-title');
            expect(title.textContent).toBe('Test #1');
        });

        it('should report isOpen correctly', () => {
            expect(popup.isOpen()).toBe(false);

            popup.show(target, 100, 100);

            expect(popup.isOpen()).toBe(true);
        });
    });

    describe('Popup positioning', () => {
        it('should position popup near click point', () => {
            popup.show(target, 200, 300);

            const popupEl = document.querySelector('.test-popup');
            const left = parseInt(popupEl.style.left);
            const top = parseInt(popupEl.style.top);

            // Should be offset by padding (10px)
            expect(left).toBeGreaterThanOrEqual(200);
            expect(top).toBeGreaterThanOrEqual(300);
        });

        it('should ensure minimum padding from edges', () => {
            popup.show(target, 0, 0);

            const popupEl = document.querySelector('.test-popup');
            const left = parseInt(popupEl.style.left);
            const top = parseInt(popupEl.style.top);

            // Should be at least 10px from edge
            expect(left).toBeGreaterThanOrEqual(10);
            expect(top).toBeGreaterThanOrEqual(10);
        });
    });

    describe('User clicks outside popup', () => {
        it('should close popup', async () => {
            popup.show(target, 100, 100);

            // Wait for the setTimeout in show()
            await new Promise(resolve => setTimeout(resolve, 20));

            // Click outside
            const mousedown = new MouseEvent('mousedown', { bubbles: true });
            document.body.dispatchEvent(mousedown);

            expect(popup.isOpen()).toBe(false);
        });

        it('should call onClose callback', async () => {
            const onCloseSpy = vi.fn();
            popup.onClose = onCloseSpy;
            popup.show(target, 100, 100);

            await new Promise(resolve => setTimeout(resolve, 20));

            const mousedown = new MouseEvent('mousedown', { bubbles: true });
            document.body.dispatchEvent(mousedown);

            expect(onCloseSpy).toHaveBeenCalled();
        });

        it('should NOT close when clicking inside popup', async () => {
            popup.show(target, 100, 100);

            await new Promise(resolve => setTimeout(resolve, 20));

            // Click inside popup
            const popupEl = document.querySelector('.test-popup');
            const mousedown = new MouseEvent('mousedown', { bubbles: true });
            popupEl.dispatchEvent(mousedown);

            expect(popup.isOpen()).toBe(true);
        });
    });

    describe('User presses ESC key', () => {
        it('should close popup', async () => {
            popup.show(target, 100, 100);

            await new Promise(resolve => setTimeout(resolve, 20));

            const keydown = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(keydown);

            expect(popup.isOpen()).toBe(false);
        });

        it('should not close on other keys', async () => {
            popup.show(target, 100, 100);

            await new Promise(resolve => setTimeout(resolve, 20));

            const keydown = new KeyboardEvent('keydown', { key: 'Enter' });
            document.dispatchEvent(keydown);

            expect(popup.isOpen()).toBe(true);
        });
    });

    describe('User interacts with scrubber', () => {
        it('should update target property via scrubber', async () => {
            popup.show(target, 100, 100);

            const scrubber = document.querySelector('.scrubber[data-property="mass"]');

            // Simulate drag
            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            scrubber.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            // 20px * 0.5 sensitivity = +10
            expect(target.setMass).toHaveBeenCalledWith(20);
        });

        it('should call onPropertyChange callback', async () => {
            const onMassChangeSpy = vi.fn();
            popup.onMassChange = onMassChangeSpy;
            popup.show(target, 100, 100);

            const scrubber = document.querySelector('.scrubber[data-property="mass"]');

            const mousedown = new MouseEvent('mousedown', { clientX: 100 });
            scrubber.dispatchEvent(mousedown);

            const mousemove = new MouseEvent('mousemove', { clientX: 120 });
            document.dispatchEvent(mousemove);

            expect(onMassChangeSpy).toHaveBeenCalledWith(20);
        });
    });

    describe('User clicks delete action', () => {
        it('should call onDelete callback', () => {
            const onDeleteSpy = vi.fn();
            popup.onDelete = onDeleteSpy;
            popup.show(target, 100, 100);

            const deleteBtn = document.querySelector('[data-action="delete"]');
            deleteBtn.click();

            expect(onDeleteSpy).toHaveBeenCalledWith(target);
        });

        it('should close popup after delete', () => {
            popup.onDelete = vi.fn();
            popup.show(target, 100, 100);

            const deleteBtn = document.querySelector('[data-action="delete"]');
            deleteBtn.click();

            expect(popup.isOpen()).toBe(false);
        });
    });

    describe('Popup cleanup', () => {
        it('should remove popup element from DOM on close', () => {
            popup.show(target, 100, 100);
            popup.close();

            const popupEl = document.querySelector('.test-popup');
            expect(popupEl).toBeNull();
        });

        it('should clean up scrubber controller on close', () => {
            popup.show(target, 100, 100);

            const controller = popup.scrubberController;
            const destroySpy = vi.spyOn(controller, 'destroy');

            popup.close();

            expect(destroySpy).toHaveBeenCalled();
            expect(popup.scrubberController).toBeNull();
        });

        it('should remove event listeners on close', async () => {
            popup.show(target, 100, 100);
            popup.close();

            await new Promise(resolve => setTimeout(resolve, 20));

            // These events should not cause errors or re-close
            const mousedown = new MouseEvent('mousedown', { bubbles: true });
            document.body.dispatchEvent(mousedown);

            const keydown = new KeyboardEvent('keydown', { key: 'Escape' });
            document.dispatchEvent(keydown);

            // No errors thrown = success
        });
    });

    describe('Opening new popup closes previous', () => {
        it('should close existing popup when showing new one', () => {
            popup.show(target, 100, 100);
            const firstPopup = document.querySelector('.test-popup');

            const target2 = { id: 2, mass: 20 };
            popup.show(target2, 200, 200);

            // First popup should be removed
            expect(document.body.contains(firstPopup)).toBe(false);

            // New popup should be visible
            const title = document.querySelector('.test-popup-title');
            expect(title.textContent).toBe('Test #2');
        });
    });
});

describe('PopupBase - Helper Methods', () => {
    class HelperTestPopup extends PopupBase {
        getClassName() { return 'helper-popup'; }
        buildHTML() { return ''; }
    }

    it('renderScrubber should create proper HTML structure', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderScrubber('mass', 'Mass', '10 kg');

        expect(html).toContain('scrubber-row');
        expect(html).toContain('scrubber-label');
        expect(html).toContain('data-property="mass"');
        expect(html).toContain('scrubber-track');
        expect(html).toContain('scrubber-thumb');
        expect(html).toContain('scrubber-value');
        expect(html).toContain('Mass');
        expect(html).toContain('10 kg');
    });

    it('renderActionRow should create proper HTML structure', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderActionRow('delete', '🗑️', 'Delete', { isDelete: true });

        expect(html).toContain('helper-popup-action-row');
        expect(html).toContain('helper-popup-action-row--delete');
        expect(html).toContain('data-action="delete"');
        expect(html).toContain('🗑️');
        expect(html).toContain('Delete');
    });

    it('renderToggle should create proper HTML structure', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderToggle('enabled', 'Enable Feature', 'Turns on the feature', true);

        expect(html).toContain('helper-popup-toggle');
        expect(html).toContain('data-property="enabled"');
        expect(html).toContain('checked');
        expect(html).toContain('toggle-label');
        expect(html).toContain('Enable Feature');
        expect(html).toContain('toggle-hint');
        expect(html).toContain('Turns on the feature');
    });

    it('renderActionRow should work without isDelete flag', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderActionRow('pin', '📌', 'Pin Node');

        expect(html).toContain('helper-popup-action-row');
        expect(html).not.toContain('helper-popup-action-row--delete');
        expect(html).toContain('data-action="pin"');
        expect(html).toContain('📌');
        expect(html).toContain('Pin Node');
    });

    it('renderActionRow should accept custom className', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderActionRow('custom', '⚡', 'Custom', { className: 'my-custom-class' });

        expect(html).toContain('helper-popup-action-row');
        expect(html).toContain('my-custom-class');
    });

    it('getActionRowClass should use first class for multi-class popups', () => {
        class MultiClassPopup extends PopupBase {
            getClassName() { return 'node-popup multi-node-popup'; }
            buildHTML() { return ''; }
        }

        const popup = new MultiClassPopup();
        expect(popup.getActionRowClass()).toBe('node-popup-action-row');
    });

    it('renderToggle should work with unchecked state', () => {
        const popup = new HelperTestPopup();
        const html = popup.renderToggle('disabled', 'Feature', 'Description', false);

        expect(html).toContain('data-property="disabled"');
        expect(html).not.toContain('checked');
    });
});

describe('PopupBase - Edge Cases', () => {
    class MinimalPopup extends PopupBase {
        getClassName() { return 'minimal-popup'; }
        buildHTML() { return '<div>Minimal</div>'; }
    }

    it('should handle popup with no scrubbers', () => {
        const popup = new MinimalPopup();
        const target = { id: 1 };

        popup.show(target, 100, 100);

        expect(popup.scrubberController).toBeNull();
        expect(popup.isOpen()).toBe(true);

        popup.close();
    });

    it('should handle multiple close calls gracefully', () => {
        const popup = new MinimalPopup();
        popup.show({ id: 1 }, 100, 100);

        popup.close();
        popup.close(); // Second close should not throw

        expect(popup.isOpen()).toBe(false);
    });

    it('should throw if getClassName not implemented', () => {
        class BadPopup extends PopupBase {
            buildHTML() { return ''; }
        }

        const popup = new BadPopup();
        expect(() => popup.show({}, 0, 0)).toThrow('Subclass must implement getClassName()');
    });

    it('should throw if buildHTML not implemented', () => {
        class BadPopup extends PopupBase {
            getClassName() { return 'bad'; }
        }

        const popup = new BadPopup();
        expect(() => popup.show({}, 0, 0)).toThrow('Subclass must implement buildHTML()');
    });
});
