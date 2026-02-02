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
        this.onContractionRatioChange = null;
        this.onBreakOnOverloadChange = null;
        this.onAddNode = null;
        this.onAddWeight = null;
        this.onDelete = null;
        this.onClose = null;

        // Scrubber state
        this.activeScrubber = null;
        this.scrubStartX = 0;
        this.scrubStartValue = 0;

        // Bind handlers
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
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
        const muscleControls = isMuscle ? `
            <div class="segment-popup-section segment-muscle-section">
                <label class="segment-popup-label">Muscle Properties</label>
                <div class="scrubber-row">
                    <label class="scrubber-label">Target</label>
                    <div class="scrubber" data-property="contractionRatio">
                        <div class="scrubber-track">
                            <div class="scrubber-thumb"></div>
                        </div>
                        <span class="scrubber-value">${Math.round(segment.contractionRatio * 100)}%</span>
                    </div>
                </div>
                <label class="segment-popup-toggle">
                    <input type="checkbox" data-property="breakOnOverload" ${segment.breakOnOverload ? 'checked' : ''}>
                    <span class="toggle-label">Break on Overload</span>
                    <span class="toggle-hint">Permanently go slack at 100% stress</span>
                </label>
            </div>
        ` : '';

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
                    // Update UI to reflect change (including muscle controls visibility)
                    this.updateMaterialSelection(material);
                }
            });
        });

        // Scrubbers - mouse and touch events (for muscle properties)
        const scrubbers = this.popup.querySelectorAll('.scrubber');
        scrubbers.forEach(scrubber => {
            scrubber.addEventListener('mousedown', (e) => this.startScrub(e, scrubber));
            scrubber.addEventListener('touchstart', (e) => this.startScrubTouch(e, scrubber), { passive: false });
        });

        // Break on overload toggle
        const breakToggle = this.popup.querySelector('[data-property="breakOnOverload"]');
        breakToggle?.addEventListener('change', (e) => {
            this.segment.setBreakOnOverload(e.target.checked);
            this.onBreakOnOverloadChange?.(this.segment.breakOnOverload);
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

    startScrub(e, scrubber) {
        e.preventDefault();
        this.activeScrubber = scrubber;
        this.scrubStartX = e.clientX;

        const property = scrubber.dataset.property;
        this.scrubStartValue = this.segment[property];

        // Add visual feedback
        scrubber.classList.add('scrubbing');

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }

    startScrubTouch(e, scrubber) {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        this.activeScrubber = scrubber;
        this.scrubStartX = e.touches[0].clientX;

        const property = scrubber.dataset.property;
        this.scrubStartValue = this.segment[property];

        // Add visual feedback
        scrubber.classList.add('scrubbing');

        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);
    }

    handleMouseMove(e) {
        if (!this.activeScrubber) return;

        const dx = e.clientX - this.scrubStartX;
        this.updateScrubValue(dx);
    }

    handleTouchMove(e) {
        if (!this.activeScrubber || e.touches.length !== 1) return;
        e.preventDefault();

        const dx = e.touches[0].clientX - this.scrubStartX;
        this.updateScrubValue(dx);
    }

    updateScrubValue(dx) {
        const property = this.activeScrubber.dataset.property;
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        const valueEl = this.activeScrubber.querySelector('.scrubber-value');

        // Move thumb (clamped to track width)
        const maxOffset = 30;
        const thumbOffset = Math.max(-maxOffset, Math.min(maxOffset, dx));
        thumb.style.transform = `translateX(${thumbOffset}px)`;

        // Sensitivity: 1 pixel = 0.005 (full range over ~200px)
        const sensitivity = 0.005;
        const newValue = this.scrubStartValue + dx * sensitivity;

        // Apply to segment with appropriate setter
        if (property === 'contractionRatio') {
            this.segment.setContractionRatio(newValue);
            valueEl.textContent = `${Math.round(this.segment.contractionRatio * 100)}%`;
            this.onContractionRatioChange?.(this.segment.contractionRatio);
        }
    }

    handleMouseUp() {
        this.endScrub();
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleTouchEnd() {
        this.endScrub();
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }

    endScrub() {
        if (!this.activeScrubber) return;

        // Spring thumb back to center
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        thumb.style.transform = 'translateX(0)';

        // Update start value for next drag
        const property = this.activeScrubber.dataset.property;
        this.scrubStartValue = this.segment[property];

        this.activeScrubber.classList.remove('scrubbing');
        this.activeScrubber = null;
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

        // Show/hide muscle controls based on material type
        const isMuscle = MATERIALS[newMaterial]?.isActive;
        let muscleSection = this.popup.querySelector('.segment-muscle-section');

        if (isMuscle && !muscleSection) {
            // Add muscle controls if switching to muscle
            const muscleHTML = `
                <div class="segment-popup-section segment-muscle-section">
                    <label class="segment-popup-label">Muscle Properties</label>
                    <div class="scrubber-row">
                        <label class="scrubber-label">Target</label>
                        <div class="scrubber" data-property="contractionRatio">
                            <div class="scrubber-track">
                                <div class="scrubber-thumb"></div>
                            </div>
                            <span class="scrubber-value">${Math.round(this.segment.contractionRatio * 100)}%</span>
                        </div>
                    </div>
                    <label class="segment-popup-toggle">
                        <input type="checkbox" data-property="breakOnOverload" ${this.segment.breakOnOverload ? 'checked' : ''}>
                        <span class="toggle-label">Break on Overload</span>
                        <span class="toggle-hint">Permanently go slack at 100% stress</span>
                    </label>
                </div>
            `;

            // Insert after material section
            const materialSection = this.popup.querySelector('.segment-popup-section');
            materialSection.insertAdjacentHTML('afterend', muscleHTML);

            // Bind scrubber events for new controls
            muscleSection = this.popup.querySelector('.segment-muscle-section');
            const scrubbers = muscleSection.querySelectorAll('.scrubber');
            scrubbers.forEach(scrubber => {
                scrubber.addEventListener('mousedown', (e) => this.startScrub(e, scrubber));
                scrubber.addEventListener('touchstart', (e) => this.startScrubTouch(e, scrubber), { passive: false });
            });

            // Bind break toggle event
            const breakToggle = muscleSection.querySelector('[data-property="breakOnOverload"]');
            breakToggle?.addEventListener('change', (e) => {
                this.segment.setBreakOnOverload(e.target.checked);
                this.onBreakOnOverloadChange?.(this.segment.breakOnOverload);
            });
        } else if (!isMuscle && muscleSection) {
            // Remove muscle controls if switching away from muscle
            muscleSection.remove();
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
        this.activeScrubber = null;

        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);

        this.onClose?.();
    }

    isOpen() {
        return this.popup !== null;
    }
}
