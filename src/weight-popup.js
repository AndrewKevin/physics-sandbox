/**
 * Weight Popup - Custom popup with scrubber controls for weight properties
 */

import { Weight } from './structure.js';

export class WeightPopup {
    constructor() {
        this.popup = null;
        this.weight = null;
        this.onMassChange = null;
        this.onPositionChange = null;
        this.onDelete = null;
        this.onClose = null;

        // Scrubber state
        this.activeScrubber = null;
        this.scrubStartX = 0;
        this.scrubStartValue = 0;

        // Bind handlers
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    /**
     * Show popup for a weight at the given position.
     */
    show(weight, x, y) {
        this.close();
        this.weight = weight;

        // Create popup element
        this.popup = document.createElement('div');
        this.popup.className = 'weight-popup';
        this.popup.innerHTML = this.buildHTML(weight);

        // Position popup
        document.body.appendChild(this.popup);
        this.positionPopup(x, y);

        // Bind events
        this.bindEvents();

        // Close on click outside (delayed to avoid immediate close)
        setTimeout(() => {
            document.addEventListener('mousedown', this.handleClickOutside);
        }, 10);
    }

    buildHTML(weight) {
        const showPosition = weight.attachedToSegment !== null;

        return `
            <div class="weight-popup-header">
                <span class="weight-popup-title">Weight #${weight.id}</span>
                <button class="weight-popup-delete" title="Delete weight">✕</button>
            </div>
            <div class="weight-popup-controls">
                <div class="scrubber-row">
                    <label class="scrubber-label">Mass</label>
                    <div class="scrubber" data-property="mass">
                        <div class="scrubber-track">
                            <div class="scrubber-thumb"></div>
                        </div>
                        <span class="scrubber-value">${weight.mass.toFixed(0)} kg</span>
                    </div>
                </div>
                ${showPosition ? `
                <div class="scrubber-row">
                    <label class="scrubber-label">Position</label>
                    <div class="scrubber" data-property="position">
                        <div class="scrubber-track">
                            <div class="scrubber-thumb"></div>
                        </div>
                        <span class="scrubber-value">${Math.round(weight.position * 100)}%</span>
                    </div>
                </div>
                ` : ''}
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
        // Delete button
        const deleteBtn = this.popup.querySelector('.weight-popup-delete');
        deleteBtn?.addEventListener('click', () => {
            this.onDelete?.(this.weight);
            this.close();
        });

        // Scrubbers - mouse and touch events
        const scrubbers = this.popup.querySelectorAll('.scrubber');
        scrubbers.forEach(scrubber => {
            scrubber.addEventListener('mousedown', (e) => this.startScrub(e, scrubber));
            scrubber.addEventListener('touchstart', (e) => this.startScrubTouch(e, scrubber), { passive: false });
        });
    }

    startScrub(e, scrubber) {
        e.preventDefault();
        this.activeScrubber = scrubber;
        this.scrubStartX = e.clientX;

        const property = scrubber.dataset.property;
        if (property === 'mass') {
            this.scrubStartValue = this.weight.mass;
        } else if (property === 'position') {
            this.scrubStartValue = this.weight.position;
        }

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
        if (property === 'mass') {
            this.scrubStartValue = this.weight.mass;
        } else if (property === 'position') {
            this.scrubStartValue = this.weight.position;
        }

        // Add visual feedback
        scrubber.classList.add('scrubbing');

        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd);
    }

    handleMouseMove(e) {
        if (!this.activeScrubber) return;

        const dx = e.clientX - this.scrubStartX;
        const property = this.activeScrubber.dataset.property;
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        const valueEl = this.activeScrubber.querySelector('.scrubber-value');

        // Move thumb (clamped to track width)
        const maxOffset = 30;
        const thumbOffset = Math.max(-maxOffset, Math.min(maxOffset, dx));
        thumb.style.transform = `translateX(${thumbOffset}px)`;

        // Calculate new value based on drag distance
        // Sensitivity: 1 pixel = 0.5 mass units or 0.5% position
        if (property === 'mass') {
            const sensitivity = 0.5;
            const newMass = Math.max(Weight.minMass, Math.min(Weight.maxMass, this.scrubStartValue + dx * sensitivity));
            this.weight.mass = Math.round(newMass);
            valueEl.textContent = `${this.weight.mass} kg`;
            this.onMassChange?.(this.weight.mass);
        } else if (property === 'position') {
            const sensitivity = 0.005;
            const newPos = Math.max(0, Math.min(1, this.scrubStartValue + dx * sensitivity));
            this.weight.setPosition(newPos);
            valueEl.textContent = `${Math.round(this.weight.position * 100)}%`;
            this.onPositionChange?.(this.weight.position);
        }
    }

    handleMouseUp() {
        if (!this.activeScrubber) return;

        // Spring thumb back to center
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        thumb.style.transform = 'translateX(0)';

        // Update start value for next drag
        const property = this.activeScrubber.dataset.property;
        if (property === 'mass') {
            this.scrubStartValue = this.weight.mass;
        } else if (property === 'position') {
            this.scrubStartValue = this.weight.position;
        }

        this.activeScrubber.classList.remove('scrubbing');
        this.activeScrubber = null;

        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleTouchMove(e) {
        if (!this.activeScrubber || e.touches.length !== 1) return;
        e.preventDefault();

        const dx = e.touches[0].clientX - this.scrubStartX;
        const property = this.activeScrubber.dataset.property;
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        const valueEl = this.activeScrubber.querySelector('.scrubber-value');

        // Move thumb (clamped to track width)
        const maxOffset = 30;
        const thumbOffset = Math.max(-maxOffset, Math.min(maxOffset, dx));
        thumb.style.transform = `translateX(${thumbOffset}px)`;

        // Calculate new value based on drag distance
        if (property === 'mass') {
            const sensitivity = 0.5;
            const newMass = Math.max(Weight.minMass, Math.min(Weight.maxMass, this.scrubStartValue + dx * sensitivity));
            this.weight.mass = Math.round(newMass);
            valueEl.textContent = `${this.weight.mass} kg`;
            this.onMassChange?.(this.weight.mass);
        } else if (property === 'position') {
            const sensitivity = 0.005;
            const newPos = Math.max(0, Math.min(1, this.scrubStartValue + dx * sensitivity));
            this.weight.setPosition(newPos);
            valueEl.textContent = `${Math.round(this.weight.position * 100)}%`;
            this.onPositionChange?.(this.weight.position);
        }
    }

    handleTouchEnd() {
        if (!this.activeScrubber) return;

        // Spring thumb back to center
        const thumb = this.activeScrubber.querySelector('.scrubber-thumb');
        thumb.style.transform = 'translateX(0)';

        // Update start value for next drag
        const property = this.activeScrubber.dataset.property;
        if (property === 'mass') {
            this.scrubStartValue = this.weight.mass;
        } else if (property === 'position') {
            this.scrubStartValue = this.weight.position;
        }

        this.activeScrubber.classList.remove('scrubbing');
        this.activeScrubber = null;

        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }

    handleClickOutside(e) {
        if (this.popup && !this.popup.contains(e.target)) {
            this.close();
        }
    }

    close() {
        if (this.popup) {
            this.popup.remove();
            this.popup = null;
        }
        this.weight = null;
        this.activeScrubber = null;

        document.removeEventListener('mousedown', this.handleClickOutside);
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
