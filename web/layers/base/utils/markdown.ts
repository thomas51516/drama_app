/**
 * Tiny Markdown renderer for the in-app help (S06-WEB-02). Covers what the guide uses: ATX
 * headings (with ids for the table of contents), paragraphs, emphasis, inline code, links,
 * images, ordered/unordered lists (one level of nesting), blockquotes, fenced code, tables and
 * horizontal rules. Every character of the source is HTML-escaped first, so the output only
 * contains the tags generated here (safe for `v-html`). Unsafe link schemes are dropped.
 */

export interface MarkdownHeading {
  level: number
  id: string
  text: string
}

export interface RenderedMarkdown {
  html: string
  headings: MarkdownHeading[]
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** URL-friendly id of a heading (`Connexion et TOTP` → `connexion-et-totp`), unique per document. */
export function slugify(text: string, taken: Set<string> = new Set()): string {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  let slug = base
  let counter = 2
  while (taken.has(slug)) slug = `${base}-${counter++}`
  taken.add(slug)
  return slug
}

const SAFE_URL = /^(https?:\/\/|mailto:|#|\/|\.{0,2}\/)/i

function safeUrl(url: string): string | null {
  const trimmed = url.trim()
  return SAFE_URL.test(trimmed) ? trimmed : null
}

/** Inline markup on an already-escaped line. */
export function renderInline(escaped: string): string {
  let out = escaped
  // Code spans first so their content is left alone.
  const codes: string[] = []
  out = out.replace(/`([^`]+)`/g, (_match, code: string) => {
    codes.push(`<code>${code}</code>`)
    return `\uE000${codes.length - 1}\uE000`
  })
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt: string, src: string) => {
    const url = safeUrl(src)
    return url ? `<img src="${url}" alt="${alt}" loading="lazy" />` : alt
  })
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, href: string) => {
    const url = safeUrl(href)
    if (!url) return text
    const external = /^https?:\/\//i.test(url)
    return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
  out = out.replace(/\uE000(\d+)\uE000/g, (_match, index: string) => codes[Number(index)] ?? '')
  return out
}

interface ListFrame {
  type: 'ul' | 'ol'
  indent: number
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  const headings: MarkdownHeading[] = []
  const ids = new Set<string>()

  let paragraph: string[] = []
  const lists: ListFrame[] = []
  let quote: string[] = []
  let code: string[] | null = null
  let table: string[][] | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    html.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`)
    paragraph = []
  }
  const closeLists = (toIndent = -1): void => {
    while (lists.length > 0 && (lists[lists.length - 1]?.indent ?? 0) > toIndent) {
      const frame = lists.pop()!
      html.push(`</li></${frame.type}>`)
    }
  }
  const flushQuote = (): void => {
    if (quote.length === 0) return
    html.push(`<blockquote>${renderMarkdown(quote.join('\n')).html}</blockquote>`)
    quote = []
  }
  const flushTable = (): void => {
    if (!table) return
    const [head, ...body] = table
    const cell = (tag: 'th' | 'td', values: string[]): string =>
      values.map((value) => `<${tag}>${renderInline(escapeHtml(value.trim()))}</${tag}>`).join('')
    html.push(
      `<table><thead><tr>${cell('th', head ?? [])}</tr></thead><tbody>${body
        .map((row) => `<tr>${cell('td', row)}</tr>`)
        .join('')}</tbody></table>`,
    )
    table = null
  }
  const flushBlocks = (): void => {
    flushParagraph()
    closeLists()
    flushQuote()
    flushTable()
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')

    // Fenced code: verbatim until the closing fence.
    if (code) {
      if (/^```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        code.push(rawLine)
      }
      continue
    }
    if (/^```/.test(line)) {
      flushBlocks()
      code = []
      continue
    }

    // Table rows: `| a | b |` with a `| --- |` separator on the second line.
    if (/^\|.*\|\s*$/.test(line)) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((value) => value.trim())
      if (table && table.length === 1 && cells.every((value) => /^:?-{2,}:?$/.test(value))) {
        continue // separator row
      }
      if (!table) {
        flushParagraph()
        closeLists()
        flushQuote()
        table = []
      }
      table.push(cells)
      continue
    }
    if (table) flushTable()

    if (line.trim() === '') {
      flushParagraph()
      flushQuote()
      continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line)
    if (heading) {
      flushBlocks()
      const level = heading[1]!.length
      const text = heading[2]!
      const id = slugify(text, ids)
      headings.push({ level, id, text })
      html.push(`<h${level} id="${id}">${renderInline(escapeHtml(text))}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushBlocks()
      html.push('<hr />')
      continue
    }

    const quoted = /^>\s?(.*)$/.exec(line)
    if (quoted) {
      flushParagraph()
      closeLists()
      quote.push(quoted[1] ?? '')
      continue
    }
    flushQuote()

    const listItem = /^(\s*)([-*+]|\d+[.)])\s+(.+)$/.exec(line)
    if (listItem) {
      flushParagraph()
      const indent = listItem[1]!.length
      const type: 'ul' | 'ol' = /^\d/.test(listItem[2]!) ? 'ol' : 'ul'
      const content = renderInline(escapeHtml(listItem[3]!))
      const top = lists[lists.length - 1]
      if (!top || indent > top.indent) {
        html.push(`<${type}><li>${content}`)
        lists.push({ type, indent })
      } else {
        closeLists(indent)
        const current = lists[lists.length - 1]
        if (current && current.indent === indent) {
          if (current.type !== type) {
            html.push(`</li></${current.type}><${type}><li>${content}`)
            current.type = type
          } else {
            html.push(`</li><li>${content}`)
          }
        } else {
          html.push(`<${type}><li>${content}`)
          lists.push({ type, indent })
        }
      }
      continue
    }

    // Continuation line of a list item (indented text) or a plain paragraph line.
    if (lists.length > 0 && /^\s{2,}\S/.test(line)) {
      html.push(` ${renderInline(escapeHtml(line.trim()))}`)
      continue
    }
    if (lists.length > 0) closeLists()
    paragraph.push(line.trim())
  }

  if (code) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flushBlocks()

  return { html: html.join('\n'), headings }
}
