import type { ReactNode } from 'react'

// Safe Markdown subset rendered as React elements only — never dangerouslySetInnerHTML.
// Raw HTML in prompts/reports shows as literal text; links are shown as text, never followed.
function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let n = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const piece = match[0]
    const k = `${key}-${n++}`
    if (match[1]) out.push(<code key={k} className="md-code">{piece.slice(1, -1)}</code>)
    else if (match[2]) out.push(<strong key={k} className="font-semibold text-ink">{inline(piece.slice(2, -2), k)}</strong>)
    else if (match[3]) {
      const [, label, url] = piece.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? []
      out.push(<span key={k}>{inline(label ?? '', k)} <span className="text-sub text-[0.85em]">({url})</span></span>)
    } else out.push(<em key={k}>{inline(piece.slice(1, -1), k)}</em>)
    last = match.index + piece.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const isBlockStart = (line: string) => /^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+[.)]\s|\|.*\|\s*$|---+\s*$)/.test(line)

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let previous = -1
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`
    // Progress guard: every pass must consume at least one line. If a branch ever fails to advance,
    // show the line as plain text and move on instead of looping forever.
    if (i === previous) { blocks.push(<p key={`${key}-raw`} className="my-2">{line}</p>); i++; continue }
    previous = i
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(<pre key={key} className="md-pre"><code>{code.join('\n')}</code></pre>)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const cls = level <= 1 ? 'md-h1' : level === 2 ? 'md-h2' : 'md-h3'
      blocks.push(<p key={key} role="heading" aria-level={Math.min(level + 2, 6)} className={cls}>{inline(heading[2], key)}</p>)
      i++
      continue
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={key} className="my-4 border-line" />); i++; continue }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows: string[] = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      const body = rows.filter(row => !/^\|[\s:|-]+\|\s*$/.test(row))
      const cells = (row: string) => row.trim().slice(1, -1).split('|').map(cell => cell.trim())
      blocks.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="md-table">
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{cells(row).map((cell, c) => r === 0 && rows.length > 1
                  ? <th key={c}>{inline(cell, `${key}-${r}-${c}`)}</th>
                  : <td key={c}>{inline(cell, `${key}-${r}-${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    const first = line.match(LIST)
    if (first) {
      const ordered = /\d/.test(first[2])
      const items: ReactNode[][] = []
      // Indentation is measured from the list's first item, so a list may start indented ("  - item").
      const base = first[1].length
      while (i < lines.length) {
        const item = lines[i].match(LIST)
        if (item && (!items.length || item[1].length < base + 2)) { items.push([inline(item[3], `${key}-${i}`)]); i++ }
        else if (item && items.length) { items[items.length - 1].push(<br key={`br${i}`} />, '  • ', ...inline(item[3], `${key}-${i}`)); i++ }
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].push(' ', ...inline(lines[i].trim(), `${key}-${i}`)); i++ }
        else break
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(<List key={key} className={ordered ? 'md-ol' : 'md-ul'}>{items.map((content, n) => <li key={n}>{content}</li>)}</List>)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++].trim())
    if (!paragraph.length) paragraph.push(lines[i++].trim())
    blocks.push(<p key={key} className="my-2">{paragraph.flatMap((text, n) => n ? [<br key={`br${n}`} />, ...inline(text, `${key}-${n}`)] : inline(text, `${key}-${n}`))}</p>)
  }
  return <div className="md">{blocks}</div>
}
