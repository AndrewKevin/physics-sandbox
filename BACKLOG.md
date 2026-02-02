# Backlog

Future enhancements and ideas for the Physics Sandbox.

---

## Visualisation

### Smart Stress Overlay
**Priority:** Low | **Effort:** Medium

Currently, segment stress labels and joint stress labels can overlap when both are enabled. A smarter overlay could:

1. Single "Show Stress" toggle that displays:
   - Segment stress % on segments (axial stress)
   - Joint stress % on nodes with 2+ segments (bending stress)
2. Collision detection to hide lower-priority labels when overlap detected
3. Or: automatically increase arc radius when segment labels are nearby

**Tradeoff:** Adds complexity for a niche case. Current workaround is toggling one overlay off.

---

## Physics

### Angular Constraint Forces
**Priority:** Medium | **Effort:** High

Joint stiffness currently visualises theoretical bending stress but doesn't apply actual torque forces. To make joints physically resist bending:

1. Hook into `Matter.Events.on(engine, 'beforeUpdate', ...)`
2. Calculate angular deviation from rest angle
3. Apply corrective torques to connected bodies
4. Consider damping to prevent oscillation

**Note:** Matter.js doesn't have native angular constraints, so this requires custom force application each frame.

---

## Performance

### Joint Data Caching
**Priority:** Low | **Effort:** Low

`JointController.computeJointData()` runs every frame when the overlay is enabled. For large structures (200+ nodes), consider:

1. Cache joint data and invalidate on structure change
2. Only recompute during simulation (angles are static in plan mode)

**Current state:** Acceptable for typical use (< 100 nodes).

---
