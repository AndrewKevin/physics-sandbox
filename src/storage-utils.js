/**
 * Storage Utilities
 * Pure functions for localStorage persistence of sandbox state and view settings.
 */

import { getMaterialKeys, getDefaultMaterial } from './materials.js';

export const STORAGE_KEYS = {
    VIEW_SETTINGS: 'physics-sandbox:view-settings',
    STRUCTURE: 'physics-sandbox:structure'
};

const CURRENT_VERSION = 1;

/**
 * Check if localStorage is available and working.
 * @returns {boolean} True if localStorage is available
 */
export function isStorageAvailable() {
    try {
        const testKey = '__storage_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Save view settings to storage.
 * @param {Storage} storage - Storage interface (localStorage or mock)
 * @param {Object} settings - Settings object { currentMaterial, snapToGrid, showStressLabels, showJointAngles }
 * @returns {boolean} True if saved successfully, false otherwise
 */
export function saveViewSettings(storage, settings) {
    try {
        const data = {
            version: CURRENT_VERSION,
            currentMaterial: settings.currentMaterial,
            snapToGrid: settings.snapToGrid,
            showStressLabels: settings.showStressLabels,
            showJointAngles: settings.showJointAngles
        };
        storage.setItem(STORAGE_KEYS.VIEW_SETTINGS, JSON.stringify(data));
        return true;
    } catch (err) {
        console.warn('Failed to save view settings:', err.message);
        return false;
    }
}

/**
 * Load view settings from storage.
 * @param {Storage} storage - Storage interface
 * @returns {Object|null} Settings object or null if not found/invalid
 */
export function loadViewSettings(storage) {
    try {
        const raw = storage.getItem(STORAGE_KEYS.VIEW_SETTINGS);
        if (!raw) return null;

        const data = JSON.parse(raw);
        return migrateViewSettings(data);
    } catch (err) {
        console.warn('Failed to load view settings:', err.message);
        return null;
    }
}

/**
 * Migrate and validate view settings from storage.
 * Handles older versions and invalid data gracefully.
 * @param {Object} data - Raw parsed data
 * @returns {Object} Valid settings with defaults for missing/invalid fields
 */
function migrateViewSettings(data) {
    // Validate material, fall back to default if invalid
    const validMaterials = getMaterialKeys();
    const material = validMaterials.includes(data.currentMaterial)
        ? data.currentMaterial
        : getDefaultMaterial();

    return {
        currentMaterial: material,
        snapToGrid: Boolean(data.snapToGrid),
        showStressLabels: Boolean(data.showStressLabels),
        showJointAngles: Boolean(data.showJointAngles)
    };
}

/**
 * Save structure to storage.
 * @param {Storage} storage - Storage interface
 * @param {Object} structureData - Serialised structure from StructureManager.serialize()
 * @returns {boolean} True if saved successfully
 */
export function saveStructure(storage, structureData) {
    try {
        const data = {
            version: CURRENT_VERSION,
            structure: structureData
        };
        storage.setItem(STORAGE_KEYS.STRUCTURE, JSON.stringify(data));
        return true;
    } catch (err) {
        if (err.name === 'QuotaExceededError') {
            console.warn('localStorage quota exceeded - structure not saved');
        } else {
            console.warn('Failed to save structure:', err.message);
        }
        return false;
    }
}

/**
 * Load structure from storage.
 * @param {Storage} storage - Storage interface
 * @returns {Object|null} Structure data or null if not found/invalid
 */
export function loadStructure(storage) {
    try {
        const raw = storage.getItem(STORAGE_KEYS.STRUCTURE);
        if (!raw) return null;

        const data = JSON.parse(raw);

        // Validate basic structure
        if (!data.structure?.nodes || !Array.isArray(data.structure.nodes)) {
            console.warn('Invalid structure data: missing nodes array');
            return null;
        }
        if (!data.structure?.segments || !Array.isArray(data.structure.segments)) {
            console.warn('Invalid structure data: missing segments array');
            return null;
        }
        if (!data.structure?.weights || !Array.isArray(data.structure.weights)) {
            console.warn('Invalid structure data: missing weights array');
            return null;
        }

        return data.structure;
    } catch (err) {
        console.warn('Failed to load structure:', err.message);
        return null;
    }
}

/**
 * Clear all sandbox data from storage.
 * @param {Storage} storage - Storage interface
 */
export function clearStorage(storage) {
    try {
        storage.removeItem(STORAGE_KEYS.VIEW_SETTINGS);
        storage.removeItem(STORAGE_KEYS.STRUCTURE);
    } catch (err) {
        console.warn('Failed to clear storage:', err.message);
    }
}

/**
 * Create a debounced save function.
 * @param {Function} saveFn - The save function to debounce
 * @param {number} delay - Debounce delay in milliseconds (default 1000ms)
 * @returns {Function} Debounced save function with cancel() method
 */
export function createDebouncedSave(saveFn, delay = 1000) {
    let timeoutId = null;

    const debouncedFn = function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            saveFn(...args);
            timeoutId = null;
        }, delay);
    };

    // Allow cancelling pending save
    debouncedFn.cancel = function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debouncedFn;
}
