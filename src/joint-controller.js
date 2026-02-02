/**
 * JointController - Calculates angles and torques at node joints
 *
 * At nodes where 2+ segments meet, computes:
 * - Angle between each segment pair
 * - Torque required to maintain angle (based on deviation from rest angle)
 */

import Matter from 'matter-js';

export class JointController {
    /**
     * Calculate joint data for all nodes with 2+ segments.
     * @param {StructureManager} structure - The structure to analyse
     * @param {boolean} simulating - Whether physics simulation is running
     * @returns {Map<Node, JointData>} Map of nodes to their joint data
     */
    computeJointData(structure, simulating) {
        const jointMap = new Map();

        for (const node of structure.nodes) {
            const segments = structure.getSegmentsAtNode(node);
            if (segments.length < 2) continue;

            const anglePairs = this.computeAnglePairs(node, segments, simulating);
            jointMap.set(node, { anglePairs });
        }

        return jointMap;
    }

    /**
     * Compute all angle pairs for a node.
     * For n segments, returns n*(n-1)/2 pairs.
     * @param {Node} node - The junction node
     * @param {Segment[]} segments - Segments connected to node
     * @param {boolean} simulating - Whether physics is running
     * @returns {Array} Array of angle pair data
     */
    computeAnglePairs(node, segments, simulating) {
        const pairs = [];

        // All pairs: n*(n-1)/2
        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const angle = this.calculateAngle(node, segments[i], segments[j], simulating);
                const restAngle = this.calculateAngle(node, segments[i], segments[j], false);
                const torque = simulating
                    ? this.calculateTorque(angle, restAngle, node.angularStiffness)
                    : 0;

                pairs.push({
                    segmentA: segments[i],
                    segmentB: segments[j],
                    angle,
                    restAngle,
                    torque,
                    normalisedTorque: Math.min(torque * 10, 1)  // Amplify for visibility
                });
            }
        }

        return pairs;
    }

    /**
     * Calculate angle between two segments at a node.
     * @param {Node} node - The junction node
     * @param {Segment} segA - First segment
     * @param {Segment} segB - Second segment
     * @param {boolean} simulating - Use physics body positions if true
     * @returns {number} Angle in radians (0 to PI)
     */
    calculateAngle(node, segA, segB, simulating) {
        const getPos = (n) => simulating && n.body
            ? n.body.position
            : { x: n.x, y: n.y };

        const posNode = getPos(node);

        // Get the "other" node for each segment (not the junction node)
        const otherA = segA.nodeA === node ? segA.nodeB : segA.nodeA;
        const otherB = segB.nodeA === node ? segB.nodeB : segB.nodeA;

        const posA = getPos(otherA);
        const posB = getPos(otherB);

        // Vectors from junction to other nodes
        const vecA = Matter.Vector.sub(posA, posNode);
        const vecB = Matter.Vector.sub(posB, posNode);

        // Angle between vectors using dot product
        const dot = Matter.Vector.dot(vecA, vecB);
        const magA = Matter.Vector.magnitude(vecA);
        const magB = Matter.Vector.magnitude(vecB);

        // Guard against division by zero (degenerate case)
        if (magA === 0 || magB === 0) return 0;

        const cosAngle = dot / (magA * magB);

        // Clamp for numerical stability
        return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    }

    /**
     * Calculate torque required to maintain an angle.
     * @param {number} currentAngle - Current angle in radians
     * @param {number} restAngle - Rest angle in radians
     * @param {number} angularStiffness - Stiffness (0-1)
     * @returns {number} Torque magnitude
     */
    calculateTorque(currentAngle, restAngle, angularStiffness) {
        const deviation = Math.abs(currentAngle - restAngle);
        return angularStiffness * deviation;
    }

}
