/**
 * Segment Popup - Popup for editing segment properties
 * Extends PopupBase for shared lifecycle and scrubber handling
 */

import { PopupBase } from './popup/popup-base.js';
import { MATERIALS, MATERIAL_ORDER } from './materials.js';
import { TERMS } from './terminology.js';

export class SegmentPopup extends PopupBase {
    constructor() {
        super();
        this.clickPos = null; // Canvas position where right-click occurred

        // Segment-specific callbacks
        this.onMaterialChange = null;
        this.onStiffnessChange = null;
        this.onDampingChange = null;
        this.onContractionRatioChange = null;
        this.onBreakOnOverloadChange = null;
        this.onAddNode = null;
        this.onAddWeight = null;
    }

    /**
     * Get the segment being edited.
     * @returns {Object|null}
     */
    get segment() {
        return this.target;
    }

    /**
     * Show popup for a segment at the given position.
     * @param {Object} segment - The segment to edit
     * @param {number} clientX - Screen X position for popup
     * @param {number} clientY - Screen Y position for popup
     * @param {Object} clickPos - Canvas position { x, y } where clicked
     */
    show(segment, clientX, clientY, clickPos) {
        this.clickPos = clickPos;
        super.show(segment, clientX, clientY);
    }

    getClassName() {
        return 'segment-popup';
    }

    getPropertyConfigs() {
        return {
            stiffness: {
                min: 0,
                max: 1,
                sensitivity: 0.005,
                format: v => v.toFixed(2)
            },
            damping: {
                min: 0,
                max: 1,
                sensitivity: 0.005,
                format: v => v.toFixed(2)
            },
            contractionRatio: {
                min: 0.2,
                max: 1.0,
                sensitivity: 0.005,
                format: v => `${Math.round(v * 100)}%`
            }
        };
    }

    setTargetProperty(property, value) {
        if (!this.target) return;

        if (property === 'stiffness') {
            this.target.stiffness = value;
        } else if (property === 'damping') {
            this.target.damping = value;
        } else if (property === 'contractionRatio') {
            this.target.setContractionRatio(value);
        }
    }

    onPropertyChange(property, value) {
        if (property === 'stiffness') {
            this.onStiffnessChange?.(this.target?.stiffness);
        } else if (property === 'damping') {
            this.onDampingChange?.(this.target?.damping);
        } else if (property === 'contractionRatio') {
            this.onContractionRatioChange?.(this.target?.contractionRatio);
        }
    }

    buildHTML(segment) {
        const currentMat = MATERIALS[segment.material];
        const materialLabel = currentMat?.label || segment.material;
        const isMuscle = currentMat?.isActive;

        // Build material buttons
        const materialButtons = MATERIAL_ORDER.map(key => {
            const mat = MATERIALS[key];
            const isSelected = segment.material === key;
            const selectedClass = isSelected ? 'selected' : '';
            return `<button class="segment-material-btn ${selectedClass}" data-material="${key}" title="${mat.label}">
                ${mat.shortLabel}
            </button>`;
        }).join('');

        // Muscle-specific controls (only shown for active/muscle materials)
        const muscleControls = isMuscle ? this.buildMuscleControls(segment) : '';

        return `
            <div class="segment-popup-header">
                <span class="segment-popup-title">Segment #${segment.id}</span>
                <span class="segment-popup-material">${materialLabel}</span>
            </div>
            <div class="segment-popup-controls">
                <div class="segment-popup-section segment-material-section">
                    <label class="segment-popup-label">Material</label>
                    <div class="segment-material-selector">
                        ${materialButtons}
                    </div>
                </div>
                <div class="segment-popup-section segment-physics-section">
                    <label class="segment-popup-label">Physics</label>
                    ${this.renderScrubber('stiffness', 'Stiffness', segment.stiffness.toFixed(2), TERMS.stiffness)}
                    ${this.renderScrubber('damping', 'Damping', segment.damping.toFixed(2), TERMS.damping)}
                </div>
                ${muscleControls}
                <div class="segment-popup-action-row" data-action="add-node">
                    📍  Add Node Here
                </div>
                <div class="segment-popup-action-row" data-action="add-weight">
                    ⚖️  Add Weight Here
                </div>
                <div class="segment-popup-action-row segment-popup-delete-row" data-action="delete">
                    🗑️  Delete Segment
                </div>
            </div>
        `;
    }

    buildMuscleControls(segment) {
        return `
            <div class="segment-popup-section segment-muscle-section">
                <label class="segment-popup-label">Muscle Properties</label>
                ${this.renderScrubber('contractionRatio', 'Target', `${Math.round(segment.contractionRatio * 100)}%`, TERMS.contractionRatio)}
                <label class="segment-popup-toggle">
                    <input type="checkbox" data-property="breakOnOverload" ${segment.breakOnOverload ? 'checked' : ''}>
                    <span class="toggle-label">Break on Overload</span>
                    <span class="toggle-hint">${TERMS.breakOnOverload}</span>
                </label>
            </div>
        `;
    }

    bindEvents() {
        // Material buttons
        const materialBtns = this.popup.querySelectorAll('.segment-material-btn');
        materialBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const material = btn.dataset.material;
                if (material !== this.target.material) {
                    this.onMaterialChange?.(this.target, material);
                    this.updateMaterialSelection(material);
                }
            });
        });

        // Break on overload toggle
        this.bindBreakOnOverloadToggle();

        // Add Node action
        const addNodeRow = this.popup.querySelector('[data-action="add-node"]');
        addNodeRow?.addEventListener('click', () => {
            this.onAddNode?.(this.target, this.clickPos);
            this.close();
        });

        // Add Weight action
        const addWeightRow = this.popup.querySelector('[data-action="add-weight"]');
        addWeightRow?.addEventListener('click', () => {
            this.onAddWeight?.(this.target, this.clickPos);
            this.close();
        });

        // Delete action
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.target);
            this.close();
        });
    }

    bindBreakOnOverloadToggle() {
        const breakToggle = this.popup.querySelector('[data-property="breakOnOverload"]');
        breakToggle?.addEventListener('change', (e) => {
            this.target.setBreakOnOverload(e.target.checked);
            this.onBreakOnOverloadChange?.(this.target.breakOnOverload);
        });
    }

    /**
     * Update the visual selection state of material buttons and rebuild muscle controls if needed.
     */
    updateMaterialSelection(newMaterial) {
        const materialBtns = this.popup.querySelectorAll('.segment-material-btn');
        materialBtns.forEach(btn => {
            const isSelected = btn.dataset.material === newMaterial;
            btn.classList.toggle('selected', isSelected);
        });

        // Update the header material label
        const materialLabel = this.popup.querySelector('.segment-popup-material');
        if (materialLabel) {
            const mat = MATERIALS[newMaterial];
            materialLabel.textContent = mat?.label || newMaterial;
        }

        // Update physics scrubbers (stiffness/damping reset to material defaults)
        this.updateScrubberDisplay('stiffness', this.target.stiffness.toFixed(2));
        this.updateScrubberDisplay('damping', this.target.damping.toFixed(2));

        // Show/hide muscle controls based on material type
        const isMuscle = MATERIALS[newMaterial]?.isActive;
        let muscleSection = this.popup.querySelector('.segment-muscle-section');

        if (isMuscle && !muscleSection) {
            // Add muscle controls if switching to muscle
            const muscleHTML = this.buildMuscleControls(this.target);

            // Insert after physics section
            const physicsSection = this.popup.querySelector('.segment-physics-section');
            physicsSection.insertAdjacentHTML('afterend', muscleHTML);

            // Bind new scrubber to controller
            muscleSection = this.popup.querySelector('.segment-muscle-section');
            const scrubbers = muscleSection.querySelectorAll('.scrubber');
            scrubbers.forEach(el => this.scrubberController?.bindToElement(el));

            // Bind break toggle
            this.bindBreakOnOverloadToggle();
        } else if (!isMuscle && muscleSection) {
            // Remove muscle controls if switching away from muscle
            muscleSection.remove();
            // Clean up stale scrubber bindings
            this.scrubberController?.cleanupRemovedElements();
        }
    }

    /**
     * Update the displayed value of a scrubber.
     * @param {string} property - Property name (data-property attribute)
     * @param {string} formattedValue - Formatted value string to display
     */
    updateScrubberDisplay(property, formattedValue) {
        const scrubber = this.popup?.querySelector(`.scrubber[data-property="${property}"]`);
        const valueEl = scrubber?.querySelector('.scrubber-value');
        if (valueEl) {
            valueEl.textContent = formattedValue;
        }
    }

    close() {
        this.clickPos = null;
        super.close();
    }
}
