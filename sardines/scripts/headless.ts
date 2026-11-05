// Headless run of the simulation for tuning: `npm run headless -- <scenario> <seconds> [population]`
import { Simulation } from '../src/sim/Simulation.ts'
import { scenarioParams, type ScenarioId } from '../src/sim/scenarios.ts'

const id = (process.argv[2] ?? 'open') as ScenarioId
const seconds = Number(process.argv[3] ?? 60)
const pop = process.argv[4] ? Number(process.argv[4]) : undefined
const sim = new Simulation()
const params = scenarioParams(id)
if (pop) params.school.population = pop
sim.load(id, 1, params)
const steps = Math.round(seconds * 30)
let ms = 0
for (let k = 1; k <= steps; k++) {
  const t0 = performance.now()
  sim.step()
  ms += performance.now() - t0
  if (k % 150 === 0) {
    const s = sim.stats
    const L = s.largest
    console.log(
      `t=${(k / 30).toFixed(0).padStart(3)}s fish=${s.fishCount} schools=${s.schools} strag=${s.stragglers} ` +
        `spd=${s.avgSpeed.toFixed(2)} nnd=${s.avgNND.toFixed(3)} dens=${s.density.toFixed(0)} pol=${s.polarization.toFixed(2)} ` +
        (L ? `| L n=${L.count} pol=${L.polarization.toFixed(2)} rot=${L.rotation.toFixed(2)} R=${L.radius.toFixed(1)} el=${L.elongation.toFixed(1)} y=${L.cy.toFixed(1)} al=${L.alarmed.toFixed(2)} fd=${L.feeding.toFixed(2)} ` : '') +
        `| ${s.formation} | pred ${s.predatorActivity} cap=${s.captures}/${s.attempts} | ${(ms / 150).toFixed(2)}ms/step`,
    )
    ms = 0
  }
}
