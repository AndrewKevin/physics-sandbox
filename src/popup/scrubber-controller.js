/**
 * ScrubberController - Handles drag-to-adjust scrubber interactions
 *
 * Extracts the common scrubber logic from popup classes into a reusable,
 * testable component. Supports both mouse and touch interactions.
 *
 * @example
 * const scrubber = new ScrubberController({
 *     getPropertyValue: (prop) => target[prop],
 *     setPropertyValue: (prop, value) => target.setProperty(prop, value),
 *     propertyConfigs: {
 *         mass: { min: 1, max: 100, sensitivity: 0.5, format: v => `${v} kg` }
 *     },
 *     onValueChange: (prop, value) => callbacks[prop]?.(value)
 * });
 */
export class ScrubberController {
    /**
     * @param {Object} options
     * @param {Function} options.getPropertyValue - (property) => current value
     * @param {Function} options.setPropertyValue - (property, value) => void
     * @param {Object} options.propertyConfigs - { [property]: { min, max, sensitivity, round?, format } }
     * @param {Function} [options.onValueChange] - (property, value) => void
     */
    constructor(options = {}) {
        this.getPropertyValue = options.getPropertyValue ?? (() => 0);
        this.setPropertyValue = options.setPropertyValue ?? (() => {});
        this.propertyConfigs = options.propertyConfigs ?? {};
        this.onValueChange = options.onValueChange ?? (() => {});

        // Scrubber state
        this.activeScrubber = null;
        this.scrubStartX = 0;
        this.scrubStartValue = 0;

        // Track bound elements for cleanup
        this.boundElements = [];

        // Bind handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }

    /**
     * Bind scrubber interaction to an element.
     * @param {HTMLElement} scrubberEl - Element with data-property attribute
     */
    bindToElement(scrubberEl) {
        const mouseHandler = (e) => this.startScrub(e, scrubberEl);
        const touchHandler = (e) => this.startScrubTouch(e, scrubberEl);

        scrubberEl.addEventListener('mousedown', mouseHandler);
        scrubberEl.addEventListener('touchstart', touchHandler, { passive: false });

        this.boundElements.push({
            element: scrubberEl,
            mouseHandler,
            touchHandler
        });
    }

    /**
     * Start a mouse drag operation.
     * @param {MouseEvent} e
     * @param {HTMLElement} scrubber
     */
    startScrub(e, scrubber) {
        e.preventDefault();
        this.activeScrubber = scrubber;
        this.scrubStartX = e.clientX;

        const property = scrubber.dataset.property;
        this.scrubStartValue = this.getPropertyValue(property);

        // Visual feedback
        scrubber.classList.add('scrubbing');

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }

    /**
     * Start a touch drag operation.
     * @param {TouchEvent} e
     * @param {HTMLElement} scrubber
     */
    startScrubTouch(e, scrubber) {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        this.activeScrubber = scrubber;
        this.scrubStartX = e.touches[0].clientX;

        const property = scrubber.dataset.property;
        this.scrubStartValue = this.getPropertyValue(property);

        // Visual feedback
        scrubber.classList.add('scrubbing');

        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * Handle mouse movement during drag.
     * @param {MouseEvent} e
     */
    handleMouseMove(e) {
        if (!this.activeScrubber) return;
        this.updateValue(e.clientX - this.scrubStartX);
    }

    /**
     * Handle touch movement during drag.
     * @param {TouchEvent} e
     */
    handleTouchMove(e) {
        if (!this.activeScrubber || e.touches.length !== 1) return;
        e.preventDefault();
        this.updateValue(e.touches[0].clientX - this.scrubStartX);
    }

    /**
     * Update value based on drag distance.
     * @param {number} dx - Pixels dragged from start
     */
    updateValue(dx) {
        const property = this.activeScrubber.dataset.property;
        const config = this.propertyConfigs[property];
        if (!config) return;

        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        const valueEl = this.activeScrubber.querySelector('.scrubber-value');

        // Move thumb (clamped to track width)
        const maxOffset = 30;
        const thumbOffset = Math.max(-maxOffset, Math.min(maxOffset, dx));
        if (thumb) {
            thumb.style.transform = `translateX(${thumbOffset}px)`;
        }

        // Calculate new value
        const sensitivity = config.sensitivity ?? 0.5;
        let newValue = this.scrubStartValue + dx * sensitivity;

        // Apply bounds
        if (config.min !== undefined) newValue = Math.max(config.min, newValue);
        if (config.max !== undefined) newValue = Math.min(config.max, newValue);

        // Apply rounding
        if (config.round) {
            newValue = config.round(newValue);
        }

        // Update value
        this.setPropertyValue(property, newValue);

        // Update display
        if (valueEl && config.format) {
            valueEl.textContent = config.format(newValue);
        }

        // Notify
        this.onValueChange(property, newValue);
    }

    /**
     * Handle mouse release.
     */
    handleMouseUp() {
        this.endScrub();
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    /**
     * Handle touch release.
     */
    handleTouchEnd() {
        this.endScrub();
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }

    /**
     * End the current scrub operation.
     */
    endScrub() {
        if (!this.activeScrubber) return;

        // Spring thumb back to center
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        if (thumb) {
            thumb.style.transform = 'translateX(0)';
        }

        // Update start value for next drag
        const property = this.activeScrubber.dataset.property;
        this.scrubStartValue = this.getPropertyValue(property);

        this.activeScrubber.classList.remove('scrubbing');
        this.activeScrubber = null;
    }

    /**
     * Check if currently scrubbing.
     * @returns {boolean}
     */
    get isScrubbing() {
        return this.activeScrubber !== null;
    }

    /**
     * Unbind a specific element and remove its listeners.
     * @param {HTMLElement} scrubberEl - Element to unbind
     */
    unbindElement(scrubberEl) {
        const index = this.boundElements.findIndex(b => b.element === scrubberEl);
        if (index !== -1) {
            const { element, mouseHandler, touchHandler } = this.boundElements[index];
            element.removeEventListener('mousedown', mouseHandler);
            element.removeEventListener('touchstart', touchHandler);
            this.boundElements.splice(index, 1);
        }
    }

    /**
     * Unbind all elements that are no longer in the DOM.
     * Call this after removing elements dynamically.
     */
    cleanupRemovedElements() {
        this.boundElements = this.boundElements.filter(({ element, mouseHandler, touchHandler }) => {
            if (!document.body.contains(element)) {
                element.removeEventListener('mousedown', mouseHandler);
                element.removeEventListener('touchstart', touchHandler);
                return false;
            }
            return true;
        });
    }

    /**
     * Clean up all event listeners.
     */
    destroy() {
        // Remove element listeners
        for (const { element, mouseHandler, touchHandler } of this.boundElements) {
            element.removeEventListener('mousedown', mouseHandler);
            element.removeEventListener('touchstart', touchHandler);
        }
        this.boundElements = [];

        // Remove document listeners if still active
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);

        this.activeScrubber = null;
    }
}
