/**
 * UI Controller - Handles all DOM interactions
 */

import { MATERIALS, MATERIAL_ORDER, getDefaultMaterial } from './materials.js';

export class UIController {
    constructor(onMaterialChange, onSimToggle, onClear) {
        // Callbacks
        this.onMaterialChange = onMaterialChange;
        this.onSimToggle = onSimToggle;
        this.onClear = onClear;

        // State
        this.currentMaterial = getDefaultMaterial();

        // Generate material buttons from data source
        this.generateMaterialButtons();

        // Cache DOM elements with null guards
        this.elements = {
            materialButtonsContainer: this.getElement('material-buttons'),
            materialButtons: document.querySelectorAll('.material-btn'),
            simToggle: this.getElement('sim-toggle'),
            simClear: this.getElement('sim-clear'),
            stateSave: this.getElement('state-save'),
            stateLoad: this.getElement('state-load'),
            selectionInfo: this.getElement('selection-info'),
            viewSnapToGrid: this.getElement('view-snap-to-grid'),
            viewStressLabels: this.getElement('view-stress-labels'),
            viewJointAngles: this.getElement('view-joint-angles'),
            statNodes: this.getElement('stat-nodes'),
            statSegments: this.getElement('stat-segments'),
            statWeights: this.getElement('stat-weights'),
            statStress: this.getElement('stat-stress'),
            hint: document.querySelector('.hint')
        };

        this.bindEvents();
    }

    /**
     * Generate material buttons from MATERIALS data source.
     */
    generateMaterialButtons() {
        const container = document.getElementById('material-buttons');
        if (!container) return;

        const defaultMaterial = getDefaultMaterial();

        for (const key of MATERIAL_ORDER) {
            const mat = MATERIALS[key];
            if (!mat) continue;

            const button = document.createElement('button');
            button.className = 'material-btn' + (key === defaultMaterial ? ' active' : '');
            button.dataset.material = key;

            button.innerHTML = `
                <span class="material-preview material-preview--${key}"></span>
                <span class="material-text">
                    <span class="material-name">${mat.label}</span>
                    <span class="material-desc">${mat.description}</span>
                </span>
            `;

            container.appendChild(button);
        }
    }

    /**
     * Safely get a DOM element by ID, logging a warning if not found.
     */
    getElement(id) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`UIController: Element #${id} not found in DOM`);
        }
        return el;
    }

    bindEvents() {
        // Material buttons
        this.elements.materialButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const material = btn.dataset.material;
                this.setMaterial(material);
            });
        });

        // Simulation controls
        this.elements.simToggle?.addEventListener('click', () => {
            this.toggleSimulation();
        });

        this.elements.simClear?.addEventListener('click', () => {
            this.confirmClear();
        });

        // State save/load
        this.elements.stateSave?.addEventListener('click', () => {
            this.onSave?.();
        });

        this.elements.stateLoad?.addEventListener('click', () => {
            this.onLoad?.();
        });

        // View options - notify on change for persistence
        this.elements.viewSnapToGrid?.addEventListener('change', () => {
            this.onViewSettingsChange?.();
        });

        this.elements.viewStressLabels?.addEventListener('change', () => {
            this.onViewSettingsChange?.();
        });

        this.elements.viewJointAngles?.addEventListener('change', () => {
            this.onViewSettingsChange?.();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    handleKeydown(e) {
        // Don't handle if typing in an input element
        const tagName = e.target.tagName;
        if (tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case 'r':
                e.preventDefault();
                this.toggleSimulation();
                break;
            case 'c':
                if (e.ctrlKey || e.metaKey) return; // Don't intercept browser copy
                this.confirmClear();
                break;
        }
    }

    /**
     * Show confirmation dialog before clearing, if there's anything to clear.
     */
    confirmClear() {
        // Check if there's anything to clear
        if (this.isStructureEmpty?.()) {
            return; // Nothing to clear
        }

        if (confirm('Clear all nodes, segments, and weights?')) {
            this.onClear();
        }
    }

    /**
     * Set callback to check if structure is empty.
     * @param {Function} callback - Returns true if structure is empty
     */
    setIsStructureEmptyCallback(callback) {
        this.isStructureEmpty = callback;
    }

    setMaterial(material) {
        this.currentMaterial = material;

        // Update button states
        this.elements.materialButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.material === material);
        });

        this.onMaterialChange(material);
        this.onViewSettingsChange?.();
    }

    toggleSimulation() {
        // Check current state from button and request opposite
        const isCurrentlyRunning = this.elements.simToggle?.classList.contains('running') ?? false;
        this.onSimToggle(!isCurrentlyRunning);
    }

    setSimulating(simulating) {
        const btn = this.elements.simToggle;
        if (!btn) return;

        if (simulating) {
            btn.classList.add('running');
            btn.innerHTML = '<span class="play-icon">⏸</span> STOP';
        } else {
            btn.classList.remove('running');
            btn.innerHTML = '<span class="play-icon">▶</span> RUN';
        }

        // Disable material buttons during simulation
        this.elements.materialButtons.forEach(btn => {
            btn.disabled = simulating;
            btn.style.opacity = simulating ? '0.5' : '1';
        });
    }

    updateSelection(selection) {
        const { node, segment, weight, nodes } = selection;

        // Handle multi-node selection
        if (nodes && nodes.length > 1) {
            // Filter to editable nodes for stats and controls
            const editableNodes = nodes.filter(n => n.isEditable);
            const anchorCount = nodes.length - editableNodes.length;

            const pinnedCount = editableNodes.filter(n => n.fixed).length;
            const totalMass = editableNodes.reduce((sum, n) => sum + n.mass, 0);
            const avgMass = editableNodes.length > 0 ? totalMass / editableNodes.length : 0;
            const allPinned = editableNodes.length > 0 && pinnedCount === editableNodes.length;

            // Build anchor info line if any anchors selected
            const anchorInfo = anchorCount > 0
                ? `<p class="hint-text">${anchorCount} anchor${anchorCount > 1 ? 's' : ''} (fixed)</p>`
                : '';

            // Only show edit controls if there are editable nodes
            const editControls = editableNodes.length > 0 ? `
                <p>Pinned: ${pinnedCount} / ${editableNodes.length}</p>
                <p>Total mass: ${totalMass.toFixed(1)} kg</p>
                <div class="bulk-mass-control">
                    <label for="bulk-mass">Set mass (each):</label>
                    <div class="bulk-mass-input-row">
                        <input type="number" id="bulk-mass" min="0.1" max="50" step="0.5" value="${avgMass.toFixed(1)}">
                        <span>kg</span>
                        <button class="bulk-action-btn small" id="bulk-mass-apply">Apply</button>
                    </div>
                </div>
                <div class="multi-select-actions">
                    <button class="bulk-action-btn" id="bulk-pin">
                        ${allPinned ? 'Unpin All' : 'Pin All'}
                    </button>
                    <button class="bulk-action-btn danger" id="bulk-delete">
                        Delete All
                    </button>
                </div>
                <p class="hint-text">Drag any node to move all</p>
            ` : '';

            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = `
                    <p><strong>${nodes.length} nodes selected</strong></p>
                    ${anchorInfo}
                    ${editControls}
                `;
            }
            if (editableNodes.length > 0) {
                this.bindMultiSelectActions(editableNodes);
            }
            return;
        }

        // Update selection info (single element)
        if (node) {
            if (this.elements.selectionInfo) {
                if (!node.isEditable) {
                    // Non-editable node (e.g., ground anchor) - limited info
                    this.elements.selectionInfo.innerHTML = `
                        <p><strong>Ground Anchor</strong></p>
                        <p>Position: (${Math.round(node.x)}, ${Math.round(node.y)})</p>
                        <p class="hint-text">Click another node to connect</p>
                    `;
                } else {
                    // Editable node - full info
                    const stiffnessLabel = node.angularStiffness === 0 ? 'Free'
                        : node.angularStiffness === 1 ? 'Locked'
                        : node.angularStiffness.toFixed(2);

                    this.elements.selectionInfo.innerHTML = `
                        <p><strong>Node #${node.id}</strong></p>
                        <p>Position: (${Math.round(node.x)}, ${Math.round(node.y)})</p>
                        <p>Fixed: ${node.fixed ? 'Yes' : 'No'}</p>
                        <p>Mass: ${node.mass} kg</p>
                        <p>Joint Stiffness: ${stiffnessLabel}</p>
                        <p class="hint-text">Right-click to edit</p>
                    `;
                }
            }
        } else if (segment) {
            if (this.elements.selectionInfo) {
                // Get material label from data source
                const materialName = MATERIALS[segment.material]?.label || segment.material;

                // Determine segment mode
                const mode = segment.tensionOnly ? 'Tension Only'
                    : segment.compressionOnly ? 'Compression Only'
                    : 'Normal';

                this.elements.selectionInfo.innerHTML = `
                    <p><strong>Segment #${segment.id}</strong></p>
                    <p>Material: ${materialName}</p>
                    <p>Length: ${Math.round(segment.restLength)}px</p>
                    <p>Stiffness: ${segment.stiffness.toFixed(2)}</p>
                    <p>Damping: ${segment.damping.toFixed(2)}</p>
                    <p>Mode: ${mode}</p>
                    <p>Stress: ${Math.round(segment.stress * 100)}%</p>
                `;
            }
        } else if (weight) {
            const pos = weight.getPosition();
            const attachedTo = weight.attachedToNode
                ? `Node #${weight.attachedToNode.id}`
                : `Segment #${weight.attachedToSegment.id}`;

            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = `
                    <p><strong>Weight #${weight.id}</strong></p>
                    <p>Mass: ${weight.mass} kg</p>
                    <p>Attached to: ${attachedTo}</p>
                    <p>Position: (${Math.round(pos.x)}, ${Math.round(pos.y)})</p>
                    <p class="hint-text">Right-click to edit</p>
                `;
            }
        } else {
            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = '<p class="empty-state">Nothing selected</p>';
            }
        }
    }

    updateStats(stats) {
        if (this.elements.statNodes) {
            this.elements.statNodes.textContent = stats.nodeCount;
        }
        if (this.elements.statSegments) {
            this.elements.statSegments.textContent = stats.segmentCount;
        }
        if (this.elements.statWeights) {
            this.elements.statWeights.textContent = stats.weightCount;
        }

        if (this.elements.statStress) {
            this.elements.statStress.textContent = `${Math.round(stats.maxStress * 100)}%`;

            // Colour code max stress (must match STRESS_COLORS in structure.js)
            if (stats.maxStress < 0.25) {
                this.elements.statStress.style.color = '#4ADE80';  // Green - low
            } else if (stats.maxStress < 0.5) {
                this.elements.statStress.style.color = '#FFE600';  // Yellow - medium
            } else if (stats.maxStress < 0.75) {
                this.elements.statStress.style.color = '#FF6B35';  // Orange - high
            } else {
                this.elements.statStress.style.color = '#FF3AF2';  // Magenta - critical
            }
        }

        // Hide hint once user has added content
        if (this.elements.hint) {
            this.elements.hint.style.display = stats.hasUserContent ? 'none' : 'inline-block';
        }
    }

    // Set callbacks for state save/load
    setSaveCallback(callback) {
        this.onSave = callback;
    }

    setLoadCallback(callback) {
        this.onLoad = callback;
    }

    // Set callbacks for multi-select actions
    setBulkActionCallback(callback) {
        this.onBulkAction = callback;
    }

    setBulkDeleteCallback(callback) {
        this.onBulkDelete = callback;
    }

    setBulkMassCallback(callback) {
        this.onBulkMass = callback;
    }

    /**
     * Bind event handlers for multi-select action buttons.
     * @param {Node[]} nodes - Selected nodes
     */
    bindMultiSelectActions(nodes) {
        // Use setTimeout to ensure DOM elements exist before binding
        setTimeout(() => {
            const pinBtn = document.getElementById('bulk-pin');
            const deleteBtn = document.getElementById('bulk-delete');
            const massInput = document.getElementById('bulk-mass');
            const massApplyBtn = document.getElementById('bulk-mass-apply');

            if (pinBtn) {
                pinBtn.onclick = () => {
                    const allPinned = nodes.every(n => n.fixed);
                    nodes.forEach(n => n.setFixed(!allPinned));
                    this.onBulkAction?.();
                };
            }

            if (deleteBtn) {
                deleteBtn.onclick = () => {
                    this.onBulkDelete?.(nodes);
                };
            }

            if (massApplyBtn && massInput) {
                massApplyBtn.onclick = () => {
                    const mass = parseFloat(massInput.value);
                    if (!isNaN(mass) && mass >= 0.1 && mass <= 50) {
                        nodes.forEach(n => n.setMass(mass));
                        this.onBulkMass?.(nodes, mass);
                    }
                };

                // Also apply on Enter key
                massInput.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        massApplyBtn.click();
                    }
                };
            }
        }, 0);
    }

    get showStressLabels() {
        return this.elements.viewStressLabels?.checked ?? false;
    }

    get showJointAngles() {
        return this.elements.viewJointAngles?.checked ?? false;
    }

    get snapToGrid() {
        return this.elements.viewSnapToGrid?.checked ?? false;
    }

    /**
     * Get current view settings for persistence.
     * @returns {Object} View settings { currentMaterial, snapToGrid, showStressLabels, showJointAngles }
     */
    getViewSettings() {
        return {
            currentMaterial: this.currentMaterial,
            snapToGrid: this.snapToGrid,
            showStressLabels: this.showStressLabels,
            showJointAngles: this.showJointAngles
        };
    }

    /**
     * Apply loaded view settings.
     * @param {Object} settings - Settings { currentMaterial, snapToGrid, showStressLabels, showJointAngles }
     */
    applyViewSettings(settings) {
        if (settings.currentMaterial) {
            // Update material without triggering onViewSettingsChange (we're loading, not changing)
            this.currentMaterial = settings.currentMaterial;
            this.elements.materialButtons.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.material === settings.currentMaterial);
            });
            this.onMaterialChange(settings.currentMaterial);
        }

        if (this.elements.viewSnapToGrid) {
            this.elements.viewSnapToGrid.checked = settings.snapToGrid ?? false;
        }

        if (this.elements.viewStressLabels) {
            this.elements.viewStressLabels.checked = settings.showStressLabels ?? false;
        }

        if (this.elements.viewJointAngles) {
            this.elements.viewJointAngles.checked = settings.showJointAngles ?? false;
        }
    }

    /**
     * Set callback for view settings changes (for persistence).
     * @param {Function} callback - Called when any view setting changes
     */
    setViewSettingsCallback(callback) {
        this.onViewSettingsChange = callback;
    }
}
