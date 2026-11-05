import * as THREE from 'three'
import { MAX_FISH, type PredatorSpecies } from '../sim/config'
import type { PredatorState } from '../sim/PredatorSystem'

/**
 * Interpolated positions for the current render frame, written once by the
 * fish/predator renderers and read by the camera, overlays and picking.
 */
export const renderFish = {
  count: 0,
  ids: new Int32Array(MAX_FISH),
  pos: new Float32Array(MAX_FISH * 3),
  dir: new Float32Array(MAX_FISH * 3),
  speed: new Float32Array(MAX_FISH),
}

export interface RenderPredator {
  id: number
  species: PredatorSpecies
  state: PredatorState
  length: number
  pos: THREE.Vector3
  dir: THREE.Vector3
  speed: number
}

export const renderPredators: RenderPredator[] = []

/** Find a fish by id in the current render frame (or -1). */
export function renderIndexOf(id: number) {
  const ids = renderFish.ids
  for (let i = 0; i < renderFish.count; i++) if (ids[i] === id) return i
  return -1
}
