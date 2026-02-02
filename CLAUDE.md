# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run dev      # Start development server (http://localhost:5173)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run test     # Run tests in watch mode
npm run test:run # Run tests once
```

## Project Overview

Interactive 2D physics sandbox for exploring load and stress. Users create nodes via right-click menu, then connect them to form segments (beams, springs, cables). Run simulation to observe stress distribution.

## Interaction Model

**Modeless design** — click to select and connect, right-click for context menus.

- **Left-click on element**: Selects it (node, segment, or weight)
- **Left-click on node while another node is selected**: Creates a segment between them
- **Left-click on empty space while node selected**: Creates a new node there
- **Left-click on empty space with no selection**: Clears selection
- **Right-click on element**: Shows context menu (nodes: Pin/Delete; segments: Edit/Add Weight/Delete; weights: popup editor)
- **Right-click on empty space**: Shows "Add Node" menu
- **Delete/Backspace key**: Deletes the currently selected element
- **Node dragging**: Click and drag any node to reposition. Rest lengths recalculate on drop
- **Escape key**: Cancels current drag operation

## Tech Stack

- **Matter.js** — 2D physics engine (constraints, bodies, gravity)
- **Vite** — Build tool
- **Vanilla JavaScript** — No framework
- **HTML5 Canvas** — Custom rendering via `renderer.js`
- **Custom ContextMenu** — Right-click context menus with viewport boundary handling (in `context-menu.js`)

## Architecture

```
src/
├── main.js                    # PhysicsSandbox orchestrator (648 lines)
├── structure.js               # Node, Segment, Weight, StructureManager, MATERIALS
├── renderer.js                # Canvas rendering, stress colours, visual feedback
├── ui.js                      # UIController, DOM event handling, callbacks
│
├── position-utils.js          # Pure math: clampToCanvas, getPositionOnSegment
├── drag-controller.js         # Node dragging state machine
├── hover-controller.js        # Hover state tracking, cursor management
├── physics-controller.js      # Matter.js lifecycle, body/constraint creation
├── context-menu-controller.js # Menu factories, weight popup orchestration
│
├── context-menu.js            # Low-level context menu UI component
└── weight-popup.js            # Weight property editor popup
```

### Controller Pattern

Controllers follow a consistent callback-based pattern for decoupling:

```javascript
this.drag = new DragController({
    getBounds: () => ({ width: this.renderer.width, groundY: this.groundY }),
    getNodeRadius: () => Node.radius,
    onDragEnd: (node) => this.updateRestLengths(node)
});
```

Benefits:
- **Testable**: Controllers can be tested in isolation with mock callbacks
- **Explicit dependencies**: Dependencies are declared at construction
- **Single responsibility**: Each controller owns one concern

## Key Principles

### Prefer NPM Packages Over Bespoke Implementations

When implementing common UI patterns or utilities (context menus, drag-and-drop, date pickers, etc.), prefer well-maintained npm packages over custom implementations. Benefits include:
- Battle-tested edge case handling (viewport boundaries, accessibility, mobile support)
- Reduced maintenance burden
- Consistent behaviour across browsers

**Important**: Package selection must be validated by the project owner before installation. Present 2-3 options with trade-offs (size, popularity, features) and get approval.

Current external packages used:
- `matter-js` — Physics engine
- `vanilla-context-menu` — Listed in package.json but **unused** (custom implementation in context-menu.js)

### Rely on Matter.js

Prefer Matter.js APIs over custom physics implementations:
- Use `Matter.Vector` for vector math
- Use `Matter.Constraint` for segments
- Use `Matter.Events` for physics lifecycle hooks
- Use `Matter.Body` properties rather than manual calculations

### Tension/Compression-Only Segments

Matter.js doesn't have native one-way constraints. We implement this by:
1. Hooking into `Matter.Events.on(engine, 'beforeUpdate', ...)`
2. Checking segment length vs rest length
3. Setting `constraint.stiffness = 0` when segment should be slack
4. Using a tolerance band (0.5%) to prevent flickering

Always clean up event listeners in `stopSimulation()` to prevent accumulation.

### Stress Calculation

- `currentLength` is calculated once per frame in `updateConstraintModes()` and cached on the segment
- `updateStress()` reuses this cached value to avoid duplicate calculations
- Stress is amplified 50× for visualisation (stiff constraints show small deformations)

## Architectural Patterns

### Data-Driven Design

Prefer declarative data structures over imperative code. Configuration should be separated from behaviour.

**Example**: Menu items are plain objects `{ label, callback }` passed to a generic display function, rather than hardcoded UI construction. This makes menus easy to modify, test, and extend.

```javascript
// Good: Data-driven
const items = [
    { label: 'Delete', callback: () => this.delete(element) },
    { label: 'Edit', callback: () => this.edit(element) }
];
this.showMenu(event, items);

// Avoid: Imperative UI construction
const menu = document.createElement('div');
const deleteBtn = document.createElement('button');
deleteBtn.onclick = () => this.delete(element);
menu.appendChild(deleteBtn);
```

### Factory Method Pattern

Use factory methods to generate element-specific configurations. Each element type gets its own `get*Items()` method that returns the appropriate data structure.

```javascript
// Factory methods generate configuration for each element type
getNodeMenuItems(node) { return [...]; }
getSegmentMenuItems(segment) { return [...]; }

// Dispatcher routes to appropriate factory
onRightClick(e) {
    const node = this.findNodeAt(pos);
    if (node) {
        this.showContextMenu(e, this.getNodeMenuItems(node));
        return;
    }
    // ... check other element types
}
```

### Open/Closed Principle

Design systems that are **open for extension** but **closed for modification**. Adding new element types shouldn't require changes to existing code.

**Extending the context menu system**:
1. Create a new factory method: `getJointMenuItems(joint)`
2. Add detection logic in the dispatcher: `if (joint) { ... }`
3. Existing node/segment factories remain unchanged

### Node Hierarchy & Capability Getters

Nodes use inheritance with **capability getters** to enable polymorphism without scattered type checks:

```javascript
// Base class (structure.js)
class Node {
    get isEditable() { return true; }
    get isDeletable() { return true; }
    get isGroundAnchor() { return false; }
    setMass(value) { this.mass = value; }  // Normal behaviour
}

// Subclass overrides capabilities and uses no-ops
class GroundAnchor extends Node {
    get isEditable() { return false; }
    get isDeletable() { return false; }
    get isGroundAnchor() { return true; }
    setMass() { /* no-op */ }  // Safe to call, does nothing
}
```

**When to use which getter:**

| Getter | Use Case | Example |
|--------|----------|---------|
| `isEditable` | Behaviour decisions (UI, popups, drag) | `if (!node.isEditable) return;` in popup show() |
| `isDeletable` | Deletion guards | `if (!node.isDeletable) return;` in removeNode() |
| `isGroundAnchor` | Visual/rendering distinctions | Different radius, different appearance |

**Key pattern**: Prefer calling methods directly (e.g., `node.setMass(5)`) rather than checking type first. No-op implementations in subclasses make this safe.

### Centralised Element Detection

All element detection uses `findElementAt(x, y)` in main.js with strict priority order:

```javascript
findElementAt(x, y) {
    // Priority: weight > node > segment (smallest hit areas first)
    const weight = this.structure.findWeightAt(x, y);
    if (weight) return { type: 'weight', element: weight };

    const node = this.structure.findNodeAt(x, y);
    if (node) return { type: 'node', element: node };

    const segment = this.structure.findSegmentAt(x, y);
    if (segment) return { type: 'segment', element: segment };

    return null;
}
```

This centralised method is used by click handlers, hover detection, and context menus. Adding a new element type requires:
1. Adding detection to `findElementAt()` (respect priority order)
2. Adding handlers for click/hover/context menu as needed

### Separation of Concerns

Keep distinct responsibilities in separate functions:
- **Detection**: `findNodeAt()`, `findSegmentAt()` — locate elements
- **Configuration**: `getNodeMenuItems()` — generate options
- **Presentation**: `showContextMenu()` — display UI

This enables reuse (same detection for hover, click, context menu) and easier testing.

## Design System

**Maximalism/Dopamine** aesthetic with 5 accent colours:

```css
--accent-1: #FF3AF2;  /* Magenta */
--accent-2: #00F5D4;  /* Cyan */
--accent-3: #FFE600;  /* Yellow */
--accent-4: #FF6B35;  /* Orange */
--accent-5: #7B2FFF;  /* Purple */
```

Stress colours map to: Cyan (low) → Yellow (medium) → Orange (high) → Magenta (critical)

## Code Style

- Australian/British spelling (colour, centre, behaviour, initialise)
- JSDoc comments for public methods
- Callbacks use optional chaining (`this.onCallback?.(value)`)
- CSS uses BEM-ish naming with utility classes

## Common Patterns

### Adding a new material

1. Add to `MATERIALS` object in `structure.js`
2. Add button in `index.html` material-buttons section
3. Add preview styling in `styles.css`

### Adding a segment property

1. Add to `Segment` constructor in `structure.js`
2. Add UI control in `index.html` segment-options section
3. Add callback setter in `ui.js`
4. Wire up callback in `main.js` initUI()
5. Apply property in `startSimulation()` when creating constraints

### Adding a context menu for a new element type

1. Add factory method in `context-menu-controller.js`:
   ```javascript
   getMyElementMenuItems(element) {
       return [
           { label: 'Action', callback: () => this.structure.doAction(element) }
       ];
   }
   ```
2. Update `showElementMenu()` in `context-menu-controller.js` to handle the new type
3. Add `findMyElementAt()` method to `StructureManager` if needed
4. Update `findAllElementsAt()` in `main.js` to include the new element type

### Simulation lifecycle

```
startSimulation()
  → Clear world
  → Create bodies for nodes
  → Create constraints for segments
  → Register beforeUpdate event handler
  → Start runner

stopSimulation()
  → Stop runner
  → Remove event handlers (important!)
  → Update node positions from bodies
  → Clear constraints and reset visual state
  → Clear world
```

## Testing Checklist

When modifying physics behaviour:
- [ ] Start/stop simulation multiple times (no listener accumulation)
- [ ] Test with tension-only segments (cables go slack when compressed)
- [ ] Test with compression-only segments (struts disconnect when stretched)
- [ ] Verify stress colours update correctly
- [ ] Check that visual state resets when simulation stops

When modifying context menus or element interactions:
- [ ] Right-click on each element type shows correct menu
- [ ] Right-click on empty space shows "Add Node" menu
- [ ] Menu items reference correct element (not stale closures)
- [ ] Menus close properly after action
- [ ] Detection order is correct (specific elements before general)
- [ ] Delete/Backspace deletes selected element immediately

## Code Review Guide

Use this checklist when reviewing new features or significant changes.

### 1. Architecture Alignment

| Check | Question |
|-------|----------|
| Controller pattern | Does new code follow callback-based decoupling? |
| Single responsibility | Does each new class/function own exactly one concern? |
| Testability | Can new components be tested in isolation with mocks? |
| Extension points | Is the design open for extension without modifying existing code? |

### 2. Code Quality Checks

- [ ] **No dead code**: Remove unused methods, especially superseded factory methods
- [ ] **Array safety**: Guard against empty array access (e.g., `array[0]` without length check)
- [ ] **Cleanup**: Event listeners removed in `close()`/`destroy()` methods
- [ ] **Memory**: Maps/Sets cleared when operations complete
- [ ] **Null safety**: Use optional chaining (`?.`) for potentially null references

### 3. Test Coverage Requirements

| Component Type | Minimum Tests |
|----------------|---------------|
| Controller | State transitions, callbacks, edge cases |
| State machine | All states + transitions + cancellation |
| UI component | Show/hide/close, user interactions |
| Data methods | CRUD operations, boundary conditions |

Tests should follow the **"User Intent"** pattern with descriptive scenario names:
```javascript
describe('User draws selection box around nodes', () => {
    it('should select all nodes inside the box', () => { ... });
});
```

### 4. UI/UX Consistency

When adding new UI elements:
- [ ] Visual style matches existing components (glows, colours, borders)
- [ ] Popup/menu positioning handles viewport edges
- [ ] Scrubber controls follow existing drag-to-adjust pattern
- [ ] Selection visuals use cyan glow + dashed white indicator
- [ ] Panel updates reflect changes in real-time

### 5. Interaction Flow Verification

For new interaction patterns, document the flow:
```
trigger → controller method → state change → callback → UI update
```

Verify these edge cases:
- [ ] ESC cancellation restores original state
- [ ] Click suppression prevents accidental actions after drag/select
- [ ] Simulation start clears transient state (selection, drag, popups)
- [ ] Multiple rapid operations don't cause state corruption

### 6. Performance Considerations

| Scale | Approach |
|-------|----------|
| < 50 elements | Linear iteration acceptable |
| 50-200 elements | Consider caching frequent queries |
| > 200 elements | May need spatial indexing (quadtree) |

Current implementation uses linear iteration for `findNodesInRect()` — acceptable for typical use.

## Adding a New Controller

When creating a new controller (e.g., `SelectionBoxController`):

1. **Define the state machine**:
   ```javascript
   // States: idle → tracking → active → (end | cancel)
   this.isSelecting = false;
   this.startPos = null;
   ```

2. **Use callback-based dependencies**:
   ```javascript
   constructor(options = {}) {
       this.findNodesInRect = options.findNodesInRect ?? (() => []);
       this.onSelectionEnd = options.onSelectionEnd ?? (() => {});
   }
   ```

3. **Implement lifecycle methods**:
   - `begin*()` — Start tracking, store initial state
   - `update*()` — Process movement, return current state
   - `end*()` — Complete operation, call success callback
   - `cancel*()` — Abort operation, restore original state
   - `reset()` — Clear all state for reuse

4. **Add click suppression** if the operation could be mistaken for a click:
   ```javascript
   get shouldSuppressClick() { return this.wasJustActive; }
   clearClickSuppression() { this.wasJustActive = false; }
   ```

5. **Wire up in main.js**:
   - Instantiate with callbacks pointing to orchestrator methods
   - Route input events via `InputController`
   - Pass render state to `Renderer`

6. **Write tests** covering:
   - Initial state
   - State transitions (threshold detection)
   - Callback invocation with correct arguments
   - Cancellation and cleanup
   - User intent scenarios
