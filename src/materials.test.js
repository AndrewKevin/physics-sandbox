import { describe, it, expect } from 'vitest';
import {
    MATERIALS,
    MATERIAL_ORDER,
    getMaterialKeys,
    isValidMaterial,
    getDefaultMaterial,
    getMaterialPhysics,
    getMaterialVisuals
} from './materials.js';

/**
 * Tests for materials configuration.
 * These tests validate the structure and consistency of material definitions.
 * When adding a new material, these tests ensure it has all required properties.
 */
describe('Materials Configuration', () => {
    describe('MATERIALS structure', () => {
        it('should have at least one material defined', () => {
            expect(Object.keys(MATERIALS).length).toBeGreaterThan(0);
        });

        // Dynamically test each material has required properties
        const requiredPhysicsProps = ['stiffness', 'damping', 'compressionOnly', 'tensionOnly'];
        const requiredUIProps = ['label', 'shortLabel'];
        const requiredVisualProps = ['color', 'lineWidth', 'pattern', 'patternConfig'];

        Object.keys(MATERIALS).forEach(key => {
            describe(`Material: ${key}`, () => {
                const material = MATERIALS[key];

                it('should have all required physics properties', () => {
                    for (const prop of requiredPhysicsProps) {
                        expect(material).toHaveProperty(prop);
                    }
                });

                it('should have valid physics values', () => {
                    expect(material.stiffness).toBeGreaterThanOrEqual(0);
                    expect(material.stiffness).toBeLessThanOrEqual(1);
                    expect(material.damping).toBeGreaterThanOrEqual(0);
                    expect(material.damping).toBeLessThanOrEqual(1);
                    expect(typeof material.compressionOnly).toBe('boolean');
                    expect(typeof material.tensionOnly).toBe('boolean');
                });

                it('should not be both compression-only and tension-only', () => {
                    // A material cannot only resist compression AND only resist tension
                    expect(material.compressionOnly && material.tensionOnly).toBe(false);
                });

                it('should have all required UI properties', () => {
                    for (const prop of requiredUIProps) {
                        expect(material).toHaveProperty(prop);
                    }
                });

                it('should have non-empty label strings', () => {
                    expect(typeof material.label).toBe('string');
                    expect(material.label.length).toBeGreaterThan(0);
                    expect(typeof material.shortLabel).toBe('string');
                    expect(material.shortLabel.length).toBeGreaterThan(0);
                    expect(material.shortLabel.length).toBeLessThanOrEqual(3);
                });

                it('should have all required visual properties', () => {
                    for (const prop of requiredVisualProps) {
                        expect(material).toHaveProperty(prop);
                    }
                });

                it('should have valid visual values', () => {
                    expect(material.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
                    expect(material.lineWidth).toBeGreaterThan(0);
                    expect(['solid', 'dashed', 'zigzag', 'fibrous']).toContain(material.pattern);
                    expect(typeof material.patternConfig).toBe('object');
                });
            });
        });
    });

    describe('MATERIAL_ORDER consistency', () => {
        it('should contain all materials from MATERIALS', () => {
            const materialKeys = Object.keys(MATERIALS);
            for (const key of materialKeys) {
                expect(MATERIAL_ORDER).toContain(key);
            }
        });

        it('should only contain valid material keys', () => {
            for (const key of MATERIAL_ORDER) {
                expect(MATERIALS).toHaveProperty(key);
            }
        });

        it('should have no duplicates', () => {
            const uniqueKeys = new Set(MATERIAL_ORDER);
            expect(uniqueKeys.size).toBe(MATERIAL_ORDER.length);
        });

        it('should have same length as MATERIALS', () => {
            expect(MATERIAL_ORDER.length).toBe(Object.keys(MATERIALS).length);
        });
    });

    describe('Helper functions', () => {
        describe('getMaterialKeys', () => {
            it('should return all material keys', () => {
                const keys = getMaterialKeys();
                expect(keys).toEqual(Object.keys(MATERIALS));
            });
        });

        describe('isValidMaterial', () => {
            it('should return true for valid materials', () => {
                for (const key of Object.keys(MATERIALS)) {
                    expect(isValidMaterial(key)).toBe(true);
                }
            });

            it('should return false for invalid materials', () => {
                expect(isValidMaterial('nonexistent')).toBe(false);
                expect(isValidMaterial('')).toBe(false);
                expect(isValidMaterial(null)).toBe(false);
            });
        });

        describe('getDefaultMaterial', () => {
            it('should return a valid material key', () => {
                const defaultMat = getDefaultMaterial();
                expect(isValidMaterial(defaultMat)).toBe(true);
            });

            it('should return first material from MATERIAL_ORDER', () => {
                expect(getDefaultMaterial()).toBe(MATERIAL_ORDER[0]);
            });
        });

        describe('getMaterialPhysics', () => {
            it('should return physics properties for valid materials', () => {
                for (const key of Object.keys(MATERIALS)) {
                    const physics = getMaterialPhysics(key);
                    expect(physics).toHaveProperty('stiffness');
                    expect(physics).toHaveProperty('damping');
                    expect(physics).toHaveProperty('compressionOnly');
                    expect(physics).toHaveProperty('tensionOnly');
                }
            });

            it('should return fallback for invalid material', () => {
                const physics = getMaterialPhysics('nonexistent');
                expect(physics).toHaveProperty('stiffness');
            });
        });

        describe('getMaterialVisuals', () => {
            it('should return visual properties for valid materials', () => {
                for (const key of Object.keys(MATERIALS)) {
                    const visuals = getMaterialVisuals(key);
                    expect(visuals).toHaveProperty('color');
                    expect(visuals).toHaveProperty('lineWidth');
                    expect(visuals).toHaveProperty('pattern');
                    expect(visuals).toHaveProperty('patternConfig');
                }
            });

            it('should return fallback for invalid material', () => {
                const visuals = getMaterialVisuals('nonexistent');
                expect(visuals).toHaveProperty('color');
            });
        });
    });
});

/**
 * Contract tests - these define the interface that materials must satisfy.
 * Useful for documentation and ensuring compatibility.
 */
describe('Materials Contract', () => {
    it('materials should work with Segment constructor expectations', () => {
        // Segment constructor expects: stiffness, damping, compressionOnly, tensionOnly
        for (const key of Object.keys(MATERIALS)) {
            const mat = MATERIALS[key];
            expect(typeof mat.stiffness).toBe('number');
            expect(typeof mat.damping).toBe('number');
            expect(typeof mat.compressionOnly).toBe('boolean');
            expect(typeof mat.tensionOnly).toBe('boolean');
        }
    });

    it('materials should work with Renderer expectations', () => {
        // Renderer expects: color, lineWidth
        for (const key of Object.keys(MATERIALS)) {
            const mat = MATERIALS[key];
            expect(typeof mat.color).toBe('string');
            expect(typeof mat.lineWidth).toBe('number');
        }
    });

    it('materials should work with UI expectations', () => {
        // UI expects: label for display
        for (const key of Object.keys(MATERIALS)) {
            const mat = MATERIALS[key];
            expect(typeof mat.label).toBe('string');
        }
    });
});
