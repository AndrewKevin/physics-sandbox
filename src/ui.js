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
            case ' ':
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
            btn.innerHTML = '<span class="play-icon">▶</span> START';
        }

        // Disable material buttons during simulation
        this.elements.materialButtons.forEach(btn => {
            btn.disabled = simulating;
            btn.style.opacity = simulating ? '0.5' : '1';
        });
    }

    updateSelection(selection) {
        const { node, segment, weight } = selection;

        // Update selection info
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
}
