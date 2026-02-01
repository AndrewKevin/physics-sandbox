/**
 * UI Controller - Handles all DOM interactions
 */

export class UIController {
    constructor(onMaterialChange, onSimToggle, onClear) {
        // Callbacks
        this.onMaterialChange = onMaterialChange;
        this.onSimToggle = onSimToggle;
        this.onClear = onClear;

        // State
        this.currentMaterial = 'beam';

        // Cache DOM elements with null guards
        this.elements = {
            materialButtons: document.querySelectorAll('.material-btn'),
            simToggle: this.getElement('sim-toggle'),
            simClear: this.getElement('sim-clear'),
            stateSave: this.getElement('state-save'),
            stateLoad: this.getElement('state-load'),
            selectionInfo: this.getElement('selection-info'),
            segmentOptions: this.getElement('segment-options'),
            segmentMaterial: this.getElement('segment-material'),
            segmentStiffness: this.getElement('segment-stiffness'),
            segmentDamping: this.getElement('segment-damping'),
            stiffnessValue: this.getElement('stiffness-value'),
            dampingValue: this.getElement('damping-value'),
            segmentCompression: this.getElement('segment-compression'),
            segmentTension: this.getElement('segment-tension'),
            viewSnapToGrid: this.getElement('view-snap-to-grid'),
            viewStressLabels: this.getElement('view-stress-labels'),
            statNodes: this.getElement('stat-nodes'),
            statSegments: this.getElement('stat-segments'),
            statWeights: this.getElement('stat-weights'),
            statStress: this.getElement('stat-stress'),
            hint: document.querySelector('.hint')
        };

        this.bindEvents();
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
            this.onClear();
        });

        // State save/load
        this.elements.stateSave?.addEventListener('click', () => {
            this.onSave?.();
        });

        this.elements.stateLoad?.addEventListener('click', () => {
            this.onLoad?.();
        });

        // Segment options
        this.elements.segmentMaterial?.addEventListener('change', (e) => {
            this.onSegmentMaterialChange?.(e.target.value);
        });

        this.elements.segmentStiffness?.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (this.elements.stiffnessValue) {
                this.elements.stiffnessValue.textContent = value.toFixed(2);
            }
            this.onSegmentStiffnessChange?.(value);
        });

        this.elements.segmentDamping?.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (this.elements.dampingValue) {
                this.elements.dampingValue.textContent = value.toFixed(2);
            }
            this.onSegmentDampingChange?.(value);
        });

        this.elements.segmentCompression?.addEventListener('change', (e) => {
            this.onSegmentCompressionChange?.(e.target.checked);
        });

        this.elements.segmentTension?.addEventListener('change', (e) => {
            this.onSegmentTensionChange?.(e.target.checked);
        });

        // View options - notify on change for persistence
        this.elements.viewSnapToGrid?.addEventListener('change', () => {
            this.onViewSettingsChange?.();
        });

        this.elements.viewStressLabels?.addEventListener('change', () => {
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
                this.onClear();
                break;
        }
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
            const pinnedCount = nodes.filter(n => n.fixed).length;
            const totalMass = nodes.reduce((sum, n) => sum + n.mass, 0);
            const avgMass = totalMass / nodes.length;
            const allPinned = pinnedCount === nodes.length;

            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = `
                    <p><strong>${nodes.length} nodes selected</strong></p>
                    <p>Pinned: ${pinnedCount} / ${nodes.length}</p>
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
                `;
            }
            this.elements.segmentOptions?.classList.add('disabled');
            this.bindMultiSelectActions(nodes);
            return;
        }

        // Update selection info (single element)
        if (node) {
            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = `
                    <p><strong>Node #${node.id}</strong></p>
                    <p>Position: (${Math.round(node.x)}, ${Math.round(node.y)})</p>
                    <p>Fixed: ${node.fixed ? 'Yes' : 'No'}</p>
                `;
            }
            this.elements.segmentOptions?.classList.add('disabled');
        } else if (segment) {
            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = `
                    <p><strong>Segment #${segment.id}</strong></p>
                    <p>Length: ${Math.round(segment.restLength)}px</p>
                    <p>Stress: ${Math.round(segment.stress * 100)}%</p>
                `;
            }
            this.elements.segmentOptions?.classList.remove('disabled');

            // Update segment controls to match selection
            if (this.elements.segmentMaterial) {
                this.elements.segmentMaterial.value = segment.material;
            }
            if (this.elements.segmentStiffness) {
                this.elements.segmentStiffness.value = segment.stiffness || 0.9;
            }
            if (this.elements.stiffnessValue) {
                this.elements.stiffnessValue.textContent = (segment.stiffness || 0.9).toFixed(2);
            }
            if (this.elements.segmentDamping) {
                this.elements.segmentDamping.value = segment.damping || 0.1;
            }
            if (this.elements.dampingValue) {
                this.elements.dampingValue.textContent = (segment.damping || 0.1).toFixed(2);
            }
            if (this.elements.segmentCompression) {
                this.elements.segmentCompression.checked = segment.compressionOnly;
            }
            if (this.elements.segmentTension) {
                this.elements.segmentTension.checked = segment.tensionOnly;
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
            this.elements.segmentOptions?.classList.add('disabled');
        } else {
            if (this.elements.selectionInfo) {
                this.elements.selectionInfo.innerHTML = '<p class="empty-state">Nothing selected</p>';
            }
            this.elements.segmentOptions?.classList.add('disabled');
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
    }

    // Set callbacks for segment property changes
    setSegmentMaterialCallback(callback) {
        this.onSegmentMaterialChange = callback;
    }

    setSegmentStiffnessCallback(callback) {
        this.onSegmentStiffnessChange = callback;
    }

    setSegmentDampingCallback(callback) {
        this.onSegmentDampingChange = callback;
    }

    setSegmentCompressionCallback(callback) {
        this.onSegmentCompressionChange = callback;
    }

    setSegmentTensionCallback(callback) {
        this.onSegmentTensionChange = callback;
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

    get snapToGrid() {
        return this.elements.viewSnapToGrid?.checked ?? false;
    }

    /**
     * Get current view settings for persistence.
     * @returns {Object} View settings { currentMaterial, snapToGrid, showStressLabels }
     */
    getViewSettings() {
        return {
            currentMaterial: this.currentMaterial,
            snapToGrid: this.snapToGrid,
            showStressLabels: this.showStressLabels
        };
    }

    /**
     * Apply loaded view settings.
     * @param {Object} settings - Settings { currentMaterial, snapToGrid, showStressLabels }
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
    }

    /**
     * Set callback for view settings changes (for persistence).
     * @param {Function} callback - Called when any view setting changes
     */
    setViewSettingsCallback(callback) {
        this.onViewSettingsChange = callback;
    }
}
