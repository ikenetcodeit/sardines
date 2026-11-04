import type { SardineSimulation } from './SardineSimulation'
import type { PredatorSystem } from './PredatorSystem'

// Per-frame simulation state the camera rig needs (school centroid, a
// followable fish, predator positions) changes 60x/second — routing it
// through zustand would force a React re-render every frame. This mutable
// singleton is the escape hatch: SardineField writes it, CameraRig reads it,
// neither triggers a render.
export const simRefs: {
  sim: SardineSimulation | null
  predators: PredatorSystem | null
  centroidX: number
  centroidY: number
  centroidZ: number
} = {
  sim: null,
  predators: null,
  centroidX: 0,
  centroidY: 0,
  centroidZ: 0,
}
