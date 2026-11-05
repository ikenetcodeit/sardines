# Sardine School — A Living Ocean

An interactive 3D simulation of wild sardine (*Sardinops sagax*-like) schooling. Thousands of
independent agents, each perceiving only its local surroundings, produce traveling schools,
turning waves, splits and merges, foraging, escape responses and bait balls — none of it scripted.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run headless -- open 60          # run a scenario without rendering and print statistics
npm run headless -- baitball 90 3000 # (scenario, seconds, optional population)
```

Scenarios: `open`, `current`, `feeding`, `predator`, `baitball`, `run`.

## Using it

- **Scenarios A–F** (bottom bar): Open Ocean, Ocean Current, Feeding Grounds, Predator Encounter,
  Bait Ball, Sardine Run. Each initialises a coherent environment and runs the same simulation.
- **Click a fish** to inspect it (ID, speed, heading, neighbours, nearest predator, threat, alarm,
  behaviour and its weighted steering terms). *Follow* rides alongside it; *Senses* shows its
  visual range, lateral-line range, rear blind zone and the neighbours it is attending to.
- **Controls** panel: schooling, environment, predators, camera, visualisation, simulation.
- **Camera modes**: Documentary (automatic director), Free orbit, Drone (WASD + Q/E, Shift, drag to
  look), Follow school, Follow fish, Predator.
- Keys: `Space` pause · `S` slow motion · `R` reset · `P` screenshot · `Esc` deselect.

## Architecture

| Concern | Where |
| --- | --- |
| Agent state + per-fish behaviour (perception, steering, swimming constraints) | `src/sim/SardineSchool.ts` |
| Neighbourhood search (uniform grid, counting sort, shell search) | `src/sim/SpatialGrid.ts` |
| Steering helpers (constrained turning, pitch limit, threat model) | `src/sim/steering.ts` |
| Predator AI (dolphin pods, sharks, sailfish, gannets; captures) | `src/sim/PredatorSystem.ts` |
| Currents, plankton patches, obstacles, disturbances | `src/sim/Environment.ts` |
| School detection (union–find over perceived neighbours) and statistics | `src/sim/SchoolAnalysis.ts` |
| Fixed-timestep orchestration, scenarios | `src/sim/Simulation.ts`, `src/sim/scenarios.ts` |
| Off-main-thread execution + snapshot protocol | `src/sim/worker.ts`, `src/sim/protocol.ts`, `src/sim/client.ts` |
| Fish geometry + procedural swimming shader | `src/render/fishGeometry.ts`, `src/render/SardineField.tsx` |
| Ocean: Snell's window surface, caustics, haze, light shafts, particles | `src/render/Ocean.tsx`, `src/render/underwater.ts`, `src/render/envMap.ts` |
| Camera modes | `src/render/CameraRig.tsx` |
| Overlays (forces, senses, currents, schools) | `src/render/Overlays.tsx` |
| UI state and controls | `src/store/useSimStore.ts`, `src/ui/*` |

The simulation runs in a **Web Worker** at a fixed 30 Hz step using structure-of-arrays typed
buffers. After each step the worker posts a compact snapshot (transferred, not copied); the main
thread renders all fish as one instanced mesh, interpolating between the two latest snapshots, and
animates tail beats continuously in the vertex shader. If the worker cannot keep up, simulated time
slows rather than the page freezing. React never holds per-fish state. Render and simulation cost
are reported separately (Controls → Simulation), and auto-quality lowers visual effects, then
population, when the frame rate stays low.

Rough cost of one simulation step on a mid-range laptop CPU: ~6 ms for 2,000 fish, ~15 ms for
3,500 fish with predators. Population presets per quality level: Low 250, Medium 1,000,
High 5,000, Ultra 10,000+ (where hardware permits).

## The model — observed behaviour vs. approximation

**Observed in wild fish (what the model aims to reproduce):** schooling vs. shoaling, collective
turns that propagate as waves, startle/escape waves, the fountain effect around an approaching
predator, compression under threat (selfish herd), bait balls under sustained, constrained
pressure, splitting and merging of schools, loosened structure while feeding, and flashing of
silver flanks as fish roll.

**Model approximations (all tunable, none are measured constants):**

- *Perception*: each fish attends to its *K* nearest schoolmates (default 8) within a visual range
  limited by water visibility, ignoring a ~20° rear blind zone; a short-range (5 body lengths)
  omnidirectional "lateral line" also detects fish and large moving bodies behind it.
- *Social forces*: separation grows steeply inside a preferred spacing (in body lengths), alignment
  averages neighbours' headings (stronger for very close and for alarmed neighbours), cohesion
  attracts only beyond the preferred spacing so schools never collapse to a point.
- *Information transfer*: alarm and escape direction are copied from alarmed neighbours with loss
  at each hop; the update is synchronous so information travels one neighbourhood per step.
- *Large-school visibility*: stragglers and small groups can see much larger aggregations up to
  ~70% of the water visibility (max 30 m) and drift toward them. This is what lets fragments re-merge.
- *Threat*: combines distance, approach speed, predator conspicuity and the fish's exposure
  (edge fish feel more). Threats from opposing sides cancel; this "confinement" weakens alignment
  while cohesion holds, which is how bait balls can emerge (dolphins never place fish anywhere).
- *Swimming*: velocity always points along the body (no sideways sliding); turn rate and pitch are
  limited and rise with alarm; speed relaxes toward an individual cruising speed, bursts deplete a
  fatigue budget; tail-beat frequency rises with speed and the tail coasts when decelerating.
- *Currents*: fish swim relative to moving water; the field is a sheared mean flow plus eddies
  derived from a stream function (divergence-free in the horizontal plane).
- *Predators*: tactics are simplified state machines — dolphin pods share information and take
  slots around a school, mostly beside and below it; sharks patrol then charge; sailfish stalk
  the edge and slash; gannets circle and plunge-dive. A capture requires the mouth/bill to be
  physically at a fish during a strike; "non-lethal demo" mode keeps the population intact.
- *Statistics* are computed from the simulation: schools are connected components of the
  perceived-neighbour graph (links ≤ ~7 preferred spacings); polarization is the mean heading
  length, rotation is Couzin's milling order parameter, density is local `(k+1)/(4/3·π·r_k³)`.
  The "observed state" label is a rule-based classification of those measurements.

The Sardine Run scenario is inspired by the exceptional winter migration along South Africa's east
coast and is not presented as typical sardine behaviour.
