/**
 * PopupBase - Shared popup lifecycle and positioning
 *
 * Provides common functionality for all popup types:
 * - Viewport-aware positioning
 * - Click-outside to close
 * - ESC key to close
 * - Scrubber integration via ScrubberController
 *
 * Subclasses implement:
 * - getClassName() - CSS class for the popup element
 * - buildHTML(target) - Returns inner HTML for the popup
 * - bindEvents() - Sets up element-specific event handlers
 * - getPropertyConfigs() - Returns scrubber property configurations
 *
 * @example
 * class MyPopup extends PopupBase {
 *     getClassName() { return 'my-popup'; }
 *     buildHTML(target) { return `<div>...</div>`; }
 * }
 */

import { ScrubberController } from './scrubber-controller.js';

export class PopupBase {
    constructor() {
        this.popup = null;
        this.target = null;
        this.scrubberController = null;

        // Standard callbacks
        this.onDelete = null;
        this.onClose = null;

        // Bind handlers
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Show popup for a target at the given screen position.
     * @param {Object} target - The element to edit (node, segment, weight, etc.)
     * @param {number} x - Screen X position (clientX)
     * @param {number} y - Screen Y position (clientY)
     */
    show(target, x, y) {
        this.close();
        this.target = target;

        // Create popup element
        this.popup = document.createElement('div');
        this.popup.className = this.getClassName();
        this.popup.innerHTML = this.buildHTML(target);

        // Add to DOM and position
        document.body.appendChild(this.popup);
        this.positionPopup(x, y);

        // Bind element-specific events
        this.bindEvents();

        // Set up scrubbers
        this.setupScrubbers();

        // Add global listeners after a brief delay to avoid immediate close
        setTimeout(() => {
            document.addEventListener('mousedown', this.handleClickOutside);
            document.addEventListener('keydown', this.handleKeyDown);
        }, 10);
    }

    /**
     * Position popup near the click point, adjusting for viewport edges.
     * @param {number} x - Screen X position
     * @param {number} y - Screen Y position
     */
    positionPopup(x, y) {
        const popup = this.popup;
        const rect = popup.getBoundingClientRect();
        const padding = 10;

        // Start with default position (offset from click)
        let left = x + padding;
        let top = y + padding;

        // Flip to left if would overflow right edge
        if (left + rect.width > window.innerWidth) {
            left = x - rect.width - padding;
        }

        // Flip to above if would overflow bottom edge
        if (top + rect.height > window.innerHeight) {
            top = y - rect.height - padding;
        }

        // Ensure minimum padding from edges
        popup.style.left = `${Math.max(padding, left)}px`;
        popup.style.top = `${Math.max(padding, top)}px`;
    }

    /**
     * Handle click outside popup to close.
     * @param {MouseEvent} e
     */
    handleClickOutside(e) {
        if (this.popup && !this.popup.contains(e.target)) {
            this.close();
        }
    }

    /**
     * Handle keyboard events (ESC to close).
     * @param {KeyboardEvent} e
     */
    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Close the popup and clean up.
     */
    close() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
        this.target = null;

        // Clean up scrubber controller
        if (this.scrubberController) {
            this.scrubberController.destroy();
            this.scrubberController = null;
        }

        // Remove global listeners
        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyDown);

        // Notify
        this.onClose?.();
    }

    /**
     * Check if popup is currently open.
     * @returns {boolean}
     */
    isOpen() {
        return this.popup !== null;
    }

    /**
     * Set up scrubber controls based on property configs.
     * Called automatically by show().
     */
    setupScrubbers() {
        const configs = this.getPropertyConfigs();
        if (Object.keys(configs).length === 0) return;

        this.scrubberController = new ScrubberController({
            getPropertyValue: (prop) => this.getTargetProperty(prop),
            setPropertyValue: (prop, value) => this.setTargetProperty(prop, value),
            propertyConfigs: configs,
            onValueChange: (prop, value) => this.onPropertyChange(prop, value)
        });

        // Bind to all scrubber elements
        const scrubbers = this.popup.querySelectorAll('.scrubber');
        scrubbers.forEach(el => this.scrubberController.bindToElement(el));
    }

    // ========================================
    // Abstract methods - subclasses implement
    // ========================================

    /**
     * Get the CSS class name for this popup.
     * @returns {string}
     */
    getClassName() {
        throw new Error('Subclass must implement getClassName()');
    }

    /**
     * Build the inner HTML for this popup.
     * @param {Object} target - The element being edited
     * @returns {string}
     */
    buildHTML(target) {
        throw new Error('Subclass must implement buildHTML()');
    }

    /**
     * Bind element-specific event handlers.
     * Called after popup is created and positioned.
     */
    bindEvents() {
        // Override in subclass
    }

    /**
     * Get property configurations for scrubbers.
     * @returns {Object} - { [property]: { min, max, sensitivity, round?, format } }
     */
    getPropertyConfigs() {
        return {};
    }

    // ========================================
    // Hooks for property access - subclasses can override
    // ========================================

    /**
     * Get a property value from the target.
     * Override for custom getter logic (e.g., computed values).
     * @param {string} property
     * @returns {*}
     */
    getTargetProperty(property) {
        return this.target?.[property] ?? 0;
    }

    /**
     * Set a property value on the target.
     * Override for custom setter logic (e.g., using setMass()).
     * @param {string} property
     * @param {*} value
     */
    setTargetProperty(property, value) {
        if (this.target) {
            this.target[property] = value;
        }
    }

    /**
     * Called when a property value changes via scrubber.
     * Override to dispatch callbacks (e.g., this.onMassChange?.(value)).
     * @param {string} property
     * @param {*} value
     */
    onPropertyChange(property, value) {
        // Override in subclass to call appropriate callbacks
    }

    // ========================================
    // Helper methods for buildHTML
    // ========================================

    /**
     * Render a scrubber control.
     * @param {string} property - Property name (used as data-property)
     * @param {string} label - Display label
     * @param {string} value - Formatted value string
     * @param {string} [tooltip] - Optional tooltip text shown on hover
     * @returns {string}
     */
    renderScrubber(property, label, value, tooltip) {
        const labelHtml = tooltip
            ? `<span class="term" data-tooltip="${this.escapeHtml(tooltip)}">${label}</span>`
            : label;
        return `
            <div class="scrubber-row">
                <label class="scrubber-label">${labelHtml}</label>
                <div class="scrubber" data-property="${property}">
                    <div class="scrubber-track">
                        <div class="scrubber-thumb"></div>
                    </div>
                    <span class="scrubber-value">${value}</span>
                </div>
            </div>
        `;
    }

    /**
     * Escape HTML special characters for safe attribute insertion.
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Render an action row (button).
     * @param {string} action - Action identifier (used as data-action)
     * @param {string} icon - Emoji or icon
     * @param {string} label - Button text
     * @param {Object} [options] - { isDelete: boolean, className: string }
     * @returns {string}
     */
    renderActionRow(action, icon, label, options = {}) {
        const baseClass = this.getActionRowClass();
        const deleteClass = options.isDelete ? ` ${baseClass}--delete` : '';
        const extraClass = options.className ? ` ${options.className}` : '';
        return `<div class="${baseClass}${deleteClass}${extraClass}" data-action="${action}">${icon}  ${label}</div>`;
    }

    /**
     * Get the base CSS class for action rows.
     * Uses the first class name from getClassName() to handle multi-class popups.
     * Override in subclass for custom class prefix.
     * @returns {string}
     */
    getActionRowClass() {
        const className = this.getClassName();
        const baseClass = className.split(' ')[0];  // Handle multi-class names like 'node-popup multi-node-popup'
        return `${baseClass}-action-row`;
    }

    /**
     * Render a toggle control with label and hint.
     * @param {string} property - Property name (used as data-property)
     * @param {string} label - Toggle label
     * @param {string} hint - Help text
     * @param {boolean} checked - Whether toggle is checked
     * @returns {string}
     */
    renderToggle(property, label, hint, checked) {
        const className = `${this.getClassName()}-toggle`;
        return `
            <label class="${className}">
                <input type="checkbox" data-property="${property}" ${checked ? 'checked' : ''}>
                <span class="toggle-label">${label}</span>
                <span class="toggle-hint">${hint}</span>
            </label>
        `;
    }
}
