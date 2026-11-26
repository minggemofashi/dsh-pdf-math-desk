/**
 * Where one chapter's translation cache lives, and the one-time move from the
 * old global folder.
 *
 * Until v1.5 the per-page cache sat under `%DSH_HOME%/pdfdesk/translation/<书id>/
 * <章>/`, keyed only by the book id. Two libraries can hold two different books
 * that share an id (or the same book added twice), and those two chapters then
 * read each other's pages. DEC-0014 §5 moves the cache into the library itself,
 * so the folder is scoped by library and book: `<书库>/.pdfdesk/translation/`.
 *
 * The migration runs once per process, never deletes data it cannot place, and
 * leaves `.migrated-from-global` behind for diagnosis.
 *
 * @module dsh-pdf-workbench/translation-cache
 */
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Library-owned plugin data folder (documents, annotations, caches). */
const LIBRARY_DATA = '.pdfdesk'

/** Folder inside a library that holds per-page translation caches. */
const TRANSLATION = 'translation'

/** Marker written next to one migrated book's cache. */
export const MIGRATION_MARKER = '.migrated-from-global'

/**
 * The translation cache root of one library.
 * @param {{ libraryDir: string }} library - a library entry.
 * @returns {string} `<libraryDir>/.pdfdesk/translation`.
 */
export function translationRoot(library) {
  return join(library.libraryDir, LIBRARY_DATA, TRANSLATION)
}

/**
 * The cache folder of one chapter.
 * @param {{ libraryDir: string }} library - a library entry.
 * @param {string} bookId - book id.
 * @param {string} code - chapter code (`c01`); normalized to lower case.
 * @returns {string} the absolute folder.
 */
export function chapterCacheDir(library, bookId, code) {
  return join(translationRoot(library), String(bookId), String(code ?? '').toLowerCase())
}

/**
 * The pre-v1.5 global cache root.
 * @param {string} dataDir - `%DSH_HOME%/pdfdesk`.
 * @returns {string} `<dataDir>/translation`.
 */
export function legacyTranslationRoot(dataDir) {
  return join(dataDir, TRANSLATION)
}

/**
 * Move one file, falling back to copy+delete when the two roots are on
 * different volumes (the usual case: plugin data on C:, library on D:).
 * @param {string} source - existing file.
 * @param {string} target - destination path.
 * @returns {Promise<void>}
 */
async function moveFile(source, target) {
  try {
    await rename(source, target)
    return
  } catch (error) {
    if (error === null || error.code !== 'EXDEV') throw error
  }
  await copyFile(source, target)
  const copied = await stat(target).catch(() => null)
  const original = await stat(source).catch(() => null)
  if (copied === null || original === null || copied.size !== original.size) {
    throw new Error(`复制校验失败：${source}`)
  }
  await rm(source, { force: true })
}

/**
 * Book ids a library currently holds: `分片/<id>/` folders plus whole PDFs in
 * `整本/` (a whole book's id is its file stem).
 * @param {{ libraryDir: string, fragmentDir?: string }} library - a library entry.
 * @returns {Promise<Set<string>>} the ids.
 */
async function bookIdsOf(library) {
  const ids = new Set()
  const fragmentDir = typeof library.fragmentDir === 'string' && library.fragmentDir !== ''
    ? library.fragmentDir
    : join(library.libraryDir, '分片')
  for (const name of await readdir(fragmentDir).catch(() => [])) {
    const info = await stat(join(fragmentDir, name)).catch(() => null)
    if (info !== null && info.isDirectory()) ids.add(name)
  }
  for (const name of await readdir(join(library.libraryDir, '整本')).catch(() => [])) {
    if (/\.pdf$/i.test(name)) ids.add(name.replace(/\.pdf$/i, ''))
  }
  return ids
}

/**
 * One chapter folder from the legacy cache, merged into the new place.
 * @param {string} sourceChapter - legacy chapter folder.
 * @param {string} targetChapter - destination chapter folder.
 * @param {{ moved: number, kept: number, warnings: string[] }} counters - report counters.
 * @returns {Promise<void>}
 */
async function mergeChapter(sourceChapter, targetChapter, counters) {
  await mkdir(targetChapter, { recursive: true })
  for (const file of await readdir(sourceChapter).catch(() => [])) {
    const source = join(sourceChapter, file)
    const target = join(targetChapter, file)
    const sourceInfo = await stat(source).catch(() => null)
    if (sourceInfo === null || !sourceInfo.isFile()) continue
    const existing = await stat(target).catch(() => null)
    if (existing !== null) {
      // The new folder already has this page: same size means the same bytes,
      // so the legacy copy is only a duplicate; different bytes are kept in the
      // legacy folder for a human to decide (never silently overwrite).
      if (existing.size === sourceInfo.size) {
        await rm(source, { force: true })
        counters.kept += 1
      } else {
        counters.warnings.push(`同名缓存内容不同，已保留旧文件：${target}`)
      }
      continue
    }
    await moveFile(source, target)
    counters.moved += 1
  }
}

/**
 * Move every legacy book cache it can place unambiguously into its library.
 *
 * A book id held by exactly one registered library moves there. An id held by
 * none or by several libraries is left untouched and reported: guessing could
 * hand one library's translation of a book to another.
 *
 * @param {{ dataDir: string, libraries: Array<{ libraryDir: string, fragmentDir?: string, id?: string }> }} options - plugin data folder and registered libraries.
 * @returns {Promise<{ moved: object[], skipped: object[], warnings: string[] }>} what happened.
 */
export async function migrateTranslationCache(options) {
  const legacyRoot = legacyTranslationRoot(options.dataDir)
  const legacyBooks = await readdir(legacyRoot).catch(() => [])
  const report = { moved: [], skipped: [], warnings: [] }
  if (legacyBooks.length === 0) return report
  const libraries = (Array.isArray(options.libraries) ? options.libraries : [])
    .filter(library => library !== null && typeof library === 'object' && typeof library.libraryDir === 'string' && library.libraryDir !== '')
  if (libraries.length === 0) {
    report.warnings.push(`旧译文缓存留在 ${legacyRoot}：还没有登记任何书库，无法判断归属`)
    return report
  }

  const owners = new Map()
  for (const library of libraries) {
    for (const id of await bookIdsOf(library)) {
      if (!owners.has(id)) owners.set(id, [])
      owners.get(id).push(library)
    }
  }

  for (const bookId of legacyBooks) {
    const sourceBook = join(legacyRoot, bookId)
    const sourceInfo = await stat(sourceBook).catch(() => null)
    if (sourceInfo === null || !sourceInfo.isDirectory()) continue
    const candidates = owners.get(bookId) ?? []
    if (candidates.length === 0) {
      report.skipped.push({ book: bookId, reason: '没有书库包含这本书' })
      continue
    }
    if (candidates.length > 1) {
      report.skipped.push({ book: bookId, reason: '多个书库都有同名书，无法判断归属' })
      continue
    }
    const library = candidates[0]
    const targetBook = join(translationRoot(library), bookId)
    const counters = { moved: 0, kept: 0, warnings: [] }
    try {
      await mkdir(targetBook, { recursive: true })
      for (const chapter of await readdir(sourceBook).catch(() => [])) {
        const sourceChapter = join(sourceBook, chapter)
        const chapterInfo = await stat(sourceChapter).catch(() => null)
        if (chapterInfo === null || !chapterInfo.isDirectory()) continue
        await mergeChapter(sourceChapter, join(targetBook, chapter), counters)
        const left = await readdir(sourceChapter).catch(() => [])
        if (left.length === 0) await rm(sourceChapter, { recursive: true, force: true })
      }
      await writeFile(join(targetBook, MIGRATION_MARKER), `${JSON.stringify({
        at: Date.now(),
        from: legacyRoot,
        moved: counters.moved,
        duplicates: counters.kept,
        warnings: counters.warnings.length,
      }, null, 2)}\n`, 'utf8')
      const remaining = await readdir(sourceBook).catch(() => [])
      if (remaining.length === 0) await rm(sourceBook, { recursive: true, force: true })
      report.moved.push({ book: bookId, libraryDir: library.libraryDir, files: counters.moved, duplicates: counters.kept })
      report.warnings.push(...counters.warnings)
    } catch (error) {
      report.warnings.push(`迁移《${bookId}》失败，旧缓存保留：${String(error && error.message ? error.message : error)}`)
    }
  }

  const leftBooks = await readdir(legacyRoot).catch(() => [])
  if (leftBooks.length === 0) await rm(legacyRoot, { recursive: true, force: true })
  else report.warnings.push(`旧译文缓存目录仍有未迁移内容：${legacyRoot}`)
  return report
}
