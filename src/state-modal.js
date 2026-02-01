/**
 * State Modal - Modal dialog for save/load state operations
 */

export class StateModal {
    constructor() {
        this.modal = null;
        this.textarea = null;
        this.onLoad = null;
        this.boundHandleKeydown = this.handleKeydown.bind(this);
        this.boundHandleClickOutside = this.handleClickOutside.bind(this);
    }

    /**
     * Show the modal in save mode with the provided state data.
     * @param {string} stateJson - JSON string of the state to save
     */
    showSave(stateJson) {
        this.show({
            title: 'Save Structure',
            content: stateJson,
            readonly: true,
            buttons: [
                { label: 'Copy', action: () => this.copyToClipboard(), primary: true },
                { label: 'Close', action: () => this.close() }
            ]
        });
    }

    /**
     * Show the modal in load mode.
     * @param {Function} onLoad - Callback with parsed state when user clicks Load
     */
    showLoad(onLoad) {
        this.onLoad = onLoad;
        this.show({
            title: 'Load Structure',
            content: '',
            readonly: false,
            placeholder: 'Paste saved structure JSON here...',
            buttons: [
                { label: 'Load', action: () => this.loadState(), primary: true },
                { label: 'Cancel', action: () => this.close() }
            ]
        });
    }

    /**
     * Internal method to show the modal with given options.
     */
    show(options) {
        // Close any existing modal
        this.close();

        // Create modal container
        this.modal = document.createElement('div');
        this.modal.className = 'state-modal-overlay';
        this.modal.innerHTML = `
            <div class="state-modal">
                <div class="state-modal-header">
                    <h3>${options.title}</h3>
                    <button class="state-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="state-modal-body">
                    <textarea
                        class="state-modal-textarea"
                        ${options.readonly ? 'readonly' : ''}
                        ${options.placeholder ? `placeholder="${options.placeholder}"` : ''}
                    >${options.content}</textarea>
                </div>
                <div class="state-modal-footer">
                    ${options.buttons.map(btn =>
                        `<button class="state-modal-btn ${btn.primary ? 'primary' : 'secondary'}">${btn.label}</button>`
                    ).join('')}
                </div>
                <div class="state-modal-message"></div>
            </div>
        `;

        document.body.appendChild(this.modal);

        // Cache textarea reference
        this.textarea = this.modal.querySelector('.state-modal-textarea');
        this.messageEl = this.modal.querySelector('.state-modal-message');

        // Bind button actions
        const buttons = this.modal.querySelectorAll('.state-modal-btn');
        options.buttons.forEach((btn, i) => {
            buttons[i].addEventListener('click', btn.action);
        });

        // Close button
        this.modal.querySelector('.state-modal-close').addEventListener('click', () => this.close());

        // Event listeners for closing
        document.addEventListener('keydown', this.boundHandleKeydown);
        this.modal.addEventListener('click', this.boundHandleClickOutside);

        // Select all text if in save mode
        if (options.readonly) {
            setTimeout(() => {
                this.textarea.select();
            }, 50);
        } else {
            this.textarea.focus();
        }
    }

    /**
     * Copy textarea content to clipboard.
     */
    async copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.textarea.value);
            this.showMessage('Copied to clipboard!', 'success');
        } catch (err) {
            // Fallback for older browsers
            this.textarea.select();
            document.execCommand('copy');
            this.showMessage('Copied to clipboard!', 'success');
        }
    }

    /**
     * Validate and load the state from textarea.
     */
    loadState() {
        const value = this.textarea.value.trim();

        if (!value) {
            this.showMessage('Please paste a saved structure', 'error');
            return;
        }

        try {
            const state = JSON.parse(value);

            // Basic validation
            if (!state.nodes || !Array.isArray(state.nodes)) {
                throw new Error('Invalid structure: missing nodes array');
            }
            if (!state.segments || !Array.isArray(state.segments)) {
                throw new Error('Invalid structure: missing segments array');
            }

            this.onLoad?.(state);
            this.close();
        } catch (err) {
            this.showMessage(`Invalid JSON: ${err.message}`, 'error');
        }
    }

    /**
     * Show a temporary message in the modal.
     */
    showMessage(text, type = 'info') {
        if (this.messageEl) {
            this.messageEl.textContent = text;
            this.messageEl.className = `state-modal-message ${type}`;

            // Clear message after delay
            setTimeout(() => {
                if (this.messageEl) {
                    this.messageEl.textContent = '';
                    this.messageEl.className = 'state-modal-message';
                }
            }, 2000);
        }
    }

    /**
     * Handle keydown events (Escape to close).
     */
    handleKeydown(e) {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    /**
     * Handle clicks outside the modal content.
     */
    handleClickOutside(e) {
        if (e.target === this.modal) {
            this.close();
        }
    }

    /**
     * Close and remove the modal.
     */
    close() {
        if (this.modal) {
            document.removeEventListener('keydown', this.boundHandleKeydown);
            this.modal.removeEventListener('click', this.boundHandleClickOutside);
            this.modal.remove();
            this.modal = null;
            this.textarea = null;
            this.messageEl = null;
            this.onLoad = null;
        }
    }

    /**
     * Check if the modal is currently open.
     */
    isOpen() {
        return this.modal !== null;
    }
}
