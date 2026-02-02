/**
 * Segment Popup - Custom popup for segment properties
 * Matches the styling of NodePopup and WeightPopup
 */

import { MATERIALS, MATERIAL_ORDER } from './materials.js';

export class SegmentPopup {
    constructor() {
        this.popup = null;
        this.segment = null;
        this.clickPos = null;  // Canvas position where right-click occurred

        // Callbacks
        this.onMaterialChange = null;
        this.onAddNode = null;
        this.onAddWeight = null;
        this.onDelete = null;
        this.onClose = null;

        // Bind handlers
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Show popup for a segment at the given position.
     * @param {Object} segment - The segment to edit
     * @param {number} clientX - Screen X position for popup
     * @param {number} clientY - Screen Y position for popup
     * @param {Object} clickPos - Canvas position { x, y } where clicked
     */
    show(segment, clientX, clientY, clickPos) {
        this.close();
        this.segment = segment;
        this.clickPos = clickPos;

        // Create popup element
        this.popup = document.createElement('div');
        this.popup.className = 'segment-popup';
        this.popup.innerHTML = this.buildHTML(segment);

        // Position popup
        document.body.appendChild(this.popup);
        this.positionPopup(clientX, clientY);

        // Bind events
        this.bindEvents();

        // Close on click outside or Escape (delayed to avoid immediate close)
        setTimeout(() => {
            document.addEventListener('mousedown', this.handleClickOutside);
            document.addEventListener('keydown', this.handleKeyDown);
        }, 10);
    }

    buildHTML(segment) {
        const currentMat = MATERIALS[segment.material];
        const materialLabel = currentMat?.label || segment.material;

        // Build material buttons
        const materialButtons = MATERIAL_ORDER.map(key => {
            const mat = MATERIALS[key];
            const isSelected = segment.material === key;
            const selectedClass = isSelected ? 'selected' : '';
            return `<button class="segment-material-btn ${selectedClass}" data-material="${key}" title="${mat.label}">
                ${mat.shortLabel}
            </button>`;
        }).join('');

        return `
            <div class="segment-popup-header">
                <span class="segment-popup-title">Segment #${segment.id}</span>
                <span class="segment-popup-material">${materialLabel}</span>
            </div>
            <div class="segment-popup-controls">
                <div class="segment-popup-section">
                    <label class="segment-popup-label">Material</label>
                    <div class="segment-material-selector">
                        ${materialButtons}
                    </div>
                </div>
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

    positionPopup(x, y) {
        const popup = this.popup;
        const rect = popup.getBoundingClientRect();
        const padding = 10;

        // Adjust position to keep popup in viewport
        let left = x + padding;
        let top = y + padding;

        if (left + rect.width > window.innerWidth) {
            left = x - rect.width - padding;
        }
        if (top + rect.height > window.innerHeight) {
            top = y - rect.height - padding;
        }

        popup.style.left = `${Math.max(padding, left)}px`;
        popup.style.top = `${Math.max(padding, top)}px`;
    }

    bindEvents() {
        // Material buttons
        const materialBtns = this.popup.querySelectorAll('.segment-material-btn');
        materialBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const material = btn.dataset.material;
                if (material !== this.segment.material) {
                    this.onMaterialChange?.(this.segment, material);
                    // Update UI to reflect change
                    this.updateMaterialSelection(material);
                }
            });
        });

        // Add Node action
        const addNodeRow = this.popup.querySelector('[data-action="add-node"]');
        addNodeRow?.addEventListener('click', () => {
            this.onAddNode?.(this.segment, this.clickPos);
            this.close();
        });

        // Add Weight action
        const addWeightRow = this.popup.querySelector('[data-action="add-weight"]');
        addWeightRow?.addEventListener('click', () => {
            this.onAddWeight?.(this.segment, this.clickPos);
            this.close();
        });

        // Delete action
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.segment);
            this.close();
        });
    }

    /**
     * Update the visual selection state of material buttons.
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
    }

    handleClickOutside(e) {
        if (this.popup && !this.popup.contains(e.target)) {
            this.close();
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    close() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
        this.segment = null;
        this.clickPos = null;

        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyDown);

        this.onClose?.();
    }

    isOpen() {
        return this.popup !== null;
    }
}
