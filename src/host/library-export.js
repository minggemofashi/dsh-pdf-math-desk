/**
 * Export one library's data as a ZIP that never contains a book PDF.
 *
 * A migration package answers "move my workspace data"; this answers "move my
 * library's own data". The PDFs stay where they are: they are the user's files
 * under `分片/` and `整本/`, and the export is the counterpart the user is
 * expected to pair with their own compression of those two folders (DEC-0014
 * §3, copyright). The translation cache is rebuildable and stays out as well.
 *
 * @module dsh-pdf-workbench/library-export
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { packDirectory } from './backup.js'
import { PLUGIN_VERSION } from './config.js'

/** Manifest `format` value; deliberately not the migration-backup number. */
export const LIBRARY_EXPORT_FORMAT = 'pdfdesk-library-export'

/** Format of the PDF-only package (source PDFs, no plugin data). */
export const PDF_PACK_FORMAT = 'pdfdesk-pdf-pack'

/** What the manifest tells anyone opening the archive. */
const EXPORT_NOTE = '书库数据包：不含书籍 PDF（版权）。PDF 在 分片/ 与 整本/，请自行压缩携带。'

/** A file-name-safe library label. */
function libraryLabel(library) {
  const raw = String(library.name ?? '').trim() === '' ? String(library.id ?? '') : String(library.name)
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 40)
  return safe === '' ? 'library' : safe
}

/** One UTC timestamp readable in a file name. */
function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/**
 * Copy a path when it exists.
 * @param {string} source - file or folder.
 * @param {string} target - destination.
 * @returns {Promise<boolean>} whether anything was copied.
 */
async function copyIfExists(source, target) {
  const info = await stat(source).catch(() => null)
  if (info === null) return false
  await mkdir(join(target, '..'), { recursive: true })
  await cp(source, target, { recursive: info.isDirectory() })
  return true
}

/**
 * Copy a folder's children except the named ones.
 * @param {string} source - folder.
 * @param {string} target - destination folder.
 * @param {Set<string>} skip - child names to leave out.
 * @returns {Promise<boolean>} whether any child was copied.
 */
async function copyChildrenExcept(source, target, skip) {
  const info = await stat(source).catch(() => null)
  if (info === null || !info.isDirectory()) return false
  let copied = false
  for (const name of await readdir(source)) {
    if (skip.has(name)) continue
    await mkdir(target, { recursive: true })
    await cp(join(source, name), join(target, name), { recursive: true })
    copied = true
  }
  return copied
}

/**
 * Pack one library's data (index + `.pdfdesk/` without translation cache +
 * optional `产物/`) into `%DSH_HOME%/pdfdesk/backup/library-export-*.zip`.
 * @param {{ library: { id?: string, name?: string, libraryDir: string }, dataDir: string, includeArtifacts?: boolean }} options - library, plugin data folder, and whether produced PDFs travel.
 * @returns {Promise<{ name: string, bytes: number, files: number, included: object }>} the archive summary.
 */
export async function exportLibrary(options) {
  const library = options.library
  const staging = join(options.dataDir, 'tmp', `library-export-${process.pid}-${Date.now()}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const included = { index: false, libraryData: false, artifacts: false, pdf: false }
  try {
    included.index = await copyIfExists(join(library.libraryDir, '索引.json'), join(staging, '索引.json'))
    included.libraryData = await copyChildrenExcept(
      join(library.libraryDir, '.pdfdesk'),
      join(staging, '.pdfdesk'),
      new Set(['translation']),
    )
    if (options.includeArtifacts === true) {
      included.artifacts = await copyIfExists(join(library.libraryDir, '产物'), join(staging, '产物'))
    }
    const stampValue = stamp()
    const name = `library-export-${libraryLabel(library)}-${stampValue}.zip`
    const outPath = join(options.dataDir, 'backup', name)
    const packed = await packDirectory({
      root: staging,
      outPath,
      compress: true,
      format: LIBRARY_EXPORT_FORMAT,
      meta: {
        kind: 'library-export',
        note: EXPORT_NOTE,
        plugin: { name: 'dsh-pdf-workbench', version: PLUGIN_VERSION },
        library: {
          id: String(library.id ?? ''),
          name: String(library.name ?? ''),
          path: String(library.libraryDir ?? ''),
        },
        included,
      },
    })
    return { name, bytes: packed.bytes, files: packed.files, included }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Pack the library's PDF zone as its own package: source PDFs only, no plugin
 * data. `scope` picks `分片/`, `整本/` or both.
 * @param {{ library: { id?: string, name?: string, libraryDir: string }, dataDir: string, scope?: 'fragments' | 'whole' | 'both' }} options - library, data folder and what to pack.
 * @returns {Promise<{ name: string, bytes: number, files: number, included: object }>} the archive summary.
 */
export async function exportPdfPack(options) {
  const scope = options.scope === 'fragments' || options.scope === 'whole' ? options.scope : 'both'
  const staging = join(options.dataDir, 'tmp', `pdf-pack-${process.pid}-${Date.now()}`)
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const included = { pdf: true, fragments: false, whole: false }
  try {
    if (scope !== 'whole') {
      included.fragments = await copyIfExists(join(options.library.libraryDir, '分片'), join(staging, '分片'))
    }
    if (scope !== 'fragments') {
      included.whole = await copyIfExists(join(options.library.libraryDir, '整本'), join(staging, '整本'))
    }
    const name = `pdf-pack-${libraryLabel(options.library)}-${stamp()}.zip`
    const packed = await packDirectory({
      root: staging,
      outPath: join(options.dataDir, 'backup', name),
      compress: true,
      format: PDF_PACK_FORMAT,
      meta: {
        kind: 'pdf-pack',
        note: '书籍 PDF 包：只含用户自己的 PDF（分片/整本），不含标注、疑问、笔记等插件数据。',
        plugin: { name: 'dsh-pdf-workbench', version: PLUGIN_VERSION },
        library: {
          id: String(options.library.id ?? ''),
          name: String(options.library.name ?? ''),
          path: String(options.library.libraryDir ?? ''),
        },
        included,
      },
    })
    return { name, bytes: packed.bytes, files: packed.files, included }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
