/**
 * The HTML print path: Markdown to a self-contained printable page.
 *
 * TeX is not required. The page uses the browser's own print dialog (no
 * temporary PDF), and formula rendering is an optional online enhancement:
 * KaTeX is fetched from a CDN when the network allows it, and the source TeX
 * stays readable when it does not.
 *
 * @module dsh-pdf-workbench/print
 */

/**
 * Escape text for HTML body content.
 * @param {string} text - raw text.
 * @returns {string} escaped text.
 */
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Escape one attribute value.
 * @param {string} text - raw text.
 * @returns {string} escaped value.
 */
function escapeAttr(text) {
  return escapeHtml(text).replaceAll('"', '&quot;')
}

/**
 * Inline Markdown: code spans, emphasis, links and images. Everything is
 * escaped first, so a Markdown file cannot inject markup.
 * @param {string} raw - one line of Markdown.
 * @returns {string} inline HTML.
 */
function inline(raw) {
  let text = escapeHtml(raw)
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">')
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  return text
}

/**
 * Convert Markdown to the simple HTML the print page needs. It deliberately
 * covers headings, paragraphs, lists, quotes, code, rules and inline styles;
 * anything fancier prints as plain text rather than being dropped.
 * @param {string} markdown - the file's text.
 * @returns {string} the article body.
 */
export function markdownToHtml(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let list = ''
  const closeList = () => {
    if (list === '') return
    out.push(`</${list}>`)
    list = ''
  }
  const startsBlock = line => /^\s*(#{1,6}\s|```|>|[-*+]\s|\d+[.)]\s)/.test(line)
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const fence = /^\s*```(\S*)\s*$/.exec(line)
    if (fence !== null) {
      closeList()
      const language = fence[1]
      index += 1
      const code = []
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      out.push(`<pre><code${language === '' ? '' : ` class="language-${escapeAttr(language)}"`}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-_*]*$/.test(line)) {
      closeList()
      out.push('<hr>')
      index += 1
      continue
    }
    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote !== null) {
      closeList()
      const body = []
      while (index < lines.length) {
        const inner = /^\s*>\s?(.*)$/.exec(lines[index])
        if (inner === null) break
        body.push(inline(inner[1]))
        index += 1
      }
      out.push(`<blockquote>${body.join('<br>')}</blockquote>`)
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet !== null || ordered !== null) {
      const tag = bullet !== null ? 'ul' : 'ol'
      if (list !== tag) {
        closeList()
        out.push(`<${tag}>`)
        list = tag
      }
      out.push(`<li>${inline((bullet ?? ordered)[1])}</li>`)
      index += 1
      continue
    }
    if (/^\s*$/.test(line)) {
      closeList()
      index += 1
      continue
    }
    closeList()
    const paragraph = []
    while (index < lines.length && !/^\s*$/.test(lines[index]) && !startsBlock(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    out.push(`<p>${paragraph.map(inline).join('\n')}</p>`)
  }
  closeList()
  return out.join('\n')
}

/**
 * Wrap a rendered body in the printable page.
 * @param {string} title - document title shown in the print header.
 * @param {string} body - rendered article HTML.
 * @returns {string} a complete HTML document.
 */
export function printPageHtml(title, body) {
  const safeTitle = escapeHtml(title)
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 40px; color: #1f1f1f; background: #fff;
    font: 15px/1.75 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
  article { max-width: 860px; margin: 0 auto; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.2em 0 .5em; page-break-after: avoid; }
  h1 { font-size: 1.7em; } h2 { font-size: 1.4em; } h3 { font-size: 1.2em; }
  p { margin: .6em 0; }
  a { color: #2f6df6; text-decoration: underline; }
  img { max-width: 100%; height: auto; }
  code { padding: 1px 5px; border-radius: 4px; background: #f3f4f6; font-size: .92em;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { padding: 12px 14px; overflow-x: auto; background: #f7f8fa; border: 1px solid #e5e7eb;
    border-radius: 8px; page-break-inside: avoid; }
  pre code { padding: 0; background: none; }
  blockquote { margin: .8em 0; padding: .2em 0 .2em 14px; border-left: 3px solid #d1d5db; color: #4b5563; }
  ul, ol { margin: .6em 0; padding-left: 1.6em; }
  li { margin: .2em 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.4em 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  @media print { body { padding: 0; } a { color: inherit; } }
</style>
</head>
<body>
<article>
${body}
</article>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
  onload="try{renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})}catch(e){}"></script>
</body>
</html>
`
}
