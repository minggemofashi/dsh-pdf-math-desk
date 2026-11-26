/**
 * Data-migration backup: collect a staging tree, describe it in `manifest.json`
 * with checksums, and pack/unpack it as a ZIP. The archive never contains book
 * PDFs or credentials; the caller decides which sources are copied in.
 * @module dsh-pdf-workbench/backup
 */

import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'

import { listZipEntries, pipeZipEntry, readZipEntryBuffer, safeZipName, writeZipFile, ZipError } from './zip.js'

/** Version of the manifest schema. */
export const BACKUP_FORMAT = 1

/**
 * Largest single entry a migration package may carry when it is read into
 * memory; anything bigger is refused instead of buffered.
 */
export const MAX_BACKUP_ENTRY_BYTES = 512 * 1024 * 1024

/** Plugin-state files that travel with a backup (never credentials). */
export const PLUGIN_STATE_FILES = ['libraries.json', 'state.json', 'pending.json', 'links.json', 'pressure.json', 'shelves.json', 'qa-persona.md']

/**
 * Copy one path when it exists.
 * @param {string} source - file or directory.
 * @param {string} target - destination.
 * @returns {Promise<boolean>} whether anything was copied.
 */
async function copyIfExists(source, target) {
  const info = await stat(source).catch(() => null)
  if (info === null) return false
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: info.isDirectory() })
  return true
}

/**
 * Copy one library's `.pdfdesk` without its translation cache: per-page caches
 * are rebuildable and can be large, so a migration package never carries them
 * (they now live inside the library, see DEC-0014 §5).
 * @param {string} source - the library's `.pdfdesk` folder.
 * @param {string} target - the staging destination.
 * @returns {Promise<boolean>} whether anything was copied.
 */
async function copyLibraryData(source, target) {
  const info = await stat(source).catch(() => null)
  if (info === null || !info.isDirectory()) return false
  await mkdir(target, { recursive: true })
  let copied = false
  for (const name of await readdir(source).catch(() => [])) {
    if (name === 'translation') continue
    await cp(join(source, name), join(target, name), { recursive: true })
    copied = true
  }
  return copied
}

/**
 * Copy the selected sources into a staging tree.
 * @param {{ dataDir: string, dshHome?: string, libraries?: object[], include?: object, root?: string }} options - source locations and selection.
 * @returns {Promise<{ root: string, copied: string[], included: object }>} the staging tree.
 */
export async function collectBackup(options) {
  const dataDir = options.dataDir
  const home = typeof options.dshHome === 'string' && options.dshHome !== '' ? options.dshHome : dirname(dataDir)
  const include = options.include !== null && typeof options.include === 'object' ? options.include : {}
  const root = typeof options.root === 'string' && options.root !== '' ? options.root : join(dataDir, 'backup', `staging-${randomUUID()}`)
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  const copied = []
  const included = {
    sessions: false,
    workspace: false,
    pluginState: false,
    libraryData: [],
    settings: false,
    fonts: false,
    projcache: false,
  }
  if (include.sessions !== false) {
    included.sessions = await copyIfExists(join(home, 'sessions'), join(root, 'sessions'))
    if (included.sessions) copied.push('sessions')
  }
  if (include.workspace !== false) {
    included.workspace = await copyIfExists(join(home, 'storages', 'workspace.json'), join(root, 'storages', 'workspace.json'))
    if (included.workspace) copied.push('storages/workspace.json')
  }
  if (include.pluginState !== false) {
    let any = false
    for (const name of PLUGIN_STATE_FILES) {
      if (await copyIfExists(join(dataDir, name), join(root, 'plugin-state', name))) any = true
    }
    included.pluginState = any
    if (any) copied.push('plugin-state')
  }
  if (include.libraryData !== false) {
    const libraries = Array.isArray(options.libraries) ? options.libraries : []
    for (const library of libraries) {
      if (library === null || typeof library !== 'object' || typeof library.libraryDir !== 'string') continue
      const id = safeZipName(String(library.id ?? 'library'))
      const ok = await copyLibraryData(join(library.libraryDir, '.pdfdesk'), join(root, 'libraries', id, '.pdfdesk'))
      if (ok) {
        included.libraryData.push(id)
        copied.push(`libraries/${id}/.pdfdesk`)
      }
    }
  }
  if (include.fonts === true) {
    included.fonts = await copyIfExists(join(dataDir, 'fonts'), join(root, 'fonts'))
    if (included.fonts) copied.push('fonts')
  }
  if (include.settings === true && options.settings !== null && typeof options.settings === 'object') {
    await writeFile(join(root, 'settings.json'), `${JSON.stringify(options.settings, null, 2)}\n`, 'utf8')
    included.settings = true
    copied.push('settings.json')
  }
  if (include.projcache === true) {
    included.projcache = await copyIfExists(join(home, 'storages', 'session_projcache'), join(root, 'projcache'))
    if (included.projcache) copied.push('projcache')
  }
  return { root, copied, included }
}

/**
 * Build, pack and clean up a full backup archive.
 * @param {{ dataDir: string, dshHome?: string, libraries?: object[], include?: object,
 *   outDir?: string, pluginVersion?: string, machine?: object }} options - sources, selection and metadata.
 * @returns {Promise<{ outPath: string, name: string, bytes: number, files: number, manifest: object }>} the archive and its manifest.
 */
export async function createBackup(options) {
  const dataDir = options.dataDir
  const staging = await collectBackup(options)
  try {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    const name = `dsh-workbench-backup-${stamp}.zip`
    const outDir = typeof options.outDir === 'string' && options.outDir !== '' ? options.outDir : join(dataDir, 'backup')
    const outPath = join(outDir, name)
    const meta = {
      plugin: { name: 'dsh-pdf-workbench', version: typeof options.pluginVersion === 'string' ? options.pluginVersion : '' },
      machine: options.machine !== null && typeof options.machine === 'object' ? options.machine : {},
      included: staging.included,
      paths: {
        libraries: Object.fromEntries((Array.isArray(options.libraries) ? options.libraries : [])
          .filter(library => library !== null && typeof library === 'object' && typeof library.libraryDir === 'string')
          .map(library => [safeZipName(String(library.id ?? 'library')), { name: String(library.name ?? ''), old: library.libraryDir }])),
      },
    }
    const packed = await packDirectory({ root: staging.root, outPath, meta })
    const manifest = JSON.parse(await readFile(join(staging.root, 'manifest.json'), 'utf8'))
    return { outPath, name, bytes: packed.bytes, files: packed.files, manifest }
  } finally {
    await rm(staging.root, { recursive: true, force: true })
  }
}

/**
 * @param {Buffer} bytes - content.
 * @returns {string} hex sha256.
 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * List every regular file under a directory, relative with forward slashes.
 * @param {string} root - directory.
 * @param {string} [base] - internal prefix.
 * @returns {Promise<string[]>} relative names in a stable order.
 */
export async function walkFiles(root, base = '') {
  const entries = await readdir(base === '' ? root : join(root, base), { withFileTypes: true }).catch(() => [])
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = base === '' ? entry.name : `${base}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, relative))
      continue
    }
    if (entry.isFile()) files.push(relative)
  }
  return files
}

/**
 * Write `manifest.json` for a staging tree and return it.
 * @param {{ root: string, meta?: object, format?: number | string }} options - staging root, extra fields, and an optional format label (defaults to the migration backup format).
 * @returns {Promise<object>} the manifest.
 */
export async function buildManifest(options) {
  const files = []
  for (const name of await walkFiles(options.root)) {
    if (name === 'manifest.json') continue
    const bytes = await readFile(join(options.root, name))
    files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) })
  }
  const manifest = {
    format: options.format === undefined ? BACKUP_FORMAT : options.format,
    createdAt: Date.now(),
    ...(options.meta === undefined ? {} : options.meta),
    files,
  }
  await mkdir(options.root, { recursive: true })
  await writeFile(join(options.root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

const PYTHON_ZIP = `import os, sys, zipfile
root, out, mode = sys.argv[1], sys.argv[2], sys.argv[3]
compression = zipfile.ZIP_STORED if mode == 'store' else zipfile.ZIP_DEFLATED
with zipfile.ZipFile(out, 'w', compression) as archive:
    for base, dirs, files in os.walk(root):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(base, name)
            relative = os.path.relpath(path, root).replace(os.sep, '/')
            archive.write(path, relative)
`

/**
 * Pack with Python's zipfile when an interpreter is available; Node's writer
 * stays the fallback so a machine without Python (or a blocked spawn) still
 * produces a valid archive.
 * @param {{ root: string, outPath: string, compress?: boolean }} options - tree and destination.
 * @returns {Promise<{ bytes: number } | null>} the packed size, or null when unavailable.
 */
async function packWithPython(options) {
  const temporary = `${options.outPath}.${process.pid}.pyzip`
  const script = `${temporary}.py`
  await mkdir(dirname(options.outPath), { recursive: true })
  await writeFile(script, PYTHON_ZIP, 'utf8')
  const candidates = process.platform === 'win32'
    ? [['py', ['-3', script, options.root, temporary, options.compress === false ? 'store' : 'deflate']], ['python', [script, options.root, temporary, options.compress === false ? 'store' : 'deflate']]]
    : [['python3', [script, options.root, temporary, options.compress === false ? 'store' : 'deflate']], ['python', [script, options.root, temporary, options.compress === false ? 'store' : 'deflate']]]
  try {
    for (const [command, args] of candidates) {
      try {
        await promisify(execFile)(command, args, { windowsHide: true, timeout: 120000 })
        const info = await stat(temporary)
        if (info.isFile() === true && info.size > 0) {
          await rename(temporary, options.outPath)
          return { bytes: info.size }
        }
      } catch {
        // Try the next interpreter name.
      }
    }
    return null
  } finally {
    await rm(script, { force: true })
    await rm(temporary, { force: true })
  }
}

/**
 * Pack a staging tree into a ZIP, manifest first.
 *
 * Entries are described by path, never by bytes: Python's `zipfile` reads them
 * from disk when it is available, and the Node fallback streams them through
 * `writeZipFile`, so packing a staging tree never holds it in memory.
 *
 * @param {{ root: string, outPath: string, compress?: boolean, meta?: object, format?: number | string }} options - source tree, destination and the optional manifest format.
 * @returns {Promise<{ outPath: string, bytes: number, files: number }>} the archive.
 */
export async function packDirectory(options) {
  const manifest = await buildManifest({ root: options.root, meta: options.meta, format: options.format })
  const entries = [{ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') }]
  for (const file of manifest.files) entries.push({ name: file.path, path: join(options.root, file.path) })
  const python = await packWithPython({ root: options.root, outPath: options.outPath, compress: options.compress })
  if (python !== null) return { outPath: options.outPath, bytes: python.bytes, files: entries.length }
  await mkdir(dirname(options.outPath), { recursive: true })
  const temporary = `${options.outPath}.${process.pid}.tmp`
  try {
    const packed = await writeZipFile(temporary, { entries, compress: options.compress !== false })
    await rename(temporary, options.outPath)
    return { outPath: options.outPath, bytes: packed.bytes, files: packed.files }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

/** A writable that keeps nothing; used to checksum an entry without buffering it. */
function nullSink() {
  return new Writable({ write(_chunk, _encoding, callback) { callback() } })
}

/**
 * List the archive and parse its manifest without buffering any file.
 * @param {string} archivePath - zip path.
 * @returns {Promise<{ manifest: object, listing: Array<object>, byName: Map<string, object> }>} the manifest and entry lookup.
 */
async function inspectBackup(archivePath) {
  const listing = await listZipEntries(archivePath)
  const byName = new Map(listing.map(entry => [entry.name, entry]))
  const manifestEntry = byName.get('manifest.json')
  if (manifestEntry === undefined) throw new Error('迁移包缺少 manifest.json')
  const bytes = await readZipEntryBuffer(archivePath, manifestEntry, MAX_BACKUP_ENTRY_BYTES)
  let manifest
  try {
    manifest = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('迁移包的 manifest.json 不是有效 JSON')
  }
  if (manifest === null || typeof manifest !== 'object' || manifest.format !== BACKUP_FORMAT) {
    throw new Error(`不支持的迁移包版本：${manifest === null ? '?' : manifest.format}`)
  }
  if (!Array.isArray(manifest.files)) throw new Error('迁移包 manifest 缺少文件清单')
  return { manifest, listing, byName }
}

/**
 * Compare every manifest record with what the archive actually contains.
 * @param {object} manifest - parsed manifest.
 * @param {Map<string, object>} byName - archive entries by name.
 * @param {(name: string, entry: object) => Promise<{ sha256: string, bytes: number }>} measure - reads one entry, buffered or streamed.
 * @returns {Promise<string[]>} one problem per mismatch, in manifest order.
 */
async function verifyManifestFiles(manifest, byName, measure) {
  const problems = []
  for (const file of manifest.files) {
    const name = safeZipName(file.path)
    const entry = byName.get(name)
    if (entry === undefined) {
      problems.push(`缺少文件：${name}`)
      continue
    }
    let actual
    try {
      actual = await measure(name, entry)
    } catch (error) {
      if (!(error instanceof ZipError)) throw error
      problems.push(`读取失败：${error.message}`)
      continue
    }
    if (file.sha256 !== undefined && actual.sha256 !== file.sha256) problems.push(`校验失败：${name}`)
    if (file.bytes !== undefined && actual.bytes !== file.bytes) problems.push(`大小不符：${name}`)
  }
  return problems
}

/**
 * Read a backup archive and verify every checksum before the caller touches it.
 *
 * The package is listed once and then read entry by entry through
 * `readZipEntryBuffer`, so it is never held as a single buffer; a single entry
 * above `MAX_BACKUP_ENTRY_BYTES` is refused with `ZipError` `too-large`. The
 * returned shape stays the map-of-buffers callers already rely on.
 *
 * @param {string} archivePath - zip path.
 * @returns {Promise<{ manifest: object, entries: Map<string, Buffer> }>} verified content.
 */
export async function readBackup(archivePath) {
  const { manifest, listing, byName } = await inspectBackup(archivePath)
  const entries = new Map()
  for (const entry of listing) {
    entries.set(entry.name, await readZipEntryBuffer(archivePath, entry, MAX_BACKUP_ENTRY_BYTES))
  }
  const problems = await verifyManifestFiles(manifest, byName, async name => {
    const data = entries.get(name)
    return { sha256: sha256(data), bytes: data.length }
  })
  if (problems.length > 0) throw new Error(`迁移包校验失败：${problems.slice(0, 5).join('；')}`)
  return { manifest, entries }
}

/**
 * Extract a verified archive into a fresh directory (caller owns cleanup).
 * @param {{ manifest: object, entries: Map<string, Buffer>, outDir: string }} options - verified content and destination.
 * @returns {Promise<{ files: number }>} extraction summary.
 */
export async function extractBackup(options) {
  await mkdir(options.outDir, { recursive: true })
  let files = 0
  for (const name of options.entries.keys()) {
    if (name === 'manifest.json') continue
    const target = join(options.outDir, safeZipName(name))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, options.entries.get(name))
    files += 1
  }
  return { files }
}

/**
 * Map one archive entry to its destination on this machine.
 * @param {string} name - manifest entry path.
 * @param {{ dataDir: string, dshHome: string, libraryRoots: Record<string, string> }} roots - destinations.
 * @returns {string|null} absolute target, or null when the entry has no place here.
 */
export function destinationOf(name, roots) {
  if (name.startsWith('sessions/')) return join(roots.dshHome, 'sessions', name.slice('sessions/'.length))
  if (name === 'storages/workspace.json') return join(roots.dshHome, 'storages', 'workspace.json')
  if (name.startsWith('plugin-state/')) return join(roots.dataDir, name.slice('plugin-state/'.length))
  if (name.startsWith('fonts/')) return join(roots.dataDir, 'fonts', name.slice('fonts/'.length))
  if (name.startsWith('projcache/')) return join(roots.dshHome, 'storages', 'session_projcache', name.slice('projcache/'.length))
  if (name === 'settings.json') return join(roots.dataDir, 'backup', 'imported-settings.json')
  if (name.startsWith('libraries/')) {
    const parts = name.split('/')
    const id = parts[1]
    const rest = parts.slice(2)
    if (id === undefined || rest[0] !== '.pdfdesk') return null
    const root = roots.libraryRoots[id]
    if (typeof root !== 'string' || root === '') return null
    return join(root, ...rest)
  }
  return null
}

/**
 * Rewrite `libraries.json` roots using the manifest's recorded old paths.
 * @param {{ dataDir: string, manifest: object, libraryRoots: Record<string, string> }} options - current state and mapping.
 * @returns {Promise<{ rewritten: string[], missing: boolean }>} what changed.
 */
export async function rewriteLibraryRoots(options) {
  const path = join(options.dataDir, 'libraries.json')
  const raw = await readFile(path, 'utf8').catch(() => null)
  if (raw === null) return { rewritten: [], missing: true }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { rewritten: [], missing: true }
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return { rewritten: [], missing: true }
  const recorded = options.manifest.paths !== null && typeof options.manifest.paths === 'object' && options.manifest.paths.libraries !== null
    ? options.manifest.paths.libraries
    : {}
  const rewritten = []
  for (const item of parsed.items) {
    if (item === null || typeof item !== 'object') continue
    const id = String(item.id ?? '')
    const nextRoot = options.libraryRoots[id]
    const oldRoot = recorded[id] !== undefined && recorded[id] !== null ? recorded[id].old : undefined
    if (typeof nextRoot !== 'string' || nextRoot === '') continue
    if (typeof oldRoot === 'string' && oldRoot !== '' && typeof item.libraryDir === 'string') {
      const prefix = oldRoot.replace(/[\\/]+$/, '')
      for (const field of ['libraryDir', 'fragmentDir', 'artifactDir', 'coverDir', 'indexPath']) {
        if (typeof item[field] === 'string' && item[field].startsWith(prefix)) {
          item[field] = `${nextRoot}${item[field].slice(prefix.length)}`
        }
      }
    } else if (typeof item.libraryDir !== 'string' || item.libraryDir === '') {
      item.libraryDir = nextRoot
    }
    rewritten.push(id)
  }
  if (rewritten.length > 0) {
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
  return { rewritten, missing: false }
}

/**
 * Keep only the newest pre-import snapshots.
 * @param {string} backupDir - the plugin backup folder.
 * @param {number} [keep] - how many to keep.
 * @returns {Promise<void>} completion.
 */
async function prunePreImports(backupDir, keep = 3) {
  const names = (await readdir(backupDir).catch(() => []))
    .filter(name => name.startsWith('pre-import-'))
    .sort()
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    await rm(join(backupDir, name), { recursive: true, force: true })
  }
}

/**
 * Import a verified archive with explicit conflict strategies. `merge` never
 * overwrites: an existing file keeps its place and the imported copy becomes
 * `<name>.imported-<ts>`. `overwrite` replaces after a pre-import snapshot.
 *
 * Every checksum is checked first through `pipeZipEntry` into a null sink, so a
 * damaged package still changes nothing on disk; the write pass then streams one
 * entry at a time into a temporary file beside its destination and renames it,
 * comparing the streamed sha256 with the manifest again.
 *
 * @param {{ archivePath: string, dataDir: string, dshHome?: string,
 *   libraryRoots?: Record<string, string>, strategy?: 'merge'|'overwrite'|'skip' }} options - archive and destinations.
 * @returns {Promise<object>} the import report.
 */
export async function importBackup(options) {
  const archivePath = options.archivePath
  const { manifest, listing, byName } = await inspectBackup(archivePath)
  // One ceiling for both sides: `readBackup` refuses an entry above this, so the
  // import must refuse it too instead of streaming something inspect would reject.
  const oversized = listing.find(entry => entry.size > MAX_BACKUP_ENTRY_BYTES || entry.compressedSize > MAX_BACKUP_ENTRY_BYTES)
  if (oversized !== undefined) {
    throw new ZipError('too-large', `迁移包里有超过 ${Math.round(MAX_BACKUP_ENTRY_BYTES / 1048576)} MB 的文件：${oversized.name}`)
  }
  const verified = new Set()
  const problems = await verifyManifestFiles(manifest, byName, async (name, entry) => {
    verified.add(name)
    return pipeZipEntry(archivePath, entry, nullSink())
  })
  // The buffered reader inflated every entry before touching the disk, so a
  // damaged extra entry aborted the import too. Keep that guarantee: entries the
  // manifest never mentions are streamed once for integrity, not remembered.
  for (const entry of listing) {
    if (entry.name === 'manifest.json' || verified.has(entry.name)) continue
    try {
      await pipeZipEntry(archivePath, entry, nullSink())
    } catch (error) {
      if (!(error instanceof ZipError)) throw error
      problems.push(`读取失败：${error.message}`)
    }
  }
  if (problems.length > 0) throw new Error(`迁移包校验失败：${problems.slice(0, 5).join('；')}`)
  const declared = new Map(manifest.files.map(file => [safeZipName(file.path), file]))
  const dataDir = options.dataDir
  const dshHome = typeof options.dshHome === 'string' && options.dshHome !== '' ? options.dshHome : dirname(dataDir)
  const libraryRoots = options.libraryRoots !== null && typeof options.libraryRoots === 'object' ? options.libraryRoots : {}
  const strategy = options.strategy === 'overwrite' || options.strategy === 'skip' ? options.strategy : 'merge'
  const stamp = Date.now()
  const backupDir = join(dataDir, 'backup')
  const preImport = join(backupDir, `pre-import-${stamp}`)
  const report = {
    format: manifest.format,
    createdAt: manifest.createdAt,
    strategy,
    imported: [],
    renamed: [],
    skipped: [],
    warnings: [],
    rewrittenLibraries: [],
  }
  await mkdir(backupDir, { recursive: true })
  const snapshot = async target => {
    const relative = target.replace(/[\\/]/g, '/').split('/').slice(-3).join('/')
    const copy = join(preImport, String(report.imported.length + report.renamed.length), relative)
    await mkdir(dirname(copy), { recursive: true })
    await cp(target, copy, { recursive: true }).catch(() => {})
  }
  /**
   * Stream one entry to its final path: temporary sibling, checksum check
   * against the manifest, then an atomic rename. The temporary file is always
   * removed when anything goes wrong.
   */
  const place = async (entry, finalPath) => {
    const directory = dirname(finalPath)
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, `.import-${randomUUID()}.tmp`)
    try {
      const streamed = await pipeZipEntry(archivePath, entry, createWriteStream(temporary))
      const expected = declared.get(entry.name)
      if (expected !== undefined && expected.sha256 !== undefined && streamed.sha256 !== expected.sha256) {
        throw new Error(`迁移包校验失败：${entry.name}（写入后 sha256 不符）`)
      }
      if (expected !== undefined && expected.bytes !== undefined && streamed.bytes !== expected.bytes) {
        throw new Error(`迁移包校验失败：${entry.name}（写入后大小不符）`)
      }
      await rename(temporary, finalPath)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }
  for (const entry of listing) {
    const name = entry.name
    if (name === 'manifest.json') continue
    const target = destinationOf(name, { dataDir, dshHome, libraryRoots })
    if (target === null) {
      report.warnings.push(`未映射：${name}`)
      continue
    }
    const exists = await stat(target).catch(() => null)
    if (exists !== null && strategy === 'skip') {
      report.skipped.push(name)
      continue
    }
    if (exists !== null && strategy === 'merge') {
      const alternative = `${target}.imported-${stamp}`
      await place(entry, alternative)
      report.renamed.push(`${name} → ${alternative}`)
      continue
    }
    if (exists !== null && strategy === 'overwrite') await snapshot(target)
    await place(entry, target)
    report.imported.push(name)
  }
  const rewritten = await rewriteLibraryRoots({ dataDir, manifest, libraryRoots })
  report.rewrittenLibraries = rewritten.rewritten
  report.libraryStateMissing = rewritten.missing
  await writeFile(join(backupDir, 'last-import.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await prunePreImports(backupDir, 3)
  return report
}
