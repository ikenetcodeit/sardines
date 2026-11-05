/**
 * Uniform spatial grid rebuilt every tick with a counting sort.
 *
 * The grid covers the axis-aligned bounding box of the agents. If the box is
 * very large (fragmented schools far apart) the cell size grows so the number
 * of cells stays bounded; queries remain exact because they always check
 * real distances.
 */
export class SpatialGrid {
  cellSize = 1
  minX = 0
  minY = 0
  minZ = 0
  nx = 1
  ny = 1
  nz = 1
  /** cellStart[c]..cellStart[c+1] index into `items`. */
  cellStart: Int32Array
  items: Int32Array
  private cellOf: Int32Array
  private offsets: Int32Array
  readonly maxCells: number

  constructor(capacity: number, maxCells = 1 << 18) {
    this.maxCells = maxCells
    this.cellStart = new Int32Array(maxCells + 1)
    this.offsets = new Int32Array(maxCells)
    this.items = new Int32Array(capacity)
    this.cellOf = new Int32Array(capacity)
  }

  build(pos: Float32Array, count: number, baseCellSize: number) {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3]
      const y = pos[i * 3 + 1]
      const z = pos[i * 3 + 2]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
    if (count === 0) {
      minX = minY = minZ = 0
      maxX = maxY = maxZ = 1
    }
    let cs = baseCellSize
    let nx = 1
    let ny = 1
    let nz = 1
    for (;;) {
      nx = Math.floor((maxX - minX) / cs) + 1
      ny = Math.floor((maxY - minY) / cs) + 1
      nz = Math.floor((maxZ - minZ) / cs) + 1
      if (nx * ny * nz <= this.maxCells) break
      cs *= 1.26
    }
    this.cellSize = cs
    this.minX = minX
    this.minY = minY
    this.minZ = minZ
    this.nx = nx
    this.ny = ny
    this.nz = nz
    const ncell = nx * ny * nz
    const start = this.cellStart
    start.fill(0, 0, ncell + 1)
    const inv = 1 / cs
    for (let i = 0; i < count; i++) {
      const cx = Math.floor((pos[i * 3] - minX) * inv)
      const cy = Math.floor((pos[i * 3 + 1] - minY) * inv)
      const cz = Math.floor((pos[i * 3 + 2] - minZ) * inv)
      const c = (cy * nz + cz) * nx + cx
      this.cellOf[i] = c
      start[c + 1]++
    }
    for (let c = 0; c < ncell; c++) start[c + 1] += start[c]
    const off = this.offsets
    off.set(start.subarray(0, ncell))
    for (let i = 0; i < count; i++) {
      this.items[off[this.cellOf[i]]++] = i
    }
  }

  cellX(x: number) {
    const c = Math.floor((x - this.minX) / this.cellSize)
    return c < 0 ? 0 : c >= this.nx ? this.nx - 1 : c
  }
  cellY(y: number) {
    const c = Math.floor((y - this.minY) / this.cellSize)
    return c < 0 ? 0 : c >= this.ny ? this.ny - 1 : c
  }
  cellZ(z: number) {
    const c = Math.floor((z - this.minZ) / this.cellSize)
    return c < 0 ? 0 : c >= this.nz ? this.nz - 1 : c
  }

  /** Visit every item within `r` of (x,y,z). Callback returns false to stop. */
  query(
    pos: Float32Array,
    x: number,
    y: number,
    z: number,
    r: number,
    cb: (i: number, d2: number) => boolean | void,
  ) {
    const cs = this.cellSize
    const x0 = Math.max(0, Math.floor((x - r - this.minX) / cs))
    const x1 = Math.min(this.nx - 1, Math.floor((x + r - this.minX) / cs))
    const y0 = Math.max(0, Math.floor((y - r - this.minY) / cs))
    const y1 = Math.min(this.ny - 1, Math.floor((y + r - this.minY) / cs))
    const z0 = Math.max(0, Math.floor((z - r - this.minZ) / cs))
    const z1 = Math.min(this.nz - 1, Math.floor((z + r - this.minZ) / cs))
    if (x0 > x1 || y0 > y1 || z0 > z1) return
    const r2 = r * r
    const { nx, nz, cellStart, items } = this
    for (let cy = y0; cy <= y1; cy++) {
      for (let cz = z0; cz <= z1; cz++) {
        const row = (cy * nz + cz) * nx
        for (let cx = x0; cx <= x1; cx++) {
          const c = row + cx
          for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
            const i = items[k]
            const dx = pos[i * 3] - x
            const dy = pos[i * 3 + 1] - y
            const dz = pos[i * 3 + 2] - z
            const d2 = dx * dx + dy * dy + dz * dz
            if (d2 <= r2 && cb(i, d2) === false) return
          }
        }
      }
    }
  }
}
