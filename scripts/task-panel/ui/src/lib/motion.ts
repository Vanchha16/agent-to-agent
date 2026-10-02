// Event-driven motion helpers (Web Animations API). Every helper is a no-op when reduced motion is on;
// callers still update text and announcements. Logos are never animated directly — only their containers.
const EASE = 'cubic-bezier(.2, .8, .2, 1)'

export function arrive(element: Element | null | undefined, reduce: boolean) {
  if (reduce || !element || !('animate' in element)) return
  element.animate(
    [{ transform: 'translateY(8px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
    { duration: 420, easing: EASE },
  )
}

export function pulse(element: Element | null | undefined, reduce: boolean) {
  if (reduce || !element || !('animate' in element)) return
  element.animate(
    [{ boxShadow: '0 0 0 0 rgb(120 124 120 / 0%)' }, { boxShadow: '0 0 0 5px rgb(120 124 120 / 22%)', offset: 0.3 }, { boxShadow: '0 0 0 0 rgb(120 124 120 / 0%)' }],
    { duration: 900, easing: EASE },
  )
}

// A small "plan" chip travels from one element to another (planner desk -> builder desk, or builder -> owner).
export function handoff(from: Element | null | undefined, to: Element | null | undefined, label: string, reduce: boolean): Promise<void> {
  if (reduce || !from || !to || !document.body.animate) return Promise.resolve()
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.width > 0
  if (!onScreen(a) && !onScreen(b)) return Promise.resolve()
  const chip = document.createElement('div')
  chip.className = 'handoff-chip'
  chip.setAttribute('aria-hidden', 'true')
  chip.textContent = label
  document.body.append(chip)
  const w = chip.offsetWidth
  const h = chip.offsetHeight
  const start = [a.left + a.width / 2 - w / 2, a.top + a.height / 2 - h / 2]
  const end = [b.left + b.width / 2 - w / 2, b.top + b.height / 2 - h / 2]
  const lift = Math.min(start[1], end[1]) - 36
  const animation = chip.animate([
    { transform: `translate(${start[0]}px, ${start[1]}px) scale(.92)`, opacity: 0 },
    { transform: `translate(${start[0]}px, ${start[1]}px) scale(1)`, opacity: 1, offset: 0.14 },
    { transform: `translate(${(start[0] + end[0]) / 2}px, ${lift}px) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${end[0]}px, ${end[1]}px) scale(.7)`, opacity: 0 },
  ], { duration: 720, easing: EASE })
  return animation.finished.then(() => undefined, () => undefined).finally(() => chip.remove())
}
