import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    saveViewSettings,
    loadViewSettings,
    saveStructure,
    loadStructure,
    clearStorage,
    createDebouncedSave,
    isStorageAvailable,
    STORAGE_KEYS
} from './storage-utils.js';

/**
 * Create a mock storage that mimics localStorage API.
 */
function createMockStorage() {
    const store = new Map();
    return {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
}

/**
 * Intent-focused tests describing user scenarios
 */
describe('Storage Utils - User Intent', () => {
    describe('User returns to sandbox after closing browser', () => {
        it('should restore their last material selection', () => {
            const storage = createMockStorage();

            saveViewSettings(storage, {
                currentMaterial: 'spring',
                snapToGrid: false,
                showStressLabels: false
            });

            const settings = loadViewSettings(storage);
            expect(settings.currentMaterial).toBe('spring');
        });

        it('should restore their view preferences', () => {
            const storage = createMockStorage();

            saveViewSettings(storage, {
                currentMaterial: 'beam',
                snapToGrid: true,
                showStressLabels: true
            });

            const settings = loadViewSettings(storage);
            expect(settings.snapToGrid).toBe(true);
            expect(settings.showStressLabels).toBe(true);
        });

        it('should restore their structure with all nodes and segments', () => {
            const storage = createMockStorage();

            const bridgeStructure = {
                nodes: [
                    { x: 100, y: 300, fixed: true, mass: 5 },
                    { x: 300, y: 300, fixed: false, mass: 5 },
                    { x: 500, y: 300, fixed: true, mass: 5 }
                ],
                segments: [
                    { nodeAIndex: 0, nodeBIndex: 1, material: 'beam', stiffness: 0.9 },
                    { nodeAIndex: 1, nodeBIndex: 2, material: 'beam', stiffness: 0.9 }
                ],
                weights: []
            };

            saveStructure(storage, bridgeStructure);

            const restored = loadStructure(storage);
            expect(restored.nodes).toHaveLength(3);
            expect(restored.segments).toHaveLength(2);
            expect(restored.nodes[0].fixed).toBe(true);
        });

        it('should restore weights attached to segments', () => {
            const storage = createMockStorage();

            const structure = {
                nodes: [
                    { x: 0, y: 100, fixed: true, mass: 5 },
                    { x: 200, y: 100, fixed: true, mass: 5 }
                ],
                segments: [
                    { nodeAIndex: 0, nodeBIndex: 1, material: 'beam' }
                ],
                weights: [
                    { mass: 50, position: 0.5, attachedToSegmentIndex: 0, attachedToNodeIndex: null }
                ]
            };

            saveStructure(storage, structure);

            const restored = loadStructure(storage);
            expect(restored.weights).toHaveLength(1);
            expect(restored.weights[0].mass).toBe(50);
        });
    });

    describe('User clears the sandbox', () => {
        it('should remove saved structure so next visit starts fresh', () => {
            const storage = createMockStorage();

            saveStructure(storage, { nodes: [{ x: 100, y: 100 }], segments: [], weights: [] });
            clearStorage(storage);

            expect(loadStructure(storage)).toBeNull();
        });

        it('should remove saved view settings', () => {
            const storage = createMockStorage();

            saveViewSettings(storage, { currentMaterial: 'cable', snapToGrid: true, showStressLabels: true });
            clearStorage(storage);

            expect(loadViewSettings(storage)).toBeNull();
        });
    });

    describe('Corrupted storage data', () => {
        it('should return null when view settings are invalid JSON', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, 'not valid json');

            const settings = loadViewSettings(storage);
            expect(settings).toBeNull();
        });

        it('should use default material when saved material is invalid', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, JSON.stringify({
                version: 1,
                currentMaterial: 'unobtanium',
                snapToGrid: true
            }));

            const settings = loadViewSettings(storage);
            expect(settings.currentMaterial).toBe('beam');
        });

        it('should return null when structure has no nodes array', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.STRUCTURE, JSON.stringify({
                version: 1,
                structure: { segments: [], weights: [] }
            }));

            expect(loadStructure(storage)).toBeNull();
        });

        it('should return null when structure has no segments array', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.STRUCTURE, JSON.stringify({
                version: 1,
                structure: { nodes: [], weights: [] }
            }));

            expect(loadStructure(storage)).toBeNull();
        });

        it('should return null when structure has no weights array', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.STRUCTURE, JSON.stringify({
                version: 1,
                structure: { nodes: [], segments: [] }
            }));

            expect(loadStructure(storage)).toBeNull();
        });

        it('should return null when structure JSON is invalid', () => {
            const storage = createMockStorage();
            storage.setItem(STORAGE_KEYS.STRUCTURE, 'not json');

            expect(loadStructure(storage)).toBeNull();
        });
    });
});

describe('saveViewSettings', () => {
    it('should save settings to storage', () => {
        const storage = createMockStorage();
        const settings = {
            currentMaterial: 'cable',
            snapToGrid: true,
            showStressLabels: false
        };

        const result = saveViewSettings(storage, settings);

        expect(result).toBe(true);
        expect(storage.getItem(STORAGE_KEYS.VIEW_SETTINGS)).toBeTruthy();
    });

    it('should return false on storage error', () => {
        const storage = {
            setItem: () => { throw new Error('Storage full'); },
            getItem: () => null
        };

        const result = saveViewSettings(storage, { currentMaterial: 'beam' });
        expect(result).toBe(false);
    });

    it('should include version in saved data', () => {
        const storage = createMockStorage();

        saveViewSettings(storage, {
            currentMaterial: 'beam',
            snapToGrid: false,
            showStressLabels: false
        });

        const saved = JSON.parse(storage.getItem(STORAGE_KEYS.VIEW_SETTINGS));
        expect(saved.version).toBe(1);
    });
});

describe('loadViewSettings', () => {
    it('should return null when no settings saved', () => {
        const storage = createMockStorage();

        expect(loadViewSettings(storage)).toBeNull();
    });

    it('should coerce non-boolean values to booleans', () => {
        const storage = createMockStorage();
        storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, JSON.stringify({
            currentMaterial: 'beam',
            snapToGrid: 1,
            showStressLabels: 'yes'
        }));

        const settings = loadViewSettings(storage);
        expect(settings.snapToGrid).toBe(true);
        expect(settings.showStressLabels).toBe(true);
    });

    it('should handle missing fields gracefully', () => {
        const storage = createMockStorage();
        storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, JSON.stringify({
            version: 1
            // Missing all fields
        }));

        const settings = loadViewSettings(storage);
        expect(settings.currentMaterial).toBe('beam');
        expect(settings.snapToGrid).toBe(false);
        expect(settings.showStressLabels).toBe(false);
    });
});

describe('saveStructure', () => {
    it('should save structure to storage', () => {
        const storage = createMockStorage();
        const structure = { nodes: [], segments: [], weights: [] };

        const result = saveStructure(storage, structure);

        expect(result).toBe(true);
        expect(storage.getItem(STORAGE_KEYS.STRUCTURE)).toBeTruthy();
    });

    it('should return false on quota exceeded error', () => {
        const quotaError = new Error('Storage full');
        quotaError.name = 'QuotaExceededError';
        const storage = {
            setItem: () => { throw quotaError; },
            getItem: () => null
        };

        const result = saveStructure(storage, { nodes: [], segments: [], weights: [] });
        expect(result).toBe(false);
    });

    it('should include version in saved data', () => {
        const storage = createMockStorage();

        saveStructure(storage, { nodes: [], segments: [], weights: [] });

        const saved = JSON.parse(storage.getItem(STORAGE_KEYS.STRUCTURE));
        expect(saved.version).toBe(1);
    });
});

describe('loadStructure', () => {
    it('should return null when no structure saved', () => {
        const storage = createMockStorage();

        expect(loadStructure(storage)).toBeNull();
    });

    it('should preserve all node properties', () => {
        const storage = createMockStorage();
        const structure = {
            nodes: [{ x: 150, y: 250, fixed: true, mass: 15 }],
            segments: [],
            weights: []
        };

        saveStructure(storage, structure);
        const restored = loadStructure(storage);

        expect(restored.nodes[0].x).toBe(150);
        expect(restored.nodes[0].y).toBe(250);
        expect(restored.nodes[0].fixed).toBe(true);
        expect(restored.nodes[0].mass).toBe(15);
    });

    it('should preserve all segment properties', () => {
        const storage = createMockStorage();
        const structure = {
            nodes: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
            segments: [{
                nodeAIndex: 0,
                nodeBIndex: 1,
                material: 'cable',
                stiffness: 0.5,
                damping: 0.2,
                tensionOnly: true,
                compressionOnly: false
            }],
            weights: []
        };

        saveStructure(storage, structure);
        const restored = loadStructure(storage);

        expect(restored.segments[0].material).toBe('cable');
        expect(restored.segments[0].stiffness).toBe(0.5);
        expect(restored.segments[0].tensionOnly).toBe(true);
    });
});

describe('clearStorage', () => {
    it('should remove view settings', () => {
        const storage = createMockStorage();
        saveViewSettings(storage, { currentMaterial: 'beam', snapToGrid: true, showStressLabels: false });

        clearStorage(storage);

        expect(storage.getItem(STORAGE_KEYS.VIEW_SETTINGS)).toBeNull();
    });

    it('should remove structure', () => {
        const storage = createMockStorage();
        saveStructure(storage, { nodes: [], segments: [], weights: [] });

        clearStorage(storage);

        expect(storage.getItem(STORAGE_KEYS.STRUCTURE)).toBeNull();
    });

    it('should not throw on storage errors', () => {
        const storage = {
            removeItem: () => { throw new Error('Storage error'); }
        };

        expect(() => clearStorage(storage)).not.toThrow();
    });
});

describe('createDebouncedSave', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('should delay execution by specified time', () => {
        const saveFn = vi.fn();
        const debouncedSave = createDebouncedSave(saveFn, 500);

        debouncedSave('arg1');
        expect(saveFn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(saveFn).toHaveBeenCalledWith('arg1');

        vi.useRealTimers();
    });

    it('should use default delay of 1000ms', () => {
        const saveFn = vi.fn();
        const debouncedSave = createDebouncedSave(saveFn);

        debouncedSave();
        vi.advanceTimersByTime(999);
        expect(saveFn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(saveFn).toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('should cancel previous call when called again', () => {
        const saveFn = vi.fn();
        const debouncedSave = createDebouncedSave(saveFn, 500);

        debouncedSave('first');
        vi.advanceTimersByTime(300);
        debouncedSave('second');
        vi.advanceTimersByTime(300);

        expect(saveFn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(saveFn).toHaveBeenCalledTimes(1);
        expect(saveFn).toHaveBeenCalledWith('second');

        vi.useRealTimers();
    });

    it('should provide cancel method', () => {
        const saveFn = vi.fn();
        const debouncedSave = createDebouncedSave(saveFn, 500);

        debouncedSave('data');
        vi.advanceTimersByTime(300);
        debouncedSave.cancel();
        vi.advanceTimersByTime(500);

        expect(saveFn).not.toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('should allow multiple calls after timeout completes', () => {
        const saveFn = vi.fn();
        const debouncedSave = createDebouncedSave(saveFn, 500);

        debouncedSave('first');
        vi.advanceTimersByTime(500);
        expect(saveFn).toHaveBeenCalledWith('first');

        debouncedSave('second');
        vi.advanceTimersByTime(500);
        expect(saveFn).toHaveBeenCalledWith('second');
        expect(saveFn).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });
});

describe('STORAGE_KEYS', () => {
    it('should have unique namespaced keys', () => {
        expect(STORAGE_KEYS.VIEW_SETTINGS).toBe('physics-sandbox:view-settings');
        expect(STORAGE_KEYS.STRUCTURE).toBe('physics-sandbox:structure');
        expect(STORAGE_KEYS.VIEW_SETTINGS).not.toBe(STORAGE_KEYS.STRUCTURE);
    });
});
