/**
 * Multi-Node Popup - Popup for editing multiple selected nodes
 * Extends PopupBase for shared lifecycle and scrubber handling
 */

import { PopupBase } from './popup/popup-base.js';

export class MultiNodePopup extends PopupBase {
    constructor() {
        super();
        this.onMassChange = null;
        this.onPinToggle = null;
    }

    /**
     * Get the nodes being edited.
     * @returns {Array|null}
     */
    get nodes() {
        return this.target;
    }

    getClassName() {
        return 'node-popup multi-node-popup';
    }

    getPropertyConfigs() {
        return {
            mass: {
                min: 0.1,
                max: 100,
                sensitivity: 0.2,
                round: v => Math.round(v * 10) / 10,
                format: v => `${v.toFixed(1)} kg`
            }
        };
    }

    /**
     * Get average mass of all nodes (for scrubber initial value).
     */
    getTargetProperty(property) {
        if (!this.target || !Array.isArray(this.target)) return 0;

        if (property === 'mass') {
            const totalMass = this.target.reduce((sum, n) => sum + n.mass, 0);
            return totalMass / this.target.length;
        }
        return 0;
    }

    /**
     * Set property on all nodes.
     */
    setTargetProperty(property, value) {
        if (!this.target || !Array.isArray(this.target)) return;

        if (property === 'mass') {
            for (const node of this.target) {
                node.setMass(value);
            }
        }
    }

    onPropertyChange(property, value) {
        if (property === 'mass') {
            this.onMassChange?.(value);
        }
    }

    buildHTML(nodes) {
        const count = nodes.length;
        const pinnedCount = nodes.filter(n => n.fixed).length;
        const allPinned = pinnedCount === count;
        const avgMass = this.getTargetProperty('mass');

        return `
            <div class="node-popup-header">
                <span class="node-popup-title">${count} Nodes Selected</span>
            </div>
            <div class="node-popup-controls">
                <div class="multi-node-info">
                    <span>Pinned: ${pinnedCount} / ${count}</span>
                </div>
                ${this.renderScrubber('mass', 'Mass (each)', `${avgMass.toFixed(1)} kg`)}
                <div class="node-popup-action-row" data-action="pin">
                    ${allPinned ? '🔓  Unpin All' : '📌  Pin All'}
                </div>
                <div class="node-popup-action-row node-popup-delete-row" data-action="delete">
                    🗑️  Delete All
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Pin toggle
        const pinRow = this.popup.querySelector('[data-action="pin"]');
        pinRow?.addEventListener('click', () => {
            const allPinned = this.target.every(n => n.fixed);
            const newState = !allPinned;
            for (const node of this.target) {
                node.setFixed(newState);
            }
            // Update the label and info
            pinRow.textContent = newState ? '🔓  Unpin All' : '📌  Pin All';
            const infoEl = this.popup.querySelector('.multi-node-info span');
            if (infoEl) {
                const pinnedCount = this.target.filter(n => n.fixed).length;
                infoEl.textContent = `Pinned: ${pinnedCount} / ${this.target.length}`;
            }
            this.onPinToggle?.(this.target);
        });

        // Delete action
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.target);
            this.close();
        });
    }
}
