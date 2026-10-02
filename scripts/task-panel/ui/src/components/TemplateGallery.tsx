import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import { TEMPLATES, type TemplateId } from '../lib/templates.ts'

interface Props {
  open: boolean
  current: TemplateId
  onApply: (id: TemplateId) => void
  onClose: () => void
}

// Structural miniatures of each template's real composition, drawn with that template's own tokens
// (the skin-* class). Shapes only — no text and no sample tasks, so nothing reads as real activity.
function Thumb({ id }: { id: TemplateId }) {
  const bar = (w: string, extra = '') => <span className={`block h-[3px] rounded-full bg-line-strong ${w} ${extra}`} />
  const frame = `skin-${id} thumb relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-line bg-bg`
  const top = <span className="block h-[7%] border-b border-line bg-surface" />
  switch (id) {
    case 'studio':
      return (
        <div className={frame} aria-hidden="true">
          {top}
          <div className="grid h-[93%] grid-cols-[1fr_28%] gap-[4%] p-[4%]">
            <div className="flex flex-col items-center gap-[6%] rounded-md bg-soft p-[5%]">
              <span className="h-[12%] w-[40%] rounded-full bg-surface shadow-desk" />
              <span className="h-[8%] w-px bg-line-strong" />
              <div className="grid w-full flex-1 grid-cols-2 gap-[6%]">
                {[0, 1].map(n => <span key={n} className="flex flex-col gap-[10%] rounded-md bg-surface p-[8%] shadow-desk"><span className="size-3 rounded-full border border-line" />{bar('w-3/4')}<span className="mt-auto block h-[30%] rounded bg-sunk" /></span>)}
              </div>
            </div>
            <div className="flex flex-col gap-[7%] pt-[4%]">{bar('w-1/2')}{bar('w-full', 'h-[5px] bg-ink-2')}{bar('w-3/4')}<span className="my-[6%] block h-px bg-line" />{[0, 1, 2, 3].map(n => <span key={n} className="flex items-center gap-1"><span className="dot" />{bar('flex-1')}</span>)}</div>
          </div>
        </div>
      )
    case 'dashboard':
      return (
        <div className={frame} aria-hidden="true">
          {top}
          <div className="flex h-[93%]">
            <div className="flex w-[19%] flex-col gap-[9%] border-r border-line bg-surface p-[3%] pt-[6%]">{[0, 1, 2, 3].map(n => <span key={n} className={`block h-[6%] rounded-sm ${n === 0 ? 'bg-soft' : ''}`}>{bar('w-3/4', 'mt-[2px] ml-[2px]')}</span>)}</div>
            <div className="flex flex-1 flex-col gap-[4%] p-[4%]">
              {bar('w-1/3', 'h-[5px] bg-ink-2')}
              <div className="grid grid-cols-4 gap-[3%]">{[0, 1, 2, 3].map(n => <span key={n} className="flex h-8 flex-col justify-end gap-1 rounded-sm border border-line bg-surface p-1"><span className="block h-[5px] w-1/3 rounded-sm bg-action" /></span>)}</div>
              <div className="grid grid-cols-3 gap-[3%]">{[0, 1, 2].map(n => <span key={n} className="h-5 rounded-sm border border-line bg-surface" />)}</div>
              <div className="flex flex-1 flex-col overflow-hidden rounded-sm border border-line bg-surface">
                <span className="block h-[16%] bg-sunk" />
                {[0, 1, 2, 3].map(n => <span key={n} className="flex flex-1 items-center gap-[6%] border-t border-line px-[4%]">{bar('w-[38%]')}{bar('w-[20%]', 'bg-info')}{bar('w-[16%]')}</span>)}
              </div>
            </div>
          </div>
        </div>
      )
    case 'board':
      return (
        <div className={frame} aria-hidden="true">
          {top}
          <div className="flex h-[93%] flex-col gap-[4%] p-[4%]">
            <div className="flex gap-[2%]">{[0, 1, 2].map(n => <span key={n} className="h-2.5 w-[22%] rounded-full border border-line bg-surface" />)}</div>
            <div className="grid flex-1 grid-cols-4 gap-[3%]">
              {['border-t-warn', 'border-t-info', 'border-t-ok', 'border-t-line-strong'].map((accent, n) => (
                <span key={n} className={`flex flex-col gap-[6%] rounded-md border-t-2 bg-soft p-[6%] ${accent}`}>
                  {bar('w-2/3')}
                  {Array.from({ length: [3, 1, 2, 1][n] }, (_, k) => <span key={k} className="flex h-[22%] flex-col justify-center gap-1 rounded-sm bg-surface px-[8%] shadow-desk">{bar('w-full')}{bar('w-1/2')}</span>)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )
    case 'terminal':
      return (
        <div className={frame} aria-hidden="true">
          {top}
          <div className="flex h-[93%] flex-col gap-[4%] p-[4%]">
            <span className="grid h-[20%] grid-cols-3 gap-px border border-line-strong bg-line">{[0, 1, 2].map(n => <span key={n} className="flex items-center gap-1 bg-surface px-[6%]"><span className="size-2 rounded-[1px] border border-line" />{bar('w-2/3', 'rounded-none')}</span>)}</span>
            <div className="grid flex-1 grid-cols-[1fr_32%] gap-[4%]">
              <span className="flex flex-col border border-line-strong bg-surface">
                <span className="block h-[12%] border-b border-line-strong bg-sunk" />
                {[0, 1, 2, 3, 4, 5].map(n => <span key={n} className="flex flex-1 items-center gap-[5%] border-b border-line px-[4%]">{bar('w-[22%]', 'rounded-none bg-sub')}{bar('w-[10%]', `rounded-none ${['bg-ok', 'bg-warn', 'bg-info'][n % 3]}`)}{bar('w-[40%]', 'rounded-none')}</span>)}
              </span>
              <span className="flex flex-col gap-[8%]"><span className="flex-[3] border border-line-strong bg-surface" /><span className="flex-[2] border border-line-strong bg-surface" /></span>
            </div>
          </div>
        </div>
      )
    case 'minimal':
      return (
        <div className={frame} aria-hidden="true">
          {top}
          <div className="mx-auto flex h-[93%] w-[52%] flex-col gap-[5%] pt-[7%]">
            {bar('w-1/4')}
            <span className="block h-[7px] w-[90%] rounded-full bg-ink" />
            <span className="block h-[7px] w-[60%] rounded-full bg-ink" />
            <span className="flex gap-[6%] border-y border-line py-[3%]">{[0, 1, 2].map(n => <span key={n} className="flex flex-1 items-center gap-1"><span className="dot" />{bar('flex-1')}</span>)}</span>
            {bar('w-2/3')}
            {bar('w-1/2')}
            <span className="mt-[3%] block h-3 w-[34%] rounded-full bg-action" />
          </div>
        </div>
      )
    case 'cyber':
      return (
        <div className={`${frame} cy-floor`} aria-hidden="true">
          {top}
          <div className="grid h-[93%] grid-cols-12 grid-rows-[1fr_1fr_1.1fr] gap-[3%] p-[4%]">
            <span className="cy-thumb-panel col-span-8 row-span-2 flex flex-col gap-[8%] p-[5%]"><span className="cy-accent-bar block h-[3px] w-full" /><span className="block h-[7px] w-3/4 bg-ink-2" />{bar('w-1/2')}<span className="mt-auto block h-3 w-[30%] bg-action" /></span>
            <span className="cy-thumb-panel col-span-4 flex flex-col justify-center gap-[12%] p-[8%]">{[0, 1, 2].map(n => <span key={n} className="flex items-center gap-1"><span className="size-2 border border-line" />{bar('flex-1', 'rounded-none')}</span>)}</span>
            <span className="cy-thumb-panel col-span-4 grid grid-cols-2 gap-[8%] p-[8%]">{[0, 1, 2, 3].map(n => <span key={n} className="bg-soft" />)}</span>
            {[0, 1, 2].map(n => <span key={n} className="cy-thumb-panel col-span-4 flex flex-col justify-center gap-[12%] p-[8%]">{bar('w-full', 'rounded-none')}{bar('w-2/3', 'rounded-none')}</span>)}
          </div>
        </div>
      )
  }
}

export function TemplateGallery({ open, current, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const node = dialog.current
    if (!node) return
    if (open && !node.open) {
      node.showModal()
      title.current?.focus()
    }
    if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog ref={dialog} className="gallery" aria-labelledby="gallery-title" aria-describedby="gallery-note" onClose={onClose}
      onClick={event => { if (event.target === dialog.current) onClose() }}>
      {open ? (
        <div className="gallery-panel mx-auto my-[4vh] flex max-h-[92vh] w-[min(1080px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl">
          <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-7">
            <div className="min-w-0 flex-1">
              <h2 id="gallery-title" ref={title} tabIndex={-1} className="m-0 font-display text-[19px] font-semibold">Templates</h2>
              <p id="gallery-note" className="m-0 mt-1 text-[13.5px] text-sub">The same tasks, reports, and approvals in six different layouts. Light and dark appearance stays your separate choice.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close templates" className="grid size-10 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-soft hover:text-ink"><X size={18} /></button>
          </header>

          <ul className="m-0 grid list-none gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-3">
            {TEMPLATES.map(template => {
              const active = template.id === current
              return (
                <li key={template.id}>
                  <article aria-labelledby={`tpl-${template.id}`}
                    className={`flex h-full flex-col rounded-xl border bg-surface p-3 transition-colors focus-within:border-line-strong hover:border-line-strong ${active ? 'border-ink-2 ring-1 ring-ink-2' : 'border-line'}`}>
                    <Thumb id={template.id} />
                    <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 id={`tpl-${template.id}`} className="m-0 text-[15px] font-semibold">{template.name}{template.id === 'studio' ? <span className="font-normal text-sub"> · default</span> : null}</h3>
                        {active ? <span className="inline-flex items-center gap-1 rounded-full bg-action px-2 py-0.5 text-[11.5px] font-semibold text-action-ink"><Check size={12} strokeWidth={2.4} aria-hidden="true" />Current</span> : null}
                      </div>
                      <p className="m-0 mt-1 flex-1 text-[13px] leading-snug text-sub">{template.description}</p>
                      {active ? (
                        <p className="m-0 mt-3 flex min-h-10 items-center text-[13px] font-medium text-ink-2">In use now</p>
                      ) : (
                        <button type="button" onClick={() => onApply(template.id)} aria-label={`Use the ${template.name} template`}
                          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-[13.5px] font-semibold transition-colors hover:bg-soft">
                          Use this template
                        </button>
                      )}
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-sub sm:px-7">
            <span>Saved in this browser only. Switching never sends, changes, or re-announces anything.</span>
            {current !== 'studio' ? (
              <button type="button" onClick={() => onApply('studio')} className="min-h-9 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:decoration-current">Back to Studio (default)</button>
            ) : null}
          </footer>
        </div>
      ) : null}
    </dialog>
  )
}
