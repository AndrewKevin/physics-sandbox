/**
 * Materials - Centralized, data-driven material configuration
 *
 * Single source of truth for all material definitions.
 * Used by physics (structure.js), rendering (renderer.js), and UI (context menus).
 *
 * To add a new material:
 * 1. Add an entry to MATERIALS with all required properties
 * 2. Add the key to MATERIAL_ORDER for UI display sequence
 *
 * @see CLAUDE.md "Adding a new material" section for full checklist
 */

/**
 * Material definitions
 * @typedef {Object} MaterialConfig
 * @property {string} label - Display name for UI
 * @property {string} shortLabel - Abbreviated name (2-3 chars) for compact UI
 * @property {number} stiffness - Physics stiffness (0-1, Matter.js constraint)
 * @property {number} damping - Physics damping (0-1)
 * @property {boolean} compressionOnly - Only resists compression (strut behaviour)
 * @property {boolean} tensionOnly - Only resists tension (cable behaviour)
 * @property {string} color - Default colour (hex)
 * @property {number} lineWidth - Stroke width for rendering
 * @property {string} pattern - Line pattern: 'solid', 'dashed', 'zigzag'
 * @property {Object} patternConfig - Pattern-specific config (dash lengths, etc.)
 */
export const MATERIALS = {
    beam: {
        // UI metadata
        label: 'Rigid Beam',
        shortLabel: 'Bm',
        description: 'High stiffness, resists both compression and tension equally',

        // Physics properties
        stiffness: 0.9,      // Slightly soft to show deformation
        damping: 0.1,
        compressionOnly: false,
        tensionOnly: false,

        // Visual properties
        color: '#00F5D4',    // Cyan
        lineWidth: 6,
        pattern: 'solid',
        patternConfig: {}
    },

    spring: {
        // UI metadata
        label: 'Spring',
        shortLabel: 'Sp',
        description: 'Low stiffness, stretches and bounces under load',

        // Physics properties
        stiffness: 0.2,      // Bouncy
        damping: 0.05,
        compressionOnly: false,
        tensionOnly: false,

        // Visual properties
        color: '#FFE600',    // Yellow
        lineWidth: 4,
        // TODO: Implement pattern rendering in renderer.js (drawMaterialSegment)
        pattern: 'zigzag',
        patternConfig: {
            amplitude: 6,
            wavelength: 12
        }
    },

    cable: {
        // UI metadata
        label: 'Cable',
        shortLabel: 'Cb',
        description: 'Tension only, goes slack under compression',

        // Physics properties
        stiffness: 0.7,      // Slightly stretchy
        damping: 0.02,
        compressionOnly: false,
        tensionOnly: true,   // Cables only resist tension

        // Visual properties
        color: '#FF6B35',    // Orange
        lineWidth: 3,
        pattern: 'solid',
        patternConfig: {}
    },

    muscle: {
        // UI metadata
        label: 'Muscle',
        shortLabel: 'Mu',
        description: 'Active contraction, pulls toward target length',

        // Physics properties
        stiffness: 0.6,      // Moderate stiffness
        damping: 0.15,       // Some internal damping
        compressionOnly: false,
        tensionOnly: true,   // Only pulls, can't push

        // Active contraction properties
        isActive: true,              // Generates force actively
        contractionRatio: 0.5,       // Target is 50% of rest length (fully contracted)
        breakOnOverload: false,      // Whether to break when 100% stress is reached

        // Visual properties
        color: '#FF3AF2',    // Magenta (accent-1)
        lineWidth: 2,        // Thinner for multi-strand effect
        pattern: 'fibrous',
        patternConfig: {
            strands: 3,      // Number of parallel lines
            spacing: 4       // Pixels between strands (wider for visibility)
        }
    }
};

/**
 * Material order for UI display (buttons, menus, selectors).
 * Add new materials here in the desired display order.
 */
export const MATERIAL_ORDER = ['beam', 'spring', 'cable', 'muscle'];

/**
 * Get all valid material keys.
 * @returns {string[]}
 */
export function getMaterialKeys() {
    return Object.keys(MATERIALS);
}

/**
 * Check if a material key is valid.
 * @param {string} key - Material key to check
 * @returns {boolean}
 */
export function isValidMaterial(key) {
    return key in MATERIALS;
}

/**
 * Get the default material key.
 * @returns {string}
 */
export function getDefaultMaterial() {
    return MATERIAL_ORDER[0] || 'beam';
}

/**
 * Get physics properties for a material.
 * @param {string} key - Material key
 * @returns {{ stiffness: number, damping: number, compressionOnly: boolean, tensionOnly: boolean, isActive?: boolean, contractionRatio?: number, maxStress?: number, yieldRate?: number }}
 */
export function getMaterialPhysics(key) {
    const mat = MATERIALS[key] ?? MATERIALS.beam;

    const physics = {
        stiffness: mat.stiffness,
        damping: mat.damping,
        compressionOnly: mat.compressionOnly,
        tensionOnly: mat.tensionOnly
    };

    // Include active contraction properties if present (muscle)
    if (mat.isActive) {
        physics.isActive = mat.isActive;
        physics.contractionRatio = mat.contractionRatio;
        physics.maxStress = mat.maxStress;
        physics.yieldRate = mat.yieldRate;
    }

    return physics;
}

/**
 * Get visual properties for a material.
 * @param {string} key - Material key
 * @returns {{ color: string, lineWidth: number, pattern: string, patternConfig: Object }}
 */
export function getMaterialVisuals(key) {
    const mat = MATERIALS[key] ?? MATERIALS.beam;

    return {
        color: mat.color,
        lineWidth: mat.lineWidth,
        pattern: mat.pattern,
        patternConfig: mat.patternConfig
    };
}

// Future: Shared segment/swatch drawing function
// export function drawMaterialSegment(ctx, key, x1, y1, x2, y2, options = {}) { ... }
