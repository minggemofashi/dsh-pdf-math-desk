/**
 * Where the plugin's disk space goes, and which of it may be deleted.
 *
 * The panel only ever answers two questions: "what is using space" and "which
 * of that is rebuildable". Reading is always safe. Deleting is split by risk:
 *
 * - `rebuild` — translation caches, split-panel thumbnails and preview images,
 *   finished job state, upload scratch, the staging tree a crashed packing job
 *   left behind. The plugin recreates any of it on demand, so one click may
 *   remove all of it.
 * - `manual` — packages the user asked for (`backup/*.zip`), pre-import
 *   snapshots (the only copy of the state before an import), and `回收站/`
 *   (documents the user deleted but did not empty). These are only ever removed
 *   by an explicit user action with its own confirmation, never by the general
 *   cleanup and never automatically.
 *
 * Bookmarks, artifacts and PDFs are not listed at all: they are data, not cache
 * (DEC-0014 §4). Symbolic links are skipped so a link cannot be followed out of
 * a library and measured or deleted somewhere else.
 *
 * @module dsh-pdf-workbench/storage
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isExportName } from './exports.js'
import { legacyTranslationRoot, translationRoot } from './translation-cache.js'

/** Book-import stage packages expire after two hours (the wizard's own rule). */
const STAGE_TTL = 2 * 60 * 60 * 1000

/** Upload scratch and page-export temp files die after an hour. */
const TMP_TTL = 60 * 60 * 1000

/** Library folder holding removed books and artifacts; never auto-emptied. */
const TRASH = '回收站'

/**
 * Size, file count and newest mtime of one tree. Missing folders read as empty;
 * symbolic links are skipped rather than followed. The newest file time is what
 * "unused for N days" means: editing a file inside a folder does not update the
 * folder's own mtime on Windows.
 * @param {string} dir - folder to measure.
 * @returns {Promise<{ bytes: number, files: number, latest: number }>} the total.
 */
async function measureTree(dir) {
  let bytes = 0
  let files = 0
  let latest = 0
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      const nested = await measureTree(path)
      bytes += nested.bytes
      files += nested.files
      latest = Math.max(latest, nested.latest)
      continue
    }
    if (!entry.isFile()) continue
    const info = await stat(path).catch(() => null)
    if (info === null) continue
    bytes += info.size
    files += 1
    latest = Math.max(latest, info.mtimeMs)
  }
  return { bytes, files, latest }
}

/**
 * Size, file count and newest mtime of one file or folder.
 * @param {string} path - file or folder.
 * @returns {Promise<{ bytes: number, files: number, latest: number }>} the total.
 */
async function measurePath(path) {
  const info = await stat(path).catch(() => null)
  if (info === null) return { bytes: 0, files: 0, latest: 0 }
  if (info.isDirectory()) return measureTree(path)
  return { bytes: info.size, files: 1, latest: info.mtimeMs }
}

/**
 * Delete one file or folder, reporting whether it really went away. Windows can
 * refuse a file another process holds open; that must not be counted as deleted.
 * @param {string} path - file or folder.
 * @returns {Promise<boolean>} true when the path is gone.
 */
async function removePath(path) {
  try {
    await rm(path, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Split `<dataDir>/backup` into the packages the user asked for and the
 * leftovers of an interrupted packing/import.
 * @param {string} dataDir - the plugin data folder.
 * @returns {Promise<{ packages: { bytes: number, files: number }, staging: { bytes: number, files: number }, preImport: { bytes: number, files: number } }>} the split.
 */
async function measureBackup(dataDir) {
  const root = join(dataDir, 'backup')
  const result = {
    packages: { bytes: 0, files: 0 },
    staging: { bytes: 0, files: 0 },
    preImport: { bytes: 0, files: 0 },
  }
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(root, entry.name)
    const nested = await measurePath(path)
    if (entry.isDirectory() && entry.name.startsWith('staging-')) {
      result.staging.bytes += nested.bytes
      result.staging.files += nested.files
      continue
    }
    if (entry.name.startsWith('pre-import-')) {
      result.preImport.bytes += nested.bytes
      result.preImport.files += nested.files
      continue
    }
    if (entry.isFile() && isExportName(entry.name)) {
      result.packages.bytes += nested.bytes
      result.packages.files += nested.files
    }
  }
  return result
}

/**
 * Measure every folder the plugin owns. Read-only; safe to call while other
 * work runs. A folder that does not exist contributes zero.
 * @param {{ dataDir: string, libraries?: Array<{ libraryDir: string }> }} options - plugin data folder and registered libraries.
 * @returns {Promise<{ total: { bytes: number, files: number }, areas: Array<{ key: string, bytes: number, files: number, safe: 'rebuild' | 'manual' }> }>} the report.
 */
export async function measureStorage(options) {
  const dataDir = String(options.dataDir ?? '')
  const libraries = (Array.isArray(options.libraries) ? options.libraries : [])
    .filter(item => item !== null && typeof item === 'object' && typeof item.libraryDir === 'string' && item.libraryDir !== '')
  let translation = { bytes: 0, files: 0 }
  let trash = { bytes: 0, files: 0 }
  for (const library of libraries) {
    const cache = await measureTree(translationRoot(library))
    translation = { bytes: translation.bytes + cache.bytes, files: translation.files + cache.files }
    const removed = await measureTree(join(library.libraryDir, TRASH))
    trash = { bytes: trash.bytes + removed.bytes, files: trash.files + removed.files }
  }
  const legacy = await measureTree(legacyTranslationRoot(dataDir))
  // Split-panel thumbnails and the double-click preview images share this
  // folder. Both are rebuildable, so the settings cleanup may drop them.
  const thumbs = await measureTree(join(dataDir, 'thumbs'))
  const jobs = await measureTree(join(dataDir, 'translate-jobs'))
  const exportJobs = await measureTree(join(dataDir, 'export-jobs'))
  const tmp = await measureTree(join(dataDir, 'tmp'))
  const backup = await measureBackup(dataDir)
  // A migration package is dominated by the DSH session logs, so the panel has
  // to show them; the folder only moves when plugin data sits in a profile. The
  // home folder is derived the way `collectBackup` derives it.
  const home = dirname(dataDir)
  const sessions = await measureTree(join(home, 'sessions'))
  const fonts = await measureTree(join(dataDir, 'fonts'))
  const projcache = await measureTree(join(home, 'storages', 'session_projcache'))
  const areas = [
    { key: 'sessions', ...sessions, safe: 'manual' },
    { key: 'fonts', ...fonts, safe: 'manual' },
    { key: 'projcache', ...projcache, safe: 'rebuild' },
    { key: 'translation', ...translation, safe: 'rebuild' },
    { key: 'legacy', ...legacy, safe: 'rebuild' },
    { key: 'thumbs', ...thumbs, safe: 'rebuild' },
    { key: 'jobs', bytes: jobs.bytes + exportJobs.bytes, files: jobs.files + exportJobs.files, safe: 'rebuild' },
    { key: 'tmp', ...tmp, safe: 'rebuild' },
    { key: 'staging', ...backup.staging, safe: 'rebuild' },
    { key: 'preImport', ...backup.preImport, safe: 'manual' },
    { key: 'packages', ...backup.packages, safe: 'manual' },
    { key: 'trash', ...trash, safe: 'manual' },
  ]
  const total = areas.reduce((sum, area) => ({
    bytes: sum.bytes + area.bytes,
    files: sum.files + area.files,
  }), { bytes: 0, files: 0 })
  return { total, areas }
}

/**
 * Delete whatever an interrupted run left behind: upload scratch and page-export
 * temp files older than an hour, book-import stage packages older than two
 * hours (the wizard's own deadline), and `staging-*` trees from a packing job
 * that never finished. Nothing else is touched.
 * @param {{ dataDir: string, busy?: boolean }} options - plugin data folder and whether a packing job holds a staging tree right now.
 * @returns {Promise<{ removed: number, bytes: number }>} what was deleted.
 */
export async function cleanTemporary(options) {
  const dataDir = String(options.dataDir ?? '')
  const busy = options.busy === true
  let removed = 0
  let bytes = 0
  const now = Date.now()
  const tmpDir = join(dataDir, 'tmp')
  const entries = await readdir(tmpDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const path = join(tmpDir, entry.name)
    const info = await stat(path).catch(() => null)
    if (info === null) continue
    const limit = /^stage-[0-9a-f-]{36}\.zip$/.test(entry.name) ? STAGE_TTL : TMP_TTL
    if (now - info.mtimeMs < limit) continue
    const size = await measurePath(path)
    if (!(await removePath(path))) continue
    removed += 1
    bytes += size.bytes
  }
  // A running packing job owns the one staging tree that exists; without a job
  // any `staging-*` folder is the debris of a crash.
  if (!busy) {
    const backupDir = join(dataDir, 'backup')
    for (const entry of await readdir(backupDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !entry.name.startsWith('staging-')) continue
      const path = join(backupDir, entry.name)
      const size = await measurePath(path)
      if (!(await removePath(path))) continue
      removed += 1
      bytes += size.bytes
    }
  }
  return { removed, bytes }
}

/**
 * Empty one library's `回收站`. Only ever called for an explicit user action:
 * the folder holds books and artifacts the user deleted, not cache.
 * @param {{ libraryDir: string }} library - the library to empty.
 * @returns {Promise<{ removed: number, bytes: number }>} what was deleted.
 */
export async function emptyTrash(library) {
  const libraryDir = String(library?.libraryDir ?? '')
  if (libraryDir === '') return { removed: 0, bytes: 0 }
  const trashDir = join(libraryDir, TRASH)
  const info = await stat(trashDir).catch(() => null)
  if (info === null || !info.isDirectory()) return { removed: 0, bytes: 0 }
  let removed = 0
  let bytes = 0
  for (const entry of await readdir(trashDir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isSymbolicLink()) continue
    const path = join(trashDir, entry.name)
    const size = await measurePath(path)
    if (!(await removePath(path))) continue
    removed += 1
    bytes += size.bytes
  }
  return { removed, bytes }
}

/** One day, for the retention actions. */
const DAY = 24 * 60 * 60 * 1000

/**
 * Delete the `回收站` entries nothing touched for `days` days. Still an explicit
 * action — the button is the retention policy, no timer deletes anything.
 * @param {{ library: object, days: number }} options - the library and the retention window.
 * @returns {Promise<{ removed: number, bytes: number }>} what was deleted.
 */
export async function pruneTrash(options) {
  const libraryDir = String(options?.library?.libraryDir ?? '')
  const days = Math.max(1, Math.round(Number(options?.days) || 30))
  if (libraryDir === '') return { removed: 0, bytes: 0 }
  const trashDir = join(libraryDir, TRASH)
  const cutoff = Date.now() - days * DAY
  let removed = 0
  let bytes = 0
  for (const entry of await readdir(trashDir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isSymbolicLink()) continue
    const path = join(trashDir, entry.name)
    const size = await measurePath(path)
    if (size.latest === 0 || size.latest > cutoff) continue
    if (!(await removePath(path))) continue
    removed += 1
    bytes += size.bytes
  }
  return { removed, bytes }
}

/**
 * Delete the per-chapter translation caches of every library that have not been
 * touched for `days` days. The caches are rebuildable by translating again, and
 * the produced PDFs are not touched.
 * @param {{ libraries: object[], days: number }} options - libraries and the retention window.
 * @returns {Promise<{ removed: number, bytes: number }>} what was deleted.
 */
export async function pruneTranslationIdle(options) {
  const days = Math.max(1, Math.round(Number(options?.days) || 30))
  const cutoff = Date.now() - days * DAY
  const libraries = (Array.isArray(options?.libraries) ? options.libraries : [])
    .filter(item => item !== null && typeof item === 'object' && typeof item.libraryDir === 'string' && item.libraryDir !== '')
  let removed = 0
  let bytes = 0
  for (const library of libraries) {
    const root = translationRoot(library)
    for (const book of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!book.isDirectory() || book.isSymbolicLink()) continue
      const bookDir = join(root, book.name)
      for (const chapter of await readdir(bookDir, { withFileTypes: true }).catch(() => [])) {
        if (!chapter.isDirectory() || chapter.isSymbolicLink()) continue
        const dir = join(bookDir, chapter.name)
        const size = await measureTree(dir)
        if (size.latest === 0 || size.latest > cutoff) continue
        if (!(await removePath(dir))) continue
        removed += 1
        bytes += size.bytes
      }
    }
  }
  return { removed, bytes }
}

/**
 * Drop job state files that nothing will resume: a state file untouched for
 * `days` days that does not say `running`. Running jobs and their siblings are
 * always kept.
 * @param {{ dataDir: string, days: number }} options - plugin data folder and the retention window.
 * @returns {Promise<{ removed: number, bytes: number }>} what was deleted.
 */export async function pruneStaleJobs(options) {
  const dataDir = String(options?.dataDir ?? '')
  const days = Math.max(1, Math.round(Number(options?.days) || 30))
  const cutoff = Date.now() - days * DAY
  let removed = 0
  let bytes = 0
  for (const folder of ['translate-jobs', 'export-jobs']) {
    const dir = join(dataDir, folder)
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue
      if (!entry.name.endsWith('.json')) continue
      const path = join(dir, entry.name)
      const info = await stat(path).catch(() => null)
      if (info === null || info.mtimeMs > cutoff) continue
      let running = false
      try {
        const state = JSON.parse(await readFile(path, 'utf8'))
        running = state !== null && typeof state === 'object' && state.status === 'running'
      } catch {
        running = false
      }
      if (running) continue
      const size = info.size
      if (!(await removePath(path))) continue
      removed += 1
      bytes += size
    }
  }
  return { removed, bytes }
}

/**
 * SHA-256 of one file, streamed so a 2 GB PDF is not read into memory.
 * @param {string} path - file to hash.
 * @returns {Promise<string|null>} the hex digest, or null when unreadable.
 */
function hashOf(path) {
  return new Promise(resolve => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', () => resolve(null))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Group the library's PDFs by content. Report only: nothing is deleted, the user
 * decides what to remove (their PDFs are theirs). Files are grouped by size
 * first, so only same-size candidates are hashed.
 * @param {{ library: object }} options - the library to scan.
 * @returns {Promise<{ scanned: number, wasted: number, groups: Array<{ size: number, count: number, wasted: number, files: string[] }> }>} the report.
 */
export async function scanDuplicates(options) {
  const libraryDir = String(options?.library?.libraryDir ?? '')
  const report = { scanned: 0, wasted: 0, groups: [] }
  if (libraryDir === '') return report
  const candidates = []
  const add = async (dir, prefix) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile() || entry.isSymbolicLink()) continue
      if (!/\.pdf$/i.test(entry.name)) continue
      const info = await stat(join(dir, entry.name)).catch(() => null)
      if (info === null || info.size === 0) continue
      candidates.push({ size: info.size, path: join(dir, entry.name), label: `${prefix}${entry.name}` })
    }
  }
  await add(join(libraryDir, '整本'), '整本/')
  for (const book of await readdir(join(libraryDir, '分片'), { withFileTypes: true }).catch(() => [])) {
    if (!book.isDirectory() || book.isSymbolicLink()) continue
    await add(join(libraryDir, '分片', book.name), `分片/${book.name}/`)
  }
  report.scanned = candidates.length
  const bySize = new Map()
  for (const item of candidates) {
    const list = bySize.get(item.size) ?? []
    list.push(item)
    bySize.set(item.size, list)
  }
  const groups = []
  for (const [size, list] of bySize) {
    if (list.length < 2) continue
    const byHash = new Map()
    for (const item of list) {
      const hash = await hashOf(item.path)
      if (hash === null) continue
      const bucket = byHash.get(hash) ?? []
      bucket.push(item.label)
      byHash.set(hash, bucket)
    }
    for (const files of byHash.values()) {
      if (files.length < 2) continue
      const wasted = size * (files.length - 1)
      groups.push({ size, count: files.length, wasted, files: files.sort() })
      report.wasted += wasted
    }
  }
  groups.sort((left, right) => right.wasted - left.wasted)
  report.groups = groups
  return report
}
