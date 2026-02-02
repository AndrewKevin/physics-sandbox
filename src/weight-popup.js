/**
 * Weight Popup - Popup for editing weight properties
 * Extends PopupBase for shared lifecycle and scrubber handling
 */

import { PopupBase } from './popup/popup-base.js';
import { Weight } from './structure.js';

export class WeightPopup extends PopupBase {
    constructor() {
        super();
        this.onMassChange = null;
        this.onPositionChange = null;
    }

    /**
     * Get the weight being edited.
     * @returns {Object|null}
     */
    get weight() {
        return this.target;
    }

    getClassName() {
        return 'weight-popup';
    }

    getPropertyConfigs() {
        return {
            mass: {
                min: Weight.minMass,
                max: Weight.maxMass,
                sensitivity: 0.5,
                round: Math.round,
                format: v => `${v} kg`
            },
            position: {
                min: 0,
                max: 1,
                sensitivity: 0.005,
                format: v => `${Math.round(v * 100)}%`
            }
        };
    }

    buildHTML(weight) {
        const showPosition = weight.attachedToSegment !== null;

        return `
            <div class="weight-popup-header">
                <span class="weight-popup-title">Weight #${weight.id}</span>
            </div>
            <div class="weight-popup-controls">
                ${this.renderScrubber('mass', 'Mass', `${weight.mass.toFixed(0)} kg`)}
                ${showPosition ? this.renderScrubber('position', 'Position', `${Math.round(weight.position * 100)}%`) : ''}
                <div class="weight-popup-delete-row" data-action="delete">🗑️  Delete Weight</div>
            </div>
        `;
    }

    setTargetProperty(property, value) {
        if (!this.target) return;

        if (property === 'mass') {
            this.target.mass = value;
        } else if (property === 'position') {
            this.target.setPosition(value);
        }
    }

    onPropertyChange(property, value) {
        if (property === 'mass') {
            this.onMassChange?.(value);
        } else if (property === 'position') {
            this.onPositionChange?.(this.target?.position);
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
