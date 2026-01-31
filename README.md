# Physics Sandbox

An interactive 2D physics simulation for exploring load and stress. Build structures with nodes and segments, then watch them respond to gravity and forces.

## Features

- **Click-to-connect**: Click any two points to create a segment (nodes are created automatically)
- **Multiple materials**: Rigid beams, bouncy springs, and tension-only cables
- **Per-segment tuning**: Adjust stiffness and damping on individual segments
- **Stress visualisation**: Colour-coded strain (cyan → yellow → orange → magenta)
- **Fixed anchors**: Right-click nodes to pin them as support points
- **Real-time simulation**: Start/stop physics with Matter.js engine

## Installation

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Usage

### Modes

| Mode | Action |
|------|--------|
| **Connect** | Click any two points to create a segment. Nodes are created automatically, or existing nodes are reused. |
| **Select** | Click nodes or segments to view/edit properties. |
| **Delete** | Click nodes or segments to remove them. |

### Node Options

Right-click any node to open a context menu with:
- **Toggle Fixed Point**: Pin/unpin the node as an anchor
- **Delete Node**: Remove the node and its connected segments

### Materials

| Material | Behaviour |
|----------|-----------|
| **Rigid Beam** | High stiffness (0.9), resists both tension and compression equally |
| **Spring** | Low stiffness (0.2), stretches and bounces under load |
| **Cable** | Tension-only — goes slack when compressed |

### Segment Properties

When a segment is selected, you can adjust:

- **Material**: Change the base material type
- **Stiffness** (0.1–1.0): How rigid the segment is
- **Damping** (0.01–0.5): Energy absorption (higher = less oscillation)
- **Compression Only**: Acts like a strut — resists pushing but not pulling
- **Tension Only**: Acts like a rope — resists pulling but goes slack when pushed

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` or `C` | Connect mode |
| `2` or `S` | Select mode |
| `3` or `D` | Delete mode |
| `Space` | Start/stop simulation |
| `R` | Reset (clear all) |
| Right-click | Node context menu, or cancel current action |

## Stress Visualisation

During simulation, segments change colour based on strain:

| Colour | Stress Level |
|--------|--------------|
| Cyan | Low (< 25%) |
| Yellow | Medium (25–50%) |
| Orange | High (50–75%) |
| Magenta | Critical (> 75%) |

Slack segments (tension-only when compressed, or compression-only when stretched) appear as dashed lines with reduced opacity.

## Technical Details

### Physics Engine

Built on [Matter.js](https://brm.io/matter-js/), a 2D rigid body physics engine.

- Nodes become `Matter.Bodies.circle` during simulation
- Segments become `Matter.Constraint` with configurable stiffness/damping
- Gravity: 2× standard (for visible deformation)
- Fixed nodes are set to `isStatic: true`

### Tension/Compression-Only Behaviour

Matter.js constraints don't natively support one-way modes. The sandbox implements this by:

1. Checking segment length vs rest length each physics frame
2. Setting `constraint.stiffness = 0` when the segment should be inactive
3. Restoring stiffness when the segment re-engages

A small tolerance (0.5% of rest length) prevents flickering at the transition point.

## Project Structure

```
physics-sandbox/
├── index.html          # Layout and UI elements
├── styles.css          # Maximalism/Dopamine design system
├── src/
│   ├── main.js         # PhysicsSandbox class, simulation control
│   ├── structure.js    # Node, Segment, StructureManager classes
│   ├── renderer.js     # Canvas rendering, stress colours
│   └── ui.js           # UIController, event handling
├── package.json
└── README.md
```

## Tech Stack

- **Matter.js** — 2D physics engine
- **Vite** — Build tool and dev server
- **Vanilla JavaScript** — No framework dependencies
- **HTML5 Canvas** — Rendering

## Licence

MIT
