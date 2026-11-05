# Project: Sardine School — A Living Ocean

## 1. Project Objective

Build a scientifically inspired, visually breathtaking, interactive 3D website that simulates the natural schooling behavior of wild sardines in an open-ocean ecosystem.

The simulation must capture the extraordinary collective intelligence of thousands of sardines swimming together, forming dense, fluid, continuously changing schools that respond naturally to environmental conditions, food sources, and predators.

The experience should feel like observing a living marine ecosystem through the eyes of an underwater wildlife documentary filmmaker.

**Core vision:** Create a living ocean where thousands of individually autonomous sardines produce coordinated, lifelike collective behavior without scripted animations, centralized leadership, or predetermined formations.

The simulation must prioritize biological plausibility, emergent behavior, natural movement, environmental immersion, and interactive exploration.

---

## 2. Biological Foundation

Base the simulation on observable behaviors of wild sardines, particularly small pelagic species such as *Sardinops sagax*.

Distinguish between:

- **Shoaling:** Fish remaining together socially, without necessarily swimming in synchronized directions.
- **Schooling:** Fish swimming in coordinated directions with organized spatial relationships.
- **Bait balls:** Dense, compact defensive aggregations that can emerge when predators concentrate and constrain a school.

The default simulation should show normal schooling behavior, not a permanent bait ball or continuous predator attack.

The ocean must feel alive even when no predators are present.

### Fundamental principles

1. Every sardine is an independent agent.
2. Sardines respond primarily to nearby individuals and locally perceived environmental information.
3. No sardine possesses perfect global knowledge.
4. Collective formations emerge from individual decisions.
5. Fish constantly adjust their spacing, orientation, swimming speed, and local position.
6. School boundaries must remain fluid rather than rigid.
7. Predator responses should emerge from local threat perception, evasive movement, and group interactions.
8. Fish should not behave as identical units with perfectly synchronized animations.

Avoid modeling sardines as birds simply moving underwater. Account for aquatic locomotion, hydrodynamic constraints, body orientation, water currents, and underwater sensory information.

---

## 3. Autonomous Schooling Simulation

Implement a three-dimensional agent-based model inspired by Boids, extended with fish-specific behavioral rules.

### 3.1 Separation

Sardines maintain appropriate spacing to avoid collisions.

Requirements:

- Calculate short-range repulsive steering.
- Increase repulsion as neighboring fish become dangerously close.
- Permit dense formations without allowing physical intersections.
- Account for each fish's approximate body dimensions.
- Allow spacing to change based on speed and perceived danger.

### 3.2 Alignment

Fish tend to align their movement with nearby schoolmates.

Requirements:

- Calculate local swimming directions.
- Steer smoothly toward the local average heading.
- Avoid instantaneous direction changes.
- Support coordinated turning waves propagating across schools.

### 3.3 Cohesion

Sardines maintain proximity to their school.

Requirements:

- Calculate local attraction toward neighboring fish.
- Encourage isolated individuals to reconnect when appropriate.
- Prevent excessive attraction from collapsing all fish into one point.
- Permit multiple independent schools to form naturally.

### 3.4 Directional Information Propagation

When a sardine detects a disturbance, its response can affect surrounding fish.

Nearby individuals respond to changes in local motion, producing traveling waves of coordinated behavior.

This should generate:

- Rapid collective turns
- Localized compression
- Traveling motion waves
- Sudden directional reversals
- School deformation
- Temporary fragmentation
- Reconnection of groups

Do not broadcast a single global steering command to every sardine.

### 3.5 Sensory Perception

Approximate fish sensory systems using:

**Vision**

- Direction-dependent awareness
- Configurable visual range
- Nearby fish detection
- Predator detection
- Reduced visibility in turbid water

**Lateral line approximation**

- Sensitivity to nearby motion and disturbances
- Short-range responses to relative velocity and movement
- Improved local coordination in dense schools

Treat these as simplified behavioral models, not full physiological simulations.

### 3.6 Swimming Biomechanics

Represent sardines as streamlined aquatic swimmers.

Include:

- Tail-driven propulsion
- Lateral body undulation
- Smooth acceleration and deceleration
- Realistic turning constraints
- Banking or rolling during sharp turns when appropriate
- Subtle individual differences in swimming rhythm
- Speed-dependent tailbeat frequency
- Energy-conscious cruising behavior

Swimming should appear continuous, purposeful, and physically constrained.

Avoid teleportation, sideways sliding, excessive spinning, or abrupt changes in orientation.

---

## 4. Emergent School Formations

The simulation should naturally produce different collective configurations.

### 4.1 Traveling Schools

The default behavior.

Fish travel in a generally coordinated direction while maintaining fluid spacing and changing positions within the school.

The school may stretch, curve, compress, expand, or change course.

### 4.2 Dense Schools

When local conditions favor stronger grouping, sardines increase their packing density.

The result should be a coordinated, fluid mass with visible individual movement.

### 4.3 Elongated Schools

Fish may form long, flowing aggregations during travel or environmental responses.

These formations should stretch and contract dynamically.

### 4.4 Circular and Milling Formations

Under suitable local conditions, fish may swim along circulating trajectories.

Support clockwise and counterclockwise motion, potentially including different moving layers.

Do not force all schools to circle permanently.

### 4.5 School Splitting and Merging

Schools should be able to separate into distinct groups and later reconnect.

Splitting can occur because of:

- Predator movement
- Local evasive responses
- Physical obstacles
- Competing environmental cues
- Local differences in swimming direction

Merging should occur through local attraction, alignment, and compatible movement rather than teleportation or global commands.

### 4.6 Bait Ball Formation

Implement bait balls as an emergent defensive response to predator pressure.

Under sustained, spatially constrained attacks, sardines may compress into dense, approximately spherical or irregular aggregations.

Requirements:

- Increasing local density
- Rapid collective turning
- Continuous internal rearrangement
- Three-dimensional movement
- Irregular, pulsating surfaces
- Local gaps and compression waves
- Temporary fragmentation
- Escape attempts
- Eventual dispersal or reformation

A bait ball must not be represented by simply placing fish on a sphere or making every fish orbit a fixed center.

Its geometry should result from interactions between schooling, predator avoidance, spatial constraints, and individual steering.

Predator presence should not automatically trigger a perfect spherical bait ball.

---

## 5. Predator–Prey Ecosystem

Implement optional predators that interact with sardines through meaningful behavioral rules.

### 5.1 Predator Species

Support multiple predator types with distinct hunting behaviors.

**Dolphins**

- Pursue sardine schools.
- Perform coordinated herding approximations.
- Pressure groups toward denser formations.
- Attempt to isolate or capture fish.

**Sharks**

- Approach and pursue schools.
- Trigger localized escape responses.
- Disrupt school structure during attacks.

**Sailfish**

- Perform fast approaches.
- Target accessible individuals near school boundaries.
- Execute rapid lateral attacks.

**Seabirds**

- Detect fish near the water surface.
- Dive toward accessible prey.
- Create brief localized disturbances.

Predators must not all share identical movement behavior.

### 5.2 Sardine Defensive Responses

Individual sardines should respond to predators based on locally perceived danger.

Possible behaviors:

- Increase swimming speed.
- Turn sharply within biomechanical limits.
- Move away from approaching threats.
- Adjust grouping strength.
- Follow nearby evasive movements.
- Seek less exposed positions.
- Compress into tighter schools.
- Break away through available escape routes.

These responses must compete with ordinary schooling forces.

### 5.3 Dynamic Predator Pressure

Represent threat using distance, approach direction, predator speed, visibility, and local exposure.

The effect should vary across the school.

Fish closest to a predator should generally react before distant fish that have not yet detected the threat.

### 5.4 Predator Capture

Optionally simulate individual prey capture.

Requirements:

- Predators must physically approach potential targets.
- Captures require plausible proximity and attack conditions.
- Captured fish are removed from the active population.
- Sardines should not disappear arbitrarily.
- School structure should adapt following attacks.

Include a nonlethal demonstration mode that preserves the sardine population.

---

## 6. Marine Environment

Create a beautiful, believable open-ocean environment.

### 6.1 Underwater Atmosphere

Include:

- Realistic oceanic blue-green water
- Depth-dependent light attenuation
- Soft underwater haze
- Sunlight penetrating from the surface
- Volumetric-looking light shafts where performant
- Moving surface waves
- Underwater shadows and silhouettes
- Suspended particles and plankton
- Distance-dependent visibility

Avoid making the ocean look like an empty blue room.

### 6.2 Ocean Surface

Implement a believable water surface visible from below.

Include:

- Dynamic wave movement
- Distorted sunlight
- Surface reflections or refractions where feasible
- Bright shifting light patterns
- Visible silhouettes of nearby fish

The water surface should also serve as a meaningful movement boundary.

### 6.3 Depth Behavior

Allow schools to move vertically through the water column.

Requirements:

- Natural depth variation
- Smooth ascending and descending
- Environmental preferences
- Avoidance of unrealistic surface penetration
- Response to predator threats from above or below

### 6.4 Water Currents

Introduce three-dimensional ocean-current fields.

Currents should:

- Influence fish movement relative to the environment.
- Affect school displacement.
- Produce subtle local variations.
- Remain physically coherent rather than generating random jitter.

Fish should swim relative to moving water, not simply receive arbitrary external position offsets.

### 6.5 Food and Foraging

Introduce optional plankton-rich feeding zones.

Sardines should be able to:

- Detect nearby food opportunities.
- Loosen their school structure during feeding when appropriate.
- Move toward favorable feeding areas.
- Balance food attraction against schooling and predator avoidance.

Avoid turning feeding into a rigid swarm that always converges on a single point.

---

## 7. Realistic Fish Appearance and Animation

Render sardines as recognizable, streamlined, silver-bodied fish.

### Fish anatomy

Include:

- Elongated, tapered body
- Silvery reflective sides
- Darker dorsal surface
- Lighter underside
- Forked tail
- Dorsal and other visible fins
- Proper head and eye placement

Use low-poly or optimized detailed models depending on the quality preset.

### Animation

Implement procedural swimming animation.

- Tail oscillation drives the visual impression of propulsion.
- Body bending diminishes toward the head.
- Swimming frequency responds to speed.
- Individual fish have slight phase differences.
- Rapid escape swimming appears more vigorous than steady cruising.

### Reflective Scales

Sardines should produce characteristic flashes of reflected light as they turn.

Use physically inspired lighting approximations so coordinated movement creates shimmering bands across the school.

These flashes must depend on fish orientation, light direction, and camera position rather than random blinking.

Avoid unnecessary glowing effects or fantasy coloration.

---

## 8. Camera System and Exploration

Create an immersive underwater camera experience.

### Camera modes

**Free Exploration**

Allow users to orbit, pan, and zoom around schools.

**Underwater Drone**

Allow smooth free movement through the water.

**Follow School**

Track a school while maintaining cinematic framing.

**Follow Individual**

Select one sardine and follow its movement.

**Predator Perspective**

Follow a predator as it approaches or hunts.

**Cinematic Documentary**

Automatically frame interesting activity with smooth, restrained camera movement.

Camera motion should avoid abrupt snapping and disorienting rotations.

---

## 9. Interactive User Controls

Provide a refined, collapsible control panel.

### Schooling Parameters

- Sardine population
- Cruising speed
- Maximum burst speed
- Separation strength
- Alignment strength
- Cohesion strength
- Sensory range
- Neighbor interaction limit
- Turning responsiveness
- Preferred spacing
- Density response
- Individual variation

### Environment Parameters

- Water visibility
- Current strength
- Current direction
- Sunlight intensity
- Ocean depth
- Plankton concentration
- Surface wave intensity

### Predator Parameters

- Predator species
- Predator count
- Hunting intensity
- Detection range
- Capture enabled/disabled
- Predator movement speed

### Simulation Controls

- Pause/resume
- Reset
- Randomize initial conditions
- Slow motion
- Simulation speed adjustment
- Restore defaults
- Screenshot capture
- Quality preset selection

Make adjustable settings functional, not merely decorative.

---

## 10. Interactive Scientific Visualization

Allow users to inspect the underlying simulation.

### Individual Sardine Inspection

Selecting a fish should display:

- Unique agent ID
- Current speed
- Swimming direction
- Local neighbor count
- Nearest predator distance
- Perceived threat level
- Current behavior or behavioral weights

### Behavioral Overlays

Provide optional overlays for:

- Velocity vectors
- Separation forces
- Alignment forces
- Cohesion forces
- Predator avoidance forces
- Sensory neighborhoods
- Ocean-current vectors

### School Statistics

Display:

- Active fish count
- Number of detected schools
- Average swimming speed
- Average nearest-neighbor distance
- Estimated packing density
- School polarization or directional alignment
- Current predator activity
- Simulation frame rate

School counts should be derived from actual spatial or behavioral clustering.

Statistics should be calculated from the simulation rather than hardcoded.

---

## 11. Simulation Scenarios

Include configurable scenarios demonstrating natural sardine behavior.

### Scenario A — Open Ocean

A large sardine school travels peacefully through clear water.

Focus on ordinary schooling and coordinated movement.

### Scenario B — Ocean Current

Sardines navigate a changing current field.

Focus on the distinction between swimming direction and movement over the seafloor.

### Scenario C — Feeding Grounds

A school encounters a plankton-rich area.

Observe changes in spacing, direction, and movement while feeding.

### Scenario D — Predator Encounter

A predator approaches an otherwise undisturbed school.

Observe local escape responses spreading through the group.

### Scenario E — Bait Ball

Multiple predators apply sustained pressure, potentially creating an increasingly compact defensive aggregation.

Allow gaps, escape attempts, fragmentation, and imperfect formations.

### Scenario F — Sardine Run

Create a documentary-inspired scenario based on the large sardine migrations off southern Africa.

Include traveling sardine aggregations, environmental movement, and the possibility of encounters with dolphins, sharks, and seabirds.

Do not represent this exceptional seasonal event as the everyday behavior of every sardine population.

Each scenario must initialize a coherent environment and use the same underlying behavioral simulation rather than playing a prerecorded sequence.

---

## 12. User Interface and Experience

The website should feel like an interactive natural-history documentary.

### Design direction

- Minimalist
- Cinematic
- Scientifically inspired
- Elegant typography
- Translucent floating panels
- Restrained animations
- Immersive fullscreen environment

The ocean scene must remain the visual focus.

### Interface Layout

**Primary Viewport**

Fullscreen interactive 3D ocean.

**Top Overlay**

Project title, scenario name, and compact simulation status.

**Control Panel**

Collapsible controls organized into schooling, environment, predators, camera, and visualization.

**Information Panel**

Brief explanations of observed behaviors and experimental parameters.

**Scenario Selector**

Allow quick transitions between the predefined ecological scenarios.

Include a clean loading experience and accessible input controls.

Support desktop and mobile where feasible, with reduced simulation complexity on constrained devices.

---

## 13. Technical Architecture

Preferred technology stack:

- React
- TypeScript
- Three.js / React Three Fiber
- Vite
- Tailwind CSS
- WebGL, with optional GPU acceleration

### System Modules

Separate:

1. Sardine agent state and simulation
2. Neighborhood search and spatial partitioning
3. Behavioral steering calculations
4. Predator AI
5. Environmental and ocean-current simulation
6. School detection and statistics
7. Fish geometry and animation
8. Rendering and lighting
9. Camera management
10. UI and user interaction

Do not run thousands of independent fish movement updates through React component state.

### Simulation Architecture

Use fixed-timestep simulation updates with interpolated rendering.

Implement efficient spatial indexing for local neighbor searches.

Avoid naive all-pairs distance comparisons as the primary algorithm for large populations.

Use object pooling, reusable buffers, typed arrays, instanced geometry, and efficient batch updates where appropriate.

Consider worker-based simulation or GPU computation if measured performance justifies additional complexity.

### Scaling

Support practical population presets such as:

- Low: 250 fish
- Medium: 1,000 fish
- High: 5,000 fish
- Extreme: 10,000+ fish, only where hardware and implementation permit

These are performance targets, not guaranteed population capacities.

Maintain stable movement quality as fish counts increase.

Do not simplify the simulation into arbitrary particle animation solely to reach a higher fish count.

### Performance Targets

- Aim for 60 FPS on capable desktops.
- Preserve responsiveness on supported mobile devices.
- Use adaptive quality settings.
- Monitor simulation and rendering performance separately.
- Gracefully reduce visual effects or population when necessary.

---

## 14. Scientific Credibility

The simulation must distinguish between:

**Observed behavior**

Examples include schooling, collective turning, predator avoidance, school splitting and merging, and variation in school density.

**Model approximations**

Examples include numerical sensory ranges, exact steering weights, simplified predator decision-making, and approximated lateral-line responses.

Do not present guessed values as universal biological measurements.

Use documented, configurable parameters where reliable evidence is unavailable.

Prioritize realistic outcomes over biologically unjustified complexity.

Include short educational explanations of the behaviors being simulated.

---

## 15. Development Sequence

Implement the project incrementally.

**Phase 1 — Core Simulation**

Build a working 3D sardine school using autonomous swimming, separation, alignment, cohesion, and collision avoidance.

**Phase 2 — Realistic Movement**

Add fish body geometry, procedural tail animation, swimming constraints, coordinated turns, and stable school dynamics.

**Phase 3 — Ocean Environment**

Add underwater lighting, water surface, depth, currents, and atmospheric rendering.

**Phase 4 — Predator Interactions**

Implement predator behaviors, local threat perception, escape responses, and possible bait ball formation.

**Phase 5 — Interactive Experience**

Add camera modes, parameter controls, scientific overlays, and simulation scenarios.

**Phase 6 — Optimization and Polish**

Profile performance, improve visuals, refine behavioral realism, test edge cases, and finalize the interface.

Each phase should preserve a functional application.

---

## 16. Acceptance Criteria

The project is complete when:

1. Every sardine behaves as an independent agent.
2. Fish exhibit recognizable, coordinated schooling.
3. Schools can change density and shape naturally.
4. Collective turns propagate through local interactions.
5. Fish swim with plausible body and tail movement.
6. Sardines avoid unrealistic collisions and instantaneous turns.
7. Predator encounters produce localized, believable defensive responses.
8. Bait balls can emerge under suitable pressure without predetermined geometry.
9. Schools can naturally fragment and merge.
10. Ocean currents influence fish movement meaningfully.
11. Fish reflect underwater light according to their orientation.
12. The camera supports immersive exploration and individual tracking.
13. Simulation controls visibly affect behavior.
14. Scientific overlays accurately represent underlying computed values.
15. The website remains responsive at supported population levels.
16. Ordinary schooling remains interesting even without predators.

## Final Guiding Principle

**Do not build an animated ball of sardines. Build a living school of fish.**

The beauty of this simulation must come from thousands of simple, autonomous decisions interacting over time.

The most impressive result should not be a perfectly choreographed formation. It should be the spontaneous emergence of complex, fluid, unpredictable, yet biologically recognizable collective behavior.

Make the experience feel like being underwater beside an actual school of wild sardines.