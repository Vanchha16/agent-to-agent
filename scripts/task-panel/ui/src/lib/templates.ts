// UI template registry and the browser-local template preference. Pure (no DOM at import) so the
// test suite can load it; storage is passed in. Templates change presentation only — every one of them
// shows the same tasks, reports, and the same shared Send to Claude approval.

export const TEMPLATE_IDS = ['studio', 'dashboard', 'board', 'terminal', 'minimal', 'cyber'] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]

export const DEFAULT_TEMPLATE: TemplateId = 'studio'
export const TEMPLATE_STORAGE_KEY = 'panel-template'

export interface TemplateInfo {
  id: TemplateId
  name: string
  description: string
}

export const TEMPLATES: readonly TemplateInfo[] = [
  { id: 'studio', name: 'Studio', description: 'The calm default workspace: you above the two agent desks, with your focus and project history alongside.' },
  { id: 'dashboard', name: 'Dashboard', description: 'Operational overview with a section rail, live counts from your task files, agent status, and a full task table.' },
  { id: 'board', name: 'Board', description: 'Task-first columns — Needs you, With Claude, Reports, Archived. Every task has exactly one home.' },
  { id: 'terminal', name: 'Terminal', description: 'Developer-style panels with monospaced headings and a timestamped list of each task’s latest file change.' },
  { id: 'minimal', name: 'Minimal', description: 'One focused column: the next decision first, a slim agent strip, and history tucked away until you need it.' },
  { id: 'cyber', name: 'Cyber', description: 'Command-center grid with angular panels, a prominent mission and approval panel, and restrained neon accents.' },
]

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value)
}

export function parseTemplateId(value: unknown): TemplateId {
  return isTemplateId(value) ? value : DEFAULT_TEMPLATE
}

export function templateInfo(id: TemplateId): TemplateInfo {
  return TEMPLATES.find(template => template.id === id) ?? TEMPLATES[0]
}

type Readable = Pick<Storage, 'getItem'>
type Writable = Pick<Storage, 'setItem'>

// Missing, unknown, or unreadable values fall back to Studio. Storage access itself may throw
// (blocked site data), so callers pass a getter and every access is guarded.
export function loadTemplate(storage: () => Readable | null | undefined): TemplateId {
  try {
    return parseTemplateId(storage()?.getItem(TEMPLATE_STORAGE_KEY))
  } catch {
    return DEFAULT_TEMPLATE
  }
}

// Returns false when the choice could not be saved; the template still applies for this page view.
export function saveTemplate(storage: () => Writable | null | undefined, id: TemplateId): boolean {
  if (!isTemplateId(id)) return false
  try {
    const target = storage()
    if (!target) return false
    target.setItem(TEMPLATE_STORAGE_KEY, id)
    return true
  } catch {
    return false
  }
}
