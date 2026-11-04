// Uniform spatial hash grid for fast local-neighbor queries.
// Buckets are kept alive across rebuilds (length reset, not reallocated) to avoid GC churn
// at populations up to ~10k agents rebuilding every simulation tick.
export class SpatialGrid {
  private cellSize: number
  private buckets = new Map<string, number[]>()
  private usedKeys: string[] = []

  constructor(cellSize: number) {
    this.cellSize = cellSize
  }

  setCellSize(size: number) {
    this.cellSize = size
  }

  private key(cx: number, cy: number, cz: number): string {
    return cx + '_' + cy + '_' + cz
  }

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize)
  }

  clear() {
    for (const k of this.usedKeys) {
      const b = this.buckets.get(k)
      if (b) b.length = 0
    }
    this.usedKeys.length = 0
  }

  insert(index: number, x: number, y: number, z: number) {
    const k = this.key(this.cellCoord(x), this.cellCoord(y), this.cellCoord(z))
    let bucket = this.buckets.get(k)
    if (!bucket) {
      bucket = []
      this.buckets.set(k, bucket)
    }
    if (bucket.length === 0) this.usedKeys.push(k)
    bucket.push(index)
  }

  // Visits every agent index in the 3x3x3 block of cells surrounding (x,y,z).
  forEachNear(x: number, y: number, z: number, visit: (index: number) => void) {
    const cx = this.cellCoord(x)
    const cy = this.cellCoord(y)
    const cz = this.cellCoord(z)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.buckets.get(this.key(cx + dx, cy + dy, cz + dz))
          if (!bucket) continue
          for (let i = 0; i < bucket.length; i++) visit(bucket[i])
        }
      }
    }
  }
}
