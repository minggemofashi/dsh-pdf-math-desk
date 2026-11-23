/**
 * One chapter's whole text, extracted once and kept beside the library.
 *
 * The hidden base session (stage 7.6) reads this file instead of the PDF, so a
 * chapter is only parsed once and the four mode branches share that prefix.
 * `text.md` is derived data: deleting it costs one extraction, never user
 * content.
 * @module dsh-pdf-workbench/chapter-text
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Where one chapter's extracted text lives.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} the absolute `text.md` path.
 */
export function chapterTextPath(libraryDir, book, code) {
  return join(libraryDir, '.pdfdesk', 'cache', book, code, 'text.md')
}

/**
 * Markdown with one section per page: the page number is what lets the model
 * cite a position back to the reader.
 * @param {{ page: number, text: string }[]} pages - the extracted pages.
 * @returns {string} the markdown.
 */
export function formatChapterText(pages) {
  return pages
    .map(page => {
      const body = typeof page.text === 'string' && page.text !== '' ? page.text : '（本页无文本，可能是扫描页）'
      return `## 第 ${page.page} 页\n\n${body}`
    })
    .join('\n\n')
}

/**
 * Extract the chapter's text (or reuse a cached one) and write `text.md`.
 * @param {{ script: string, source: string, libraryDir: string, book: string, code: string,
 *   run: (script: string, args: string[]) => Promise<string>, refresh?: boolean }} options - the PDF, the tool runner and the cache location.
 * @returns {Promise<{ path: string, chars: number, pageCount: number, cached: boolean }>} the file and its size.
 */
export async function prepareChapterText(options) {
  const { script, source, libraryDir, book, code, run } = options
  const path = chapterTextPath(libraryDir, book, code)
  if (options.refresh !== true) {
    const cached = await readFile(path, 'utf8').catch(() => null)
    if (typeof cached === 'string' && cached !== '') {
      return { path, chars: cached.length, pageCount: (cached.match(/^## 第 /gm) ?? []).length, cached: true }
    }
  }
  const stdout = await run(script, [source])
  const parsed = JSON.parse(stdout)
  const pages = Array.isArray(parsed.pages) ? parsed.pages : []
  const chars = typeof parsed.chars === 'number' ? parsed.chars : 0
  if (pages.length === 0 || chars === 0) {
    throw Object.assign(new Error('这一章没有可提取的文本（可能是扫描件）'), { code: 'no-text' })
  }
  const text = formatChapterText(pages)
  const dir = join(libraryDir, '.pdfdesk', 'cache', book, code)
  await mkdir(dir, { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${text}\n`, 'utf8')
  await rename(temporary, path)
  return { path, chars, pageCount: pages.length, cached: false }
}

/**
 * The cached text, or null when this chapter has not been extracted yet.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<string | null>} the markdown.
 */
export async function readChapterText(libraryDir, book, code) {
  const text = await readFile(chapterTextPath(libraryDir, book, code), 'utf8').catch(() => null)
  return typeof text === 'string' && text !== '' ? text : null
}
