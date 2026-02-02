/**
 * Node Popup - Popup for editing node properties
 * Extends PopupBase for shared lifecycle and scrubber handling
 */

import { PopupBase } from './popup/popup-base.js';

export class NodePopup extends PopupBase {
    constructor() {
        super();
        this.onMassChange = null;
        this.onAngularStiffnessChange = null;
        this.onPinToggle = null;
    }

    /**
     * Show popup for a node. Non-editable nodes (e.g., ground anchors) are skipped.
     * @param {Object} node - The node to edit
     * @param {number} x - Screen X position
     * @param {number} y - Screen Y position
     */
    show(node, x, y) {
        if (!node.isEditable) return;
        super.show(node, x, y);
    }

    /**
     * Get the node being edited.
     * @returns {Object|null}
     */
    get node() {
        return this.target;
    }

    getClassName() {
        return 'node-popup';
    }

    getPropertyConfigs() {
        return {
            mass: {
                min: 0.1,
                max: 100,
                sensitivity: 0.2,
                round: v => Math.round(v * 10) / 10,
                format: v => `${v.toFixed(1)} kg`
            },
            angularStiffness: {
                min: 0,
                max: 1,
                sensitivity: 0.005,
                format: v => v === 0 ? 'Free' : v === 1 ? 'Locked' : v.toFixed(2)
            }
        };
    }

    buildHTML(node) {
        const stiffnessLabel = this.getPropertyConfigs().angularStiffness.format(node.angularStiffness);

        return `
            <div class="node-popup-header">
                <span class="node-popup-title">Node #${node.id}</span>
            </div>
            <div class="node-popup-controls">
                ${this.renderScrubber('mass', 'Mass', `${node.mass.toFixed(1)} kg`)}
                ${this.renderScrubber('angularStiffness', 'Joint Stiffness', stiffnessLabel)}
                <div class="node-popup-action-row" data-action="pin">
                    ${node.fixed ? '🔓  Unpin Node' : '📌  Pin Node'}
                </div>
                <div class="node-popup-action-row node-popup-delete-row" data-action="delete">
                    🗑️  Delete Node
                </div>
            </div>
        `;
    }

    setTargetProperty(property, value) {
        if (!this.target) return;

        if (property === 'mass') {
            this.target.setMass(value);
        } else if (property === 'angularStiffness') {
            this.target.setAngularStiffness(value);
        }
    }

    onPropertyChange(property, value) {
        if (property === 'mass') {
            this.onMassChange?.(value);
        } else if (property === 'angularStiffness') {
            this.onAngularStiffnessChange?.(value);
        }
    }

    bindEvents() {
        // Pin toggle
        const pinRow = this.popup.querySelector('[data-action="pin"]');
        pinRow?.addEventListener('click', () => {
            this.onPinToggle?.(this.target);
            // Update the label
            pinRow.textContent = this.target.fixed ? '🔓  Unpin Node' : '📌  Pin Node';
        });

        // Delete action
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.target);
            this.close();
        });
    }
}
