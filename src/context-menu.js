/**
 * Simple Context Menu - Custom implementation for full control over menu display
 */

export class ContextMenu {
    constructor() {
        this.menu = null;
        this.onClose = null;

        // Bind handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    /**
     * Show context menu at the specified position.
     * @param {number} x - Client X position
     * @param {number} y - Client Y position
     * @param {Array} items - Menu items [{label, callback}, ...]
     */
    show(x, y, items) {
        this.close();

        // Create menu element
        this.menu = document.createElement('div');
        this.menu.className = 'physics-context-menu';

        // Add menu items
        items.forEach(item => {
            if (item === 'hr') {
                const hr = document.createElement('hr');
                this.menu.appendChild(hr);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.textContent = item.label;
                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    item.callback?.();
                    this.close();
                });
                this.menu.appendChild(menuItem);
            }
        });

        // Add to DOM
        document.body.appendChild(this.menu);

        // Position menu (adjust if near edges)
        const rect = this.menu.getBoundingClientRect();
        const padding = 10;

        let left = x;
        let top = y;

        if (x + rect.width > window.innerWidth - padding) {
            left = x - rect.width;
        }
        if (y + rect.height > window.innerHeight - padding) {
            top = y - rect.height;
        }

        this.menu.style.left = `${Math.max(padding, left)}px`;
        this.menu.style.top = `${Math.max(padding, top)}px`;

        // Show with animation
        requestAnimationFrame(() => {
            this.menu?.classList.add('visible');
        });

        // Close on click outside or Escape key (delayed to avoid immediate close)
        setTimeout(() => {
            document.addEventListener('mousedown', this.handleClickOutside);
            document.addEventListener('keydown', this.handleKeyDown);
        }, 10);
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    handleClickOutside = (e) => {
        if (this.menu && !this.menu.contains(e.target)) {
            this.close();
        }
    };

    close() {
        if (this.menu) {
            this.menu.remove();
            this.menu = null;
        }
        document.removeEventListener('mousedown', this.handleClickOutside);
        document.removeEventListener('keydown', this.handleKeyDown);
        this.onClose?.();
    }

    isOpen() {
        return this.menu !== null;
    }
}
