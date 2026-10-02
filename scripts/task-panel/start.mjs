import { spawn } from 'node:child_process'
import { access, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withinProject } from '../claude-bridge.mjs'
import { PROJECT_ROOT } from './core.mjs'
import { recordedPanel } from './health.mjs'

// Starts the panel in the background (no console window) and prints its URL.
const statePath = await withinProject(PROJECT_ROOT, '.tmp/task-panel/server.json')
const logPath = await withinProject(PROJECT_ROOT, '.tmp/task-panel/server.log')

async function main() {
  try {
    await access(await withinProject(PROJECT_ROOT, 'scripts/task-panel/dist/index.html'))
  } catch {
    console.warn('The AI Studio UI has not been built yet. Run npm.cmd run ui:build (the panel shows this hint until you do).')
  }
  const existing = await recordedPanel(statePath)
  if (existing.alive) {
    console.log(`Claude task panel is already running: ${existing.state.url}`)
    return 0
  }
  await mkdir(path.dirname(logPath), { recursive: true })
  const output = await open(logPath, 'a')
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url)), ...process.argv.slice(2)], {
    cwd: PROJECT_ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', output.fd, output.fd],
  })
  child.unref()
  try {
    for (let waited = 0; waited < 10000; waited += 250) {
      await new Promise(resolve => setTimeout(resolve, 250))
      const panel = await recordedPanel(statePath)
      if (panel.alive && panel.state.pid === child.pid) {
        console.log(`Claude task panel running in the background: ${panel.state.url}`)
        console.log('Stop it with: npm.cmd run panel:stop')
        return 0
      }
    }
  } finally {
    await output.close()
  }
  console.error('The panel did not start within 10 seconds. See .tmp/task-panel/server.log.')
  return 1
}

process.exitCode = await main()
