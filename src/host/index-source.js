/**
 * The book → chapter catalog.
 *
 * `索引.json` is the authored source when it exists; otherwise the catalog is
 * derived from the chapter-split PDF file names (`<short>_cNN_<title>.pdf`).
 * Either way the browser receives one canonical shape and never sees paths it
 * cannot use. A catalog that could not be read at all reports a `problem`
 * instead of looking like an empty library.
 *
 * @module dsh-pdf-workbench/index-source
 */
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** A chapter code is `c` plus two or three digits; the title part is optional. */
const CHAPTER_FILE = /^(?<short>.+?)_(?<code>c\d{2,3})(?:_(?<rest>.*))?\.pdf$/i

/** A split file the splitter named with a page range but no `cNN` marker. */
const RANGE_FILE = /^(?<short>[^_]+?)_(?:(?:第[^_]*?章)_)?(?<rest>.*?)(?:_p|_)?(?<from>\d{1,4})-(?<to>\d{1,4})\.pdf$/i

/** Canonical chapter code, lowercase and exactly `c` + two or three digits. */
const CODE_SHAPE = /^c\d{2,3}$/

/**
 * Canonicalize one chapter code.
 * @param {unknown} raw - code from a file name or the authored index.
 * @returns {string | null} the lowercase code, or null when it is not chapter-shaped.
 */
function normalizeCode(raw) {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toLowerCase()
  return CODE_SHAPE.test(code) ? code : null
}

/** A trailing (or final) `_p123-456` page range; anything after it joins the title. */
const PAGE_RANGE = /^(?<title>.*?)_p(?<from>\d+)-(?<to>\d+)(?<tail>.*)$/i

/** A parenthetical group, half or full width. */
const PAREN_GROUP = /[（(]([^（()）]*)[）)]/g

/** Parentheticals containing these are notes, not authors. */
const NOTE_WORDS = /第|修订|版|卷|册|学习|指导/

/**
 * Classify one chapter code.
 * @param {string} code - `cNN`.
 * @returns {'preface' | 'appendix' | 'bibliography' | 'chapter'} the kind.
 */
function kindOf(code) {
  if (code === 'c00') return 'preface'
  if (code === 'c99') return 'bibliography'
  if (/^c9\d$/.test(code)) return 'appendix'
  return 'chapter'
}

/**
 * Numeric order of a chapter code, so `c100` sorts after `c99`.
 * @param {string} code - `cNN`.
 * @returns {number} the numeric part, or a large number for foreign codes.
 */
function codeOrder(code) {
  const digits = Number(code.slice(1))
  return Number.isFinite(digits) ? digits : Number.MAX_SAFE_INTEGER
}

/**
 * Turn a file-name fragment into a readable chapter title.
 * @param {string} raw - the part between the code and the page range.
 * @returns {string} the title.
 */
function tidyChapterTitle(raw) {
  return raw
    .replace(/(Chapter)([IVXLCDM]+)\b/gi, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Parse one split PDF file name.
 * @param {string} fileName - base name of the PDF.
 * @returns {{ short: string, code: string, title: string, pages: string, kind: string } | null} the chapter, or null when the name is not chapter-shaped.
 */
export function parseChapterFile(fileName) {
  const match = CHAPTER_FILE.exec(fileName)
  if (match === null) {
    // Splitters commonly emit `<book>_<title>_<from>-<to>.pdf` without a code:
    // accept it and let the scan number the chapters by page order.
    const loose = RANGE_FILE.exec(fileName)
    if (loose === null) return null
    const from = Number(loose.groups.from)
    const to = Number(loose.groups.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from) return null
    return {
      short: '',
      code: '',
      title: tidyChapterTitle(loose.groups.rest ?? ''),
      pages: `${from}-${to}`,
      kind: 'body',
      from,
    }
  }
  const code = normalizeCode(match.groups.code)
  if (code === null) return null
  let rest = match.groups.rest ?? ''
  let pages = ''
  const range = PAGE_RANGE.exec(rest)
  if (range !== null) {
    pages = `${Number(range.groups.from)}-${Number(range.groups.to)}`
    rest = `${range.groups.title}${range.groups.tail ?? ''}`
  }
  return { short: match.groups.short.trim(), code, title: tidyChapterTitle(rest), pages, kind: kindOf(code) }
}

/**
 * Drop vendor/scanning parentheticals, bare numeric markers and stray punctuation.
 * @param {string} dirName - the book directory name.
 * @returns {string} the cleaned directory name.
 */
function cleanBookDirectoryName(dirName) {
  let text = dirName.trim()
  for (let round = 0; round < 6; round += 1) {
    const next = text.replace(PAREN_GROUP, (all, inner) => {
      const content = String(inner).trim()
      if (/^(z-library|1lib|z-lib|zlib)/i.test(content)) return ''
      if (/^Z-Library$/i.test(content)) return ''
      if (/^OCR$/i.test(content)) return ''
      if (/^\d{1,2}$/.test(content)) return ''
      return all
    })
    if (next === text) break
    text = next
  }
  text = text.replace(/\s{2,}/g, ' ').trim()
  const opens = (text.match(/[（(]/g) ?? []).length
  const closes = (text.match(/[）)]/g) ?? []).length
  if (opens > closes) text = text.replace(/[（(][^（()）]*$/, '').trim()
  return text.replace(/[\s，,]+$/g, '').trim()
}

/**
 * Whether a parenthetical reads like an author list rather than a note.
 * @param {string} text - the parenthetical content.
 * @returns {boolean} true when it can be shown as the author.
 */
function looksLikeAuthor(text) {
  if (!/^[\p{L}][\p{L}\p{N}.\s·\-]{1,39}$/u.test(text)) return false
  if (/[，,、；;：:]/.test(text)) return false
  if (NOTE_WORDS.test(text)) return false
  return true
}

/**
 * Split a book directory name into a display title and an author.
 * @param {string} dirName - the book directory name.
 * @returns {{ title: string, author: string }} display fields.
 */
export function splitBookTitle(dirName) {
  const cleaned = cleanBookDirectoryName(dirName)
  const groups = [...cleaned.matchAll(/[（(]([^（()）]+)[）)]/g)]
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const inner = groups[index][1].trim()
    if (!looksLikeAuthor(inner)) continue
    const start = groups[index].index ?? 0
    const title = (cleaned.slice(0, start) + cleaned.slice(start + groups[index][0].length))
      .replace(/\s{2,}/g, ' ')
      .trim()
    return { title, author: inner }
  }
  return { title: cleaned, author: '' }
}

/**
 * Normalize, de-duplicate and order one book's chapters.
 * @param {object[]} chapters - candidate chapters in file order.
 * @returns {{ chapters: object[], duplicates: number }} the rows and how many duplicate codes were dropped.
 */
function normalizeChapters(chapters) {
  const byCode = new Map()
  let duplicates = 0
  for (const chapter of chapters) {
    if (chapter === null || typeof chapter !== 'object') continue
    if (typeof chapter.code !== 'string' || chapter.code === '') continue
    const row = {
      code: chapter.code,
      title: typeof chapter.title === 'string' ? chapter.title : '',
      kind: typeof chapter.kind === 'string' && chapter.kind !== '' ? chapter.kind : kindOf(chapter.code),
      pages: typeof chapter.pages === 'string' ? chapter.pages : '',
      file: typeof chapter.file === 'string' ? chapter.file : '',
      // A file kept only because every PDF is readable, not because its name
      // follows the splitter convention. The browser hides these by default.
      loose: chapter.loose === true,
    }
    if (byCode.has(row.code)) duplicates += 1
    byCode.set(row.code, row)
  }
  const rows = [...byCode.values()].sort((left, right) => codeOrder(left.code) - codeOrder(right.code))
  return { chapters: rows, duplicates }
}

/**
 * Normalize one book row into the shape the browser renders.
 * @param {{ id: string, title: string, author?: string, dir?: string, cover?: string, chapters: object[], unparsed?: number }} book - assembled fields.
 * @returns {object} the row.
 */
function bookRow(book) {
  const { chapters, duplicates } = normalizeChapters(book.chapters)
  return {
    id: book.id,
    title: book.title === '' ? book.id : book.title,
    author: typeof book.author === 'string' ? book.author : '',
    dir: typeof book.dir === 'string' ? book.dir : '',
    cover: typeof book.cover === 'string' ? book.cover : '',
    unparsed: typeof book.unparsed === 'number' ? book.unparsed : 0,
    duplicates,
    // A book made entirely of files whose names the splitter did not produce:
    // readable, but hidden until the reader asks for unrecognized books.
    loose: chapters.length > 0 && chapters.every(chapter => chapter.loose === true),
    chapters,
  }
}

/** Short stable hash used to disambiguate two books that share a file-name short name. */
function shortHash(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).slice(0, 6)
}

/**
 * Keep book ids unique; a later book that repeats a short name gets a stable
 * directory hash, while the first keeps the plain id so an existing catalog
 * does not change ids when an unrelated duplicate folder appears.
 * @param {object[]} books - rows built from either source.
 * @returns {object[]} rows with unique ids.
 */
function assignUniqueIds(books) {
  const seen = new Set()
  return books.map(book => {
    if (!seen.has(book.id)) {
      seen.add(book.id)
      return book
    }
    const unique = `${book.id}@${shortHash(book.dir === '' ? book.title : book.dir)}`
    seen.add(unique)
    return { ...book, id: unique }
  })
}

/**
 * Read and normalize an authored index file.
 * @param {string} indexPath - absolute path of `索引.json`.
 * @returns {Promise<{ status: 'ok', books: object[], warnings: string[] } | { status: 'missing' } | { status: 'invalid', warnings: string[] }>} the outcome.
 */
async function readIndexFile(indexPath) {
  let text
  try {
    text = await readFile(indexPath, 'utf8')
  } catch {
    return { status: 'missing' }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { status: 'invalid', warnings: [`索引.json 无法解析，已改为按文件名推导：${String(error)}`] }
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.books)) {
    return { status: 'invalid', warnings: ['索引.json 缺少 books 数组，已改为按文件名推导。'] }
  }
  const warnings = []
  const books = []
  for (const entry of parsed.books) {
    if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id === '') {
      warnings.push('索引.json 里有一本书缺少 id，已跳过。')
      continue
    }
    const chapters = Array.isArray(entry.chapters) ? entry.chapters : []
    const normalizedChapters = []
    for (const chapter of chapters) {
      const code = normalizeCode(chapter?.code)
      if (code === null) {
        warnings.push(`索引.json 里 ${entry.id} 有一个章号不是 cNN，已跳过：${String(chapter?.code)}`)
        continue
      }
      const pdf = chapter !== null && typeof chapter === 'object' && typeof chapter.pdf === 'string' ? chapter.pdf : ''
      normalizedChapters.push({
        code,
        title: chapter?.title,
        pages: chapter?.pages,
        file: pdf === '' ? '' : basename(pdf).replace(/\.pdf$/i, ''),
      })
    }
    books.push(bookRow({
      id: entry.id,
      title: typeof entry.title === 'string' ? entry.title : '',
      author: entry.author,
      dir: entry.dir,
      cover: entry.cover,
      chapters: normalizedChapters,
    }))
  }
  return { status: 'ok', books: assignUniqueIds(books), warnings }
}

/**
 * Derive the catalog from the split library on disk.
 * @param {string} fragmentDir - absolute path of the `分片` folder.
 * @returns {Promise<{ books: object[], skipped: object[], warnings: string[], readable: boolean }>} the derived catalog.
 */
async function scanFragments(fragmentDir) {
  const warnings = []
  const skipped = []
  let entries
  try {
    entries = await readdir(fragmentDir, { withFileTypes: true })
  } catch (error) {
    const missing = error !== null && typeof error === 'object' && error.code === 'ENOENT'
    return {
      books: [],
      skipped,
      readable: false,
      missing,
      warnings: missing ? [] : [`读不到分片目录 ${fragmentDir}：${String(error && error.message ? error.message : error)}`],
    }
  }
  const books = []
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const directory = join(fragmentDir, entry.name)
    let files
    try {
      files = await readdir(directory)
    } catch {
      warnings.push(`跳过无法读取的目录：${entry.name}`)
      continue
    }
    const chapters = []
    const keptFiles = []
    let short = ''
    let pdfCount = 0
    let unparsed = 0
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.pdf')) continue
      // Translation output lives beside the chapter PDF; it is not a chapter.
      if (/_translated\.pdf$/i.test(file) || /_overlay\.pdf$/i.test(file)) continue
      pdfCount += 1
      const parsed = parseChapterFile(file)
      if (parsed === null) {
        unparsed += 1
        // Not chapter-shaped, but still a PDF the reader may open.
        keptFiles.push(file)
        continue
      }
      if (short === '') short = parsed.short
      chapters.push({
        code: parsed.code,
        title: parsed.title,
        kind: parsed.kind,
        pages: parsed.pages,
        file: file.replace(/\.pdf$/i, ''),
        from: parsed.from,
      })
    }
    if (chapters.length === 0 && keptFiles.length === 0) {
      if (pdfCount > 0) skipped.push({ dir: entry.name, pdfCount })
      continue
    }
    // Files the splitter left without `cNN`: number them by page order, with the
    // cover/contents pair going to c00 and appendices to c90+.
    const taken = new Set(chapters.filter(chapter => chapter.code !== '').map(chapter => chapter.code))
    let bodyIndex = 1
    const loose = chapters.filter(chapter => chapter.code === '')
    loose.sort((left, right) => (left.from ?? 0) - (right.from ?? 0))
    for (const chapter of loose) {
      const text = `${chapter.title} ${chapter.file}`
      let code
      if (/附录|appendix/i.test(text)) {
        let index = 90
        while (taken.has(`c${index}`)) index += 1
        code = `c${index}`
      } else if (/目录|前言|封面|序言|序$|索引|参考/i.test(text)) {
        code = 'c00'
      } else {
        while (taken.has(`c${String(bodyIndex).padStart(2, '0')}`)) bodyIndex += 1
        code = `c${String(bodyIndex).padStart(2, '0')}`
        bodyIndex += 1
      }
      chapter.code = code
      chapter.kind = kindOf(code)
      taken.add(code)
    }
    // Every PDF is readable even when its name never followed the splitter
    // convention: number the rest after the real chapters and mark them loose,
    // so the browser keeps them out of the shelf until the reader asks for
    // unrecognized books. Nothing is written back to disk or to 索引.json.
    // Code-unit order, not locale order: "第一章" must sort before "第二章", and
    // a pinyin collation would put them the other way round.
    keptFiles.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    for (const name of keptFiles) {
      const stem = name.replace(/\.pdf$/i, '')
      let index = 1
      while (taken.has(`c${String(index).padStart(2, '0')}`)) index += 1
      const code = `c${String(index).padStart(2, '0')}`
      taken.add(code)
      chapters.push({ code, title: stem, kind: 'chapter', pages: '', file: stem, loose: true })
    }
    for (const chapter of chapters) delete chapter.from
    chapters.sort((left, right) => left.code.localeCompare(right.code))
    const { title, author } = splitBookTitle(entry.name)
    books.push(bookRow({
      id: short === '' ? entry.name : short,
      title,
      author,
      dir: entry.name,
      unparsed,
      chapters,
    }))
  }
  books.sort((left, right) => left.title.localeCompare(right.title, 'zh'))
  return { books: assignUniqueIds(books), skipped, warnings, readable: true }
}

/**
 * Whole-book PDFs: a library may also carry unsplit books, under `整本\`, loose
 * in the library root, or dropped straight into `分片\` (people do that). Each
 * file is one book with a single synthetic chapter (`c00`), so reading works but
 * there are no chapter rows.
 * @param {string} libraryDir - the library root.
 * @param {string} [fragmentDir] - the `分片` directory, when it is configured elsewhere.
 * @returns {Promise<{ books: object[], readable: boolean }>} one book per whole PDF.
 */
async function scanWholeBooks(libraryDir, fragmentDir) {
  const found = []
  let readable = false
  // `整本\` first so it wins when the same stem exists elsewhere too, then the
  // library root, then loose PDFs directly inside `分片\`.
  for (const [dir, at] of [
    [join(libraryDir, '整本'), 'whole'],
    [libraryDir, 'root'],
    [typeof fragmentDir === 'string' && fragmentDir !== '' ? fragmentDir : join(libraryDir, '分片'), 'fragment'],
  ]) {
    let names
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    readable = true
    for (const name of names) {
      if (!/\.pdf$/i.test(name)) continue
      const stem = name.replace(/\.pdf$/i, '').trim()
      if (stem === '') continue
      found.push({ stem, at })
    }
  }
  const books = []
  const seen = new Set()
  for (const { stem, at } of found) {
    if (seen.has(stem)) continue
    seen.add(stem)
    books.push({
      id: stem,
      title: stem,
      author: '',
      whole: true,
      // A whole, unsplit PDF never followed the chapter naming either, so it
      // counts as an unrecognized book and follows the same shelf switch.
      loose: true,
      chapters: [{
        code: 'c00',
        title: '整本',
        file: stem,
        whole: true,
        wholeAt: at,
        pages: '',
        kind: 'chapter',
      }],
    })
  }
  return { books, readable }
}

/**
 * Load the current catalog: authored index first, file-name derivation second.
 * @param {{ indexPath: string, fragmentDir: string, libraryDir?: string }} config - resolved paths.
 * @returns {Promise<{ source: 'index.json' | 'scan', indexIgnored: boolean, books: object[], skipped: object[], warnings: string[], problem: { code: string, message: string } | null }>} the catalog, how it was obtained, and any blocking problem.
 */
export async function loadCatalog(config) {
  const fromIndex = await readIndexFile(config.indexPath)
  const scanned = await scanFragments(config.fragmentDir)
  const whole = config.libraryDir === undefined
    ? { books: [], readable: false }
    : await scanWholeBooks(config.libraryDir, config.fragmentDir)
  // A library may legitimately hold only whole-book PDFs: `分片` missing is not
  // an error then. It is only a problem when neither layout is readable.
  const readable = scanned.readable || whole.readable
  const warnings = [
    ...(fromIndex.status === 'invalid' ? fromIndex.warnings : []),
    ...scanned.warnings,
    ...(scanned.missing === true && whole.readable ? ['没有分片目录，只显示整本 PDF。'] : []),
  ]
  if (fromIndex.status === 'ok') {
    return {
      source: 'index.json',
      indexIgnored: false,
      books: assignUniqueIds([...fromIndex.books, ...whole.books]),
      skipped: scanned.skipped,
      warnings: [...fromIndex.warnings, ...warnings],
      problem: null,
    }
  }
  return {
    source: 'scan',
    indexIgnored: fromIndex.status === 'invalid',
    books: assignUniqueIds([...scanned.books, ...whole.books]),
    skipped: scanned.skipped,
    warnings,
    problem: readable ? null : { code: 'fragment-dir-unreadable', message: scanned.warnings[0] ?? `读不到分片目录 ${config.fragmentDir}` },
  }
}
