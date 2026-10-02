// Pure helper (no DOM): turns successive /api/state snapshots into one-time lifecycle events.
// The first snapshot is a silent baseline, so history never replays. Every event is keyed by
// task + transition (+ report identity) and is emitted at most once. Tested in task-panel.test.mjs.
import type { Task, TaskState } from './types.ts'

export type LifecycleType = 'draft' | 'published' | 'acknowledged' | 'report'

export interface LifecycleEvent {
  type: LifecycleType
  id: string
  title: string
  outcome: Task['outcome'] | null
  hasQuestions: boolean
  state: TaskState
}

const ACTIVE = new Set<TaskState | undefined>(['published', 'working'])
const DONE = new Set<TaskState | undefined>(['report', 'blocked'])

function reportKey(task: Task): string {
  const text = task.reportText ?? ''
  let hash = 5381
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0
  return `${task.state}:${hash.toString(36)}`
}

const keyOf = (id: string, type: LifecycleType, detail = '') => `${id}|${type}|${detail}`

export function createLifecycleTracker() {
  const emitted = new Set<string>()
  let known: Map<string, Task> | null = null

  function baseline(task: Task) {
    if (ACTIVE.has(task.state) || DONE.has(task.state)) emitted.add(keyOf(task.id, 'published'))
    if (task.state === 'working' || DONE.has(task.state)) emitted.add(keyOf(task.id, 'acknowledged'))
    if (DONE.has(task.state)) emitted.add(keyOf(task.id, 'report', reportKey(task)))
    if (task.state === 'draft') emitted.add(keyOf(task.id, 'draft'))
  }

  function push(events: LifecycleEvent[], type: LifecycleType, task: Task, detail = '') {
    const key = keyOf(task.id, type, detail)
    if (emitted.has(key)) return
    emitted.add(key)
    events.push({ type, id: task.id, title: task.title, outcome: task.outcome ?? null, hasQuestions: Boolean(task.hasQuestions), state: task.state })
  }

  return {
    observe(tasks: Task[]): LifecycleEvent[] {
      const next = new Map(tasks.map(task => [task.id, task]))
      if (!known) {
        for (const task of tasks) baseline(task)
        known = next
        return []
      }
      const events: LifecycleEvent[] = []
      for (const task of tasks) {
        const before = known.get(task.id)?.state
        if (task.state === 'draft' && before !== 'draft') push(events, 'draft', task)
        if (ACTIVE.has(task.state) && !ACTIVE.has(before) && !DONE.has(before)) push(events, 'published', task)
        if (task.state === 'working' && before !== 'working' && !DONE.has(before)) push(events, 'acknowledged', task)
        if (DONE.has(task.state)) push(events, 'report', task, reportKey(task))
      }
      known = next
      return events
    },
    // Called after this page's own successful send, so the next poll does not announce it twice.
    markSeen(id: string, type: LifecycleType) {
      emitted.add(keyOf(id, type))
    },
  }
}
