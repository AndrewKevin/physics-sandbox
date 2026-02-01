# Physics Sandbox - Project Instructions

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
├── main.js          # PhysicsSandbox class, simulation lifecycle, Matter.js integration
├── structure.js     # Node, Segment, Weight, StructureManager classes, MATERIALS definitions
├── renderer.js      # Canvas rendering, stress colours, visual feedback
├── ui.js            # UIController, DOM event handling, callbacks
├── context-menu.js  # Custom context menu with viewport boundary handling
└── weight-popup.js  # Weight property editor popup with scrubber controls
```

## Key Principles

### Prefer NPM Packages Over Bespoke Implementations

When implementing common UI patterns or utilities (context menus, drag-and-drop, date pickers, etc.), prefer well-maintained npm packages over custom implementations. Benefits include:
- Battle-tested edge case handling (viewport boundaries, accessibility, mobile support)
- Reduced maintenance burden
- Consistent behaviour across browsers

**Important**: Package selection must be validated by the project owner before installation. Present 2-3 options with trade-offs (size, popularity, features) and get approval.

Current external packages used:
- `matter-js` — Physics engine

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

### Type-Based Dispatching

When handling events that affect different element types, use a dispatcher that:
1. Detects the element type at the event location
2. Routes to the appropriate handler
3. Falls through to default behaviour if no element matched

Order matters — check more specific/smaller elements first (nodes before segments).

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

1. Create factory method in `main.js`:
   ```javascript
   getMyElementMenuItems(element) {
       return [
           { label: 'Action', callback: () => this.doAction(element) }
       ];
   }
   ```
2. Add detection in `onRightClick()` dispatcher (order matters — specific before general):
   ```javascript
   const element = this.structure.findMyElementAt(pos.x, pos.y);
   if (element) {
       this.showContextMenu(e, this.getMyElementMenuItems(element));
       return;
   }
   ```
3. Add `findMyElementAt()` method to `StructureManager` if needed

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
