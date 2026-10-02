import { withinProject } from '../claude-bridge.mjs'
import { PROJECT_ROOT } from './core.mjs'
import { recordedPanel } from './health.mjs'

// Stops only the panel process recorded in server.json, after confirming its identity.
const statePath = await withinProject(PROJECT_ROOT, '.tmp/task-panel/server.json')
const { state, alive } = await recordedPanel(statePath)
if (!state) {
  console.log('No running panel is recorded.')
} else if (!alive) {
  console.log(`The recorded panel (${state.url}) is not responding as the task panel; nothing was stopped.`)
} else {
  process.kill(state.pid)
  console.log(`Stopped the Claude task panel at ${state.url} (PID ${state.pid}).`)
}
