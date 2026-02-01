/**
 * Multi-Node Popup - Custom popup with controls for multiple selected nodes
 */

export class MultiNodePopup {
    constructor() {
        this.popup = null;
        this.nodes = null;
        this.onMassChange = null;
        this.onPinToggle = null;
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
     * Show popup for multiple nodes at the given position.
     */
    show(nodes, x, y) {
        this.close();
        this.nodes = nodes;

        // Create popup element
        this.popup = document.createElement('div');
        this.popup.className = 'node-popup multi-node-popup';
        this.popup.innerHTML = this.buildHTML(nodes);

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

    buildHTML(nodes) {
        const count = nodes.length;
        const pinnedCount = nodes.filter(n => n.fixed).length;
        const allPinned = pinnedCount === count;
        const totalMass = nodes.reduce((sum, n) => sum + n.mass, 0);
        const avgMass = totalMass / count;

        return `
            <div class="node-popup-header">
                <span class="node-popup-title">${count} Nodes Selected</span>
            </div>
            <div class="node-popup-controls">
                <div class="multi-node-info">
                    <span>Pinned: ${pinnedCount} / ${count}</span>
                </div>
                <div class="scrubber-row">
                    <label class="scrubber-label">Mass (each)</label>
                    <div class="scrubber" data-property="mass">
                        <div class="scrubber-track">
                            <div class="scrubber-thumb"></div>
                        </div>
                        <span class="scrubber-value">${avgMass.toFixed(1)} kg</span>
                    </div>
                </div>
                <div class="node-popup-action-row" data-action="pin">
                    ${allPinned ? '🔓  Unpin All' : '📌  Pin All'}
                </div>
                <div class="node-popup-action-row node-popup-delete-row" data-action="delete">
                    🗑️  Delete All
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
        // Pin toggle
        const pinRow = this.popup.querySelector('[data-action="pin"]');
        pinRow?.addEventListener('click', () => {
            const allPinned = this.nodes.every(n => n.fixed);
            const newState = !allPinned;
            for (const node of this.nodes) {
                node.setFixed(newState);
            }
            // Update the label and info
            pinRow.textContent = newState ? '🔓  Unpin All' : '📌  Pin All';
            const infoEl = this.popup.querySelector('.multi-node-info span');
            if (infoEl) {
                const pinnedCount = this.nodes.filter(n => n.fixed).length;
                infoEl.textContent = `Pinned: ${pinnedCount} / ${this.nodes.length}`;
            }
            this.onPinToggle?.(this.nodes);
        });

        // Delete action
        const deleteRow = this.popup.querySelector('[data-action="delete"]');
        deleteRow?.addEventListener('click', () => {
            this.onDelete?.(this.nodes);
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
            // Use average mass as starting point
            const totalMass = this.nodes.reduce((sum, n) => sum + n.mass, 0);
            this.scrubStartValue = totalMass / this.nodes.length;
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
            const totalMass = this.nodes.reduce((sum, n) => sum + n.mass, 0);
            this.scrubStartValue = totalMass / this.nodes.length;
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
        if (property === 'mass') {
            // Sensitivity: 1 pixel = 0.2 mass units
            const sensitivity = 0.2;
            const newMass = this.scrubStartValue + dx * sensitivity;
            // Round to 1 decimal place for node mass
            const roundedMass = Math.round(newMass * 10) / 10;
            // Apply to all nodes
            for (const node of this.nodes) {
                node.setMass(roundedMass);
            }
            valueEl.textContent = `${this.nodes[0].mass.toFixed(1)} kg`;
            this.onMassChange?.(roundedMass);
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
            const totalMass = this.nodes.reduce((sum, n) => sum + n.mass, 0);
            this.scrubStartValue = totalMass / this.nodes.length;
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
            const sensitivity = 0.2;
            const newMass = this.scrubStartValue + dx * sensitivity;
            const roundedMass = Math.round(newMass * 10) / 10;
            // Apply to all nodes
            for (const node of this.nodes) {
                node.setMass(roundedMass);
            }
            valueEl.textContent = `${this.nodes[0].mass.toFixed(1)} kg`;
            this.onMassChange?.(roundedMass);
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
            const totalMass = this.nodes.reduce((sum, n) => sum + n.mass, 0);
            this.scrubStartValue = totalMass / this.nodes.length;
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
        this.nodes = null;
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
