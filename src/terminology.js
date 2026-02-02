/**
 * Terminology - Centralised definitions for physics concepts
 *
 * Single source of truth for tooltips and help text across the UI.
 * Used by popups, context menus, and help panels.
 *
 * @example
 * import { TERMS } from './terminology.js';
 * const tooltip = TERMS.stiffness;
 */

/**
 * Physics and material property definitions.
 * Each entry should be a concise, user-friendly explanation.
 */
export const TERMS = {
    // Segment physics properties
    stiffness: 'How rigidly the segment resists stretching. Higher = stiffer, lower = springier.',
    damping: 'Energy absorption during movement. Higher = less bouncy, lower = more oscillation.',

    // Muscle properties
    contractionRatio: 'Target length as percentage of rest length. Lower = stronger contraction.',
    breakOnOverload: 'When enabled, the muscle permanently goes slack at 100% stress.',

    // Node properties
    mass: 'The weight of the node in kilograms. Heavier nodes require more force to move.',
    angularStiffness: 'How strongly the node resists bending at segment joints. 0 = free rotation, 1 = locked.',
    pinned: 'A pinned node is fixed in place and cannot move during simulation.',

    // Weight properties
    weightMass: 'The weight of the hanging mass in kilograms.',
    position: 'Position along the segment. 0% = start node, 100% = end node.',

    // Materials
    beam: 'High stiffness, resists both compression and tension equally.',
    spring: 'Low stiffness, stretches and bounces under load.',
    cable: 'Tension only — goes slack when compressed.',
    muscle: 'Active contraction — pulls toward a target length.',

    // Stress visualisation
    stress: 'How much the segment is stretched or compressed relative to its rest length.',
    restLength: 'The natural length of the segment when no forces are applied.'
};
