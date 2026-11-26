/**
 * The one import pipeline.
 *
 * Every file that enters the plugin from outside — a browser upload, a book
 * pack, a migration package — passes the same checks in the same order:
 * file-name whitelist, magic bytes, size ceiling, staged file, atomic rename.
 * Identical content already in the destination counts as a duplicate and never
 * lands twice; a name clash gets the unified `-2, -3…` suffix.
 *
 * Nothing here decides *where* a file goes: the caller resolves the library
 * folder and passes it as `targetDir`, which keeps `/pdfdesk/*` policy in
 * `routes.js` and the checks in one testable module.
 *
 * @module dsh-pdf-workbench/imports
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

import { resolveShortcutTarget } from './shortcut.js'
import { listZipEntries, pipeZipEntry, safeZipName, ZipError } from './zip.js'

/** One PDF / markdown / text upload, in bytes (64 MB). */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

/** One file inside a book pack (2 GB). */
export const MAX_ARCHIVE_FILE_BYTES = 2 * 1024 * 1024 * 1024

/** Uncompressed total of one book pack (4 GB). */
export const MAX_ARCHIVE_TOTAL_BYTES = 4 * 1024 * 1024 * 1024

/** Extensions each import kind accepts. */
const ALLOWED = {
  pdf: ['.pdf'],
  md: ['.md', '.markdown', '.txt'],
  archive: ['.zip'],
}

/** Shortcut containers Windows produces; never importable, whatever their bytes say. */
const SHORTCUT_EXTENSIONS = ['.lnk', '.url', '.desktop', '.appref-ms', '.pif', '.scr', '.website']

/** Explorer's own files, which users sometimes drag in by accident. */
const SYSTEM_NAMES = ['desktop.ini', 'thumbs.db', '.ds_store']

/** Names Windows refuses to create, so a library copy would fail later. */
const DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Characters Windows forbids in a file name. */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g

/** The library shows names in a single line; 160 keeps the extension visible. */
const MAX_NAME_LENGTH = 160

/** PDF header, per ISO 32000. */
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1')

/**
 * A refusal the caller can turn into a 4xx without inspecting messages.
 */
export class RejectError extends Error {
  /**
   * @param {string} code - stable machine code (`fake-pdf`, `too-large`, ...).
   * @param {string} message - user-facing reason, already localized.
   */
  constructor(code, message) {
    super(message)
    this.name = 'RejectError'
    this.code = code
  }
}

/**
 * Turn a proposed name into the name that may be written, or refuse it.
 * Directory parts are dropped: an import lands in one folder by design.
 * @param {string} rawName - the browser's or archive entry's name.
 * @param {string[]} allowed - extensions this kind accepts, e.g. `['.pdf']`.
 * @param {string} [label] - noun used in refusals ("书籍包").
 * @returns {string} the safe file name.
 */
export function sanitizeName(rawName, allowed, label = '文件') {
  const leaf = String(rawName ?? '').split(/[\\/]/).pop() ?? ''
  const trimmed = leaf.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    throw new RejectError('bad-name', `文件名不合法：${trimmed === '' ? '(空)' : trimmed}`)
  }
  const lowered = trimmed.toLowerCase()
  const extension = extname(lowered)
  if (SYSTEM_NAMES.includes(lowered)) throw new RejectError('blocked-name', `系统文件不能导入：${trimmed}`)
  if (trimmed.startsWith('.') || trimmed.startsWith('~$')) throw new RejectError('blocked-name', `隐藏文件不能导入：${trimmed}`)
  if (SHORTCUT_EXTENSIONS.includes(extension)) throw new RejectError('shortcut', `不允许导入快捷方式：${trimmed}`)
  if (!allowed.includes(extension)) throw new RejectError('bad-extension', `只接受 ${allowed.join(' / ')} ${label}：${trimmed}`)
  const replaced = trimmed.replace(ILLEGAL, '_').replace(/[. ]+$/, '')
  const safeExtension = extname(replaced)
  const stem = replaced.slice(0, replaced.length - safeExtension.length).slice(0, MAX_NAME_LENGTH - safeExtension.length).trim()
  if (stem === '') throw new RejectError('bad-name', `文件名不合法：${trimmed}`)
  if (DEVICE_NAME.test(stem)) throw new RejectError('reserved-name', `Windows 保留名不能用作文件名：${replaced}`)
  return `${stem}${safeExtension}`
}

/**
 * Refuse bytes that do not match their claimed kind.
 * @param {'pdf'|'md'|'archive'} kind - what the caller says the bytes are.
 * @param {Buffer} bytes - the content.
 * @returns {void}
 */
export function checkMagic(kind, bytes) {
  if (kind === 'pdf') {
    if (bytes.length < PDF_SIGNATURE.length || !bytes.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
      throw new RejectError('fake-pdf', '不是有效的 PDF（文件头不是 %PDF-）')
    }
    return
  }
  if (kind === 'archive') {
    const zip = bytes.length >= 4
      && bytes[0] === 0x50
      && bytes[1] === 0x4b
      && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
    if (!zip) throw new RejectError('bad-archive', '不是有效的 ZIP（文件头不是 PK）')
    return
  }
  if (kind === 'md') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new RejectError('bad-encoding', '文本不是 UTF-8 编码')
    }
    if (bytes.includes(0)) throw new RejectError('bad-encoding', '文件里有二进制内容')
    return
  }
  throw new RejectError('bad-kind', `未知的导入类型：${kind}`)
}

/**
 * Human-readable ceiling for error messages ("64 MB", "4 GB").
 * @param {number} bytes - a limit.
 * @returns {string} the label.
 */
export function formatLimit(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

/**
 * One empty report; every import returns this shape.
 * @param {string} targetDir - the folder the report describes.
 * @returns {{ targetDir: string, imported: object[], duplicates: object[], renamed: object[], skipped: object[], rejected: object[] }} the report.
 */
function emptyReport(targetDir) {
  return { targetDir, imported: [], duplicates: [], renamed: [], skipped: [], rejected: [] }
}

/**
 * @param {string} path - file.
 * @returns {Promise<string>} hex sha256 of the file's bytes.
 */
function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * The first bytes of a file on disk, without reading the rest of it.
 * @param {string} path - file.
 * @param {number} length - how many bytes to read.
 * @returns {Promise<Buffer>} up to `length` bytes.
 */
async function fileHead(path, length) {
  const handle = await open(path, 'r')
  try {
    const head = Buffer.alloc(length)
    const { bytesRead } = await handle.read(head, 0, length, 0)
    return head.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Files already in one folder, grouped by size so only same-size files are hashed.
 * @param {string} dir - destination folder.
 * @returns {Promise<Map<number, string[]>>} size → names.
 */
async function buildSizeIndex(dir) {
  const index = new Map()
  const names = await readdir(dir).catch(() => [])
  for (const name of names) {
    const info = await lstat(join(dir, name)).catch(() => null)
    if (info === null || !info.isFile()) continue
    if (!index.has(info.size)) index.set(info.size, [])
    index.get(info.size).push(name)
  }
  return index
}

/**
 * The existing file with the same content, if any.
 * @param {string} dir - destination folder.
 * @param {Map<number, string[]>} index - size index of `dir`.
 * @param {number} size - candidate size.
 * @param {string} hash - candidate sha256.
 * @returns {Promise<string|null>} the existing name, or null.
 */
async function duplicateIn(dir, index, size, hash) {
  const candidates = index.get(size)
  if (candidates === undefined) return null
  for (const name of candidates) {
    if (await hashFile(join(dir, name)).catch(() => null) === hash) return name
  }
  return null
}

/**
 * Pick the first free name, starting the suffix at `-2` everywhere.
 * @param {string} dir - destination folder.
 * @param {string} name - wanted name.
 * @returns {Promise<string>} a name no file in `dir` uses.
 */
async function freeName(dir, name) {
  if (await lstat(join(dir, name)).catch(() => null) === null) return name
  const extension = extname(name)
  const stem = extension === '' ? name : name.slice(0, -extension.length)
  for (let counter = 2; counter < 1000; counter += 1) {
    const candidate = `${stem}-${counter}${extension}`
    if (await lstat(join(dir, candidate)).catch(() => null) === null) return candidate
  }
  throw new RejectError('too-many-names', `同名文件太多：${name}`)
}

/**
 * Refuse a destination that is a link or reparse point.
 * @param {string} path - destination.
 * @returns {Promise<void>}
 */
async function rejectSymlink(path) {
  const info = await lstat(path).catch(() => null)
  if (info !== null && info.isSymbolicLink()) throw new RejectError('symlink', `拒绝写入符号链接：${basename(path)}`)
}

/**
 * Move a staged file into place; `rename` stays atomic on one volume, and the
 * copy fallback keeps the destination folder's own temp file so a reader never
 * sees a half-written PDF.
 * @param {string} targetDir - destination folder.
 * @param {string} name - final name.
 * @param {string} stagedPath - complete file to move.
 * @returns {Promise<string>} the final absolute path.
 */
async function moveInto(targetDir, name, stagedPath) {
  const target = join(targetDir, name)
  try {
    await rename(stagedPath, target)
  } catch (error) {
    if (error === null || error.code !== 'EXDEV') throw error
    const temporary = join(targetDir, `.${name}.${process.pid}.importing`)
    await copyFile(stagedPath, temporary)
    await rename(temporary, target)
    await rm(stagedPath, { force: true })
  }
  return target
}

/**
 * Check only the ZIP signature of a file on disk (archives may be too large to
 * read just to look at four bytes).
 * @param {string} path - the archive to inspect.
 * @returns {Promise<void>}
 */
export async function checkArchiveFile(path) {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(4)
    const { bytesRead } = await handle.read(header, 0, 4, 0)
    checkMagic('archive', header.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

/**
 * Read a request body into a temp file, enforcing the ceiling while streaming.
 * The caller owns the returned path and must delete it.
 * @param {import('node:http').IncomingMessage} request - inbound request.
 * @param {{ dataDir: string, limit: number, extension?: string }} options - destination folder, ceiling and suffix.
 * @returns {Promise<{ path: string, bytes: number }>} the staged file.
 */
export async function receiveUpload(request, options) {
  const tmpDir = join(options.dataDir, 'tmp')
  await mkdir(tmpDir, { recursive: true })
  const file = join(tmpDir, `import-${randomUUID()}${options.extension ?? ''}`)
  const handle = await open(file, 'w')
  let total = 0
  try {
    for await (const chunk of request) {
      total += chunk.length
      if (total > options.limit) throw new RejectError('too-large', `上传内容超过 ${formatLimit(options.limit)}`)
      await handle.write(chunk)
    }
  } catch (error) {
    await handle.close().catch(() => {})
    await rm(file, { force: true }).catch(() => {})
    throw error
  }
  await handle.close()
  if (total === 0) {
    await rm(file, { force: true }).catch(() => {})
    throw new RejectError('empty', '上传内容为空')
  }
  return { path: file, bytes: total }
}

/** One queue per destination folder, so two imports cannot pick the same free name. */
const queues = new Map()

/**
 * Run one import action after every earlier action on the same folder.
 * @param {string} dir - destination folder.
 * @param {() => Promise<unknown>} action - the work.
 * @returns {Promise<unknown>} the action's result.
 */
function withDirLock(dir, action) {
  const previous = queues.get(dir) ?? Promise.resolve()
  const run = previous.then(action, action)
  const tail = run.then(() => {}, () => {})
  queues.set(dir, tail)
  tail.then(() => {
    if (queues.get(dir) === tail) queues.delete(dir)
  })
  return run
}

/**
 * Import one already-staged PDF, markdown or text file.
 *
 * Markdown and text are rendered to PDF first; the rendered PDF is what the
 * duplicate check and naming see, so re-importing the same text stays a
 * duplicate. The staged source is consumed or deleted either way.
 *
 * @param {{ targetDir: string, dataDir: string, name: string, kind: 'pdf'|'md', sourcePath: string, render?: (source: string, outPath: string) => Promise<string> }} options - destination, staged upload and renderer.
 * @returns {Promise<{ targetDir: string, imported: object[], duplicates: object[], renamed: object[], skipped: object[], rejected: object[] }>} the report.
 */
export async function importSingle(options) {
  return withDirLock(options.targetDir, () => importSingleLocked(options))
}

/**
 * @param {{ targetDir: string, dataDir: string, name: string, kind: 'pdf'|'md', sourcePath: string, maxBytes?: number, render?: (source: string, outPath: string) => Promise<string> }} options - destination, staged upload, optional size ceiling and renderer.
 * @returns {Promise<{ targetDir: string, imported: object[], duplicates: object[], renamed: object[], skipped: object[], rejected: object[] }>} the report.
 */
async function importSingleLocked(options) {
  const allowed = ALLOWED[options.kind]
  if (allowed === undefined) throw new RejectError('bad-kind', `未知的导入类型：${options.kind}`)
  const limit = Number.isFinite(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : MAX_UPLOAD_BYTES
  const report = emptyReport(options.targetDir)
  await mkdir(options.targetDir, { recursive: true })
  // A Windows shortcut is never stored: the PDF behind it is imported instead.
  // Only the PDF channel resolves one; md/txt uploads keep the old refusal.
  if (options.kind === 'pdf' && isShortcutUpload(options.name)) {
    try {
      await importShortcutTarget({
        stagedPath: options.sourcePath,
        targetDir: options.targetDir,
        dataDir: options.dataDir,
        limit,
        report,
      })
      return report
    } finally {
      await rm(options.sourcePath, { force: true }).catch(() => {})
    }
  }
  const name = sanitizeName(options.name, allowed)
  let stagedPath = options.sourcePath
  let stagedOwned = false
  try {
    const info = await stat(stagedPath)
    if (info.size === 0) throw new RejectError('empty', `文件是空的：${name}`)
    if (info.size > limit) throw new RejectError('too-large', `单个文件不能超过 ${formatLimit(limit)}：${name}`)
    checkMagic(options.kind, await readFile(stagedPath))
    let storedName = name
    if (options.kind === 'md') {
      if (typeof options.render !== 'function') {
        throw new RejectError('render-unavailable', '导入 md/txt 需要 Python 与 TeX Live（xelatex）')
      }
      const extension = extname(name)
      storedName = `${name.slice(0, name.length - extension.length)}.pdf`
      stagedPath = join(options.dataDir, 'tmp', `import-${randomUUID()}.pdf`)
      stagedOwned = true
      await options.render(options.sourcePath, stagedPath)
      const rendered = await stat(stagedPath).catch(() => null)
      if (rendered === null || rendered.size === 0) throw new RejectError('render-failed', '渲染没有生成 PDF')
    }
    const stagedInfo = await stat(stagedPath)
    const hash = await hashFile(stagedPath)
    const index = await buildSizeIndex(options.targetDir)
    const duplicate = await duplicateIn(options.targetDir, index, stagedInfo.size, hash)
    if (duplicate !== null) {
      report.duplicates.push({ name: storedName, existing: duplicate })
      return report
    }
    const finalName = await freeName(options.targetDir, storedName)
    await rejectSymlink(join(options.targetDir, finalName))
    const target = await moveInto(options.targetDir, finalName, stagedPath)
    report.imported.push({ name: finalName, path: target, bytes: stagedInfo.size })
    if (finalName !== storedName) report.renamed.push({ from: storedName, to: finalName })
    return report
  } finally {
    await rm(options.sourcePath, { force: true }).catch(() => {})
    if (stagedOwned) await rm(stagedPath, { force: true }).catch(() => {})
  }
}

/**
 * Whether an upload is a Windows shortcut whose target should be imported.
 * Only `.lnk` is resolved; every other shortcut container stays refused.
 * @param {string} rawName - the browser's file name.
 * @returns {boolean} true when the PDF behind the shortcut is what to import.
 */
function isShortcutUpload(rawName) {
  const leaf = String(rawName ?? '').split(/[\\/]/).pop() ?? ''
  const trimmed = leaf.trim()
  return trimmed.length > '.lnk'.length && trimmed.toLowerCase().endsWith('.lnk')
}

/**
 * Classify a shortcut's target path, so a network location keeps its own reason
 * instead of a generic "unreadable".
 * @param {string} path - the path the shortcut stores.
 * @returns {'local'|'network'|'other'} the kind.
 */
function shortcutPathKind(path) {
  const text = String(path)
  if (/^[\\/]{2}\?[\\/]UNC[\\/]/i.test(text)) return 'network'
  if (/^[\\/]{2}[.?][\\/]/.test(text)) {
    // `\\?\C:\…` is still a local file; other device namespaces are not.
    return /^[\\/]{2}\?[\\/][A-Za-z]:[\\/]/.test(text) ? 'local' : 'other'
  }
  if (/^[\\/]{2}/.test(text)) return 'network'
  return /^[A-Za-z]:[\\/]/.test(text) ? 'local' : 'other'
}

/**
 * Import the PDF a shortcut points at.
 *
 * The `.lnk` itself never enters the library: its target is copied into the
 * staging folder and then runs through the normal PDF checks, de-duplication,
 * `-2` naming and atomic move, so the stored name is the target's own name. The
 * copy is what gets moved, never the user's file.
 *
 * @param {{ stagedPath: string, targetDir: string, dataDir: string, limit: number, report: object }} options - staged shortcut, destination, ceiling and the report to fill.
 * @returns {Promise<void>}
 */
async function importShortcutTarget(options) {
  const resolved = resolveShortcutTarget(await readFile(options.stagedPath))
  if (resolved === null) {
    throw new RejectError('shortcut-bad', '这个快捷方式读不出目标路径（可能已损坏）。请直接拖原 PDF 到书库。')
  }
  const targetPath = resolved.path
  const kind = shortcutPathKind(targetPath)
  if (kind === 'network') {
    throw new RejectError('shortcut-network', `快捷方式指向网络位置：${targetPath}。请先把 PDF 复制到本机再拖进书库。`)
  }
  if (kind !== 'local') {
    throw new RejectError('shortcut-bad', `无法使用快捷方式的目标路径：${targetPath}。请直接拖原 PDF 到书库。`)
  }
  const info = await stat(targetPath).catch(() => null)
  if (info === null) {
    throw new RejectError('shortcut-missing', `快捷方式的目标不存在：${targetPath}。请直接拖原 PDF 到书库。`)
  }
  if (!info.isFile() || extname(targetPath).toLowerCase() !== '.pdf') {
    throw new RejectError('shortcut-type', `快捷方式的目标不是 PDF 文件：${targetPath}。请直接拖原 PDF 到书库。`)
  }
  if (info.size > options.limit) {
    throw new RejectError('too-large', `快捷方式的目标超过 ${formatLimit(options.limit)}：${targetPath}。请直接拖原 PDF 到书库。`)
  }
  const tmpDir = join(options.dataDir, 'tmp')
  await mkdir(tmpDir, { recursive: true })
  const stagedPath = join(tmpDir, `import-${randomUUID()}.pdf`)
  try {
    await copyFile(targetPath, stagedPath)
  } catch {
    await rm(stagedPath, { force: true }).catch(() => {})
    throw new RejectError('shortcut-missing', `读不到快捷方式的目标：${targetPath}。请直接拖原 PDF 到书库。`)
  }
  try {
    const imported = await importSingleLocked({
      targetDir: options.targetDir,
      dataDir: options.dataDir,
      name: basename(targetPath),
      kind: 'pdf',
      sourcePath: stagedPath,
      maxBytes: options.limit,
    })
    for (const item of imported.imported) {
      options.report.imported.push({ ...item, source: 'shortcut', target: targetPath })
    }
    for (const item of imported.duplicates) {
      options.report.duplicates.push({ ...item, source: 'shortcut', target: targetPath })
    }
    options.report.renamed.push(...imported.renamed)
  } finally {
    // The pipeline moves the copy into the library, so this only matters when it
    // refuses the target's name before staging: no temp file is left behind.
    await rm(stagedPath, { force: true }).catch(() => {})
  }
}

/**
 * Import a book pack: every PDF entry goes through the same checks as an
 * upload, and identical content is skipped even in `overwrite` mode.
 *
 * The archive is unpacked entry by entry (streamed through a temp file in the
 * destination), never read into memory as a whole.
 *
 * @param {{ archivePath?: string, bytes?: Buffer, dataDir?: string, targetDir: string, strategy?: 'merge'|'overwrite'|'skip' }} options - archive, destination and clash policy.
 * @returns {Promise<{ targetDir: string, imported: object[], duplicates: object[], renamed: object[], skipped: object[], rejected: object[] }>} the report.
 */
export async function importArchive(options) {
  return withDirLock(options.targetDir, () => importArchiveLocked(options))
}

/**
 * Write caller-supplied archive bytes to a temp file, so an in-memory archive
 * still takes the streaming path. The caller owns the file it gets back.
 * @param {{ bytes: Buffer, dataDir?: string }} options - the archive bytes and the plugin data folder, if known.
 * @returns {Promise<string>} path of the staged archive.
 */
async function stageArchiveBytes(options) {
  const base = typeof options.dataDir === 'string' && options.dataDir !== '' ? join(options.dataDir, 'tmp') : tmpdir()
  await mkdir(base, { recursive: true })
  const path = join(base, `import-${randomUUID()}.zip`)
  await writeFile(path, options.bytes)
  return path
}

/**
 * @param {{ archivePath?: string, bytes?: Buffer, dataDir?: string, targetDir: string, strategy?: 'merge'|'overwrite'|'skip' }} options - archive, destination and clash policy.
 * @returns {Promise<{ targetDir: string, imported: object[], duplicates: object[], renamed: object[], skipped: object[], rejected: object[] }>} the report.
 */
async function importArchiveLocked(options) {
  const strategy = options.strategy === 'overwrite' || options.strategy === 'skip' ? options.strategy : 'merge'
  const targetDir = options.targetDir
  // A caller may still hand the archive over as bytes; stage it and stream from
  // disk like every other archive, so no import path buffers a whole pack.
  let archivePath = typeof options.archivePath === 'string' ? options.archivePath : ''
  let stagedArchive = null
  if (options.bytes !== undefined) {
    checkMagic('archive', options.bytes)
    stagedArchive = await stageArchiveBytes(options)
    archivePath = stagedArchive
  }
  try {
    if (stagedArchive === null) await checkArchiveFile(archivePath)
    let entries
    try {
      entries = await listZipEntries(archivePath)
    } catch (error) {
      // A damaged or path-traversing archive is the user's file being unusable,
      // not a Host failure.
      throw new RejectError('bad-archive', String(error && error.message ? error.message : error))
    }
    await mkdir(targetDir, { recursive: true })
    const report = emptyReport(targetDir)
    const index = await buildSizeIndex(targetDir)
    let total = 0
    for (const entry of entries) {
      const entryName = entry.name
      // Directory entries carry no file.
      if (entryName.endsWith('/')) continue
      let name
      try {
        const safe = safeZipName(entryName)
        name = basename(safe)
        name = sanitizeName(name, ALLOWED.pdf, '书籍包')
      } catch (error) {
        report.rejected.push({
          name: entryName,
          reason: error instanceof RejectError ? error.message : String(error && error.message ? error.message : error),
        })
        continue
      }
      if (entry.size === 0) {
        report.rejected.push({ name, reason: '文件是空的' })
        continue
      }
      if (entry.size > MAX_ARCHIVE_FILE_BYTES) {
        report.rejected.push({ name, reason: `单个文件超过 ${formatLimit(MAX_ARCHIVE_FILE_BYTES)}` })
        continue
      }
      total += entry.size
      if (total > MAX_ARCHIVE_TOTAL_BYTES) {
        report.rejected.push({ name, reason: `压缩包总量超过 ${formatLimit(MAX_ARCHIVE_TOTAL_BYTES)}，其余文件未导入` })
        break
      }
      // Unpack one entry into the destination folder: the temp file is on the
      // same volume as its final name, so the last step is an atomic rename.
      const stagedPath = join(targetDir, `.import-${randomUUID()}.pdf`)
      let streamed
      try {
        streamed = await pipeZipEntry(archivePath, entry, createWriteStream(stagedPath))
        checkMagic('pdf', await fileHead(stagedPath, PDF_SIGNATURE.length))
      } catch (error) {
        await rm(stagedPath, { force: true }).catch(() => {})
        if (error instanceof RejectError) {
          report.rejected.push({ name, reason: error.message })
          continue
        }
        if (error instanceof ZipError) {
          report.rejected.push({ name, reason: `压缩包数据损坏：${error.message}` })
          continue
        }
        throw error
      }
      const hash = streamed.sha256
      let moved = false
      try {
        const duplicate = await duplicateIn(targetDir, index, streamed.bytes, hash)
        if (duplicate !== null) {
          report.duplicates.push({ name, existing: duplicate })
          continue
        }
        const exists = await lstat(join(targetDir, name)).catch(() => null)
        let finalName = name
        if (exists !== null && strategy === 'skip') {
          report.skipped.push({ name, reason: '目标目录已有同名文件' })
          continue
        }
        if (exists !== null && strategy === 'merge') finalName = await freeName(targetDir, name)
        if (exists !== null && strategy === 'overwrite') await rejectSymlink(join(targetDir, name))
        await rename(stagedPath, join(targetDir, finalName))
        moved = true
        if (!index.has(streamed.bytes)) index.set(streamed.bytes, [])
        index.get(streamed.bytes).push(finalName)
        report.imported.push({ name: finalName, path: join(targetDir, finalName), bytes: streamed.bytes })
        if (finalName !== name) report.renamed.push({ from: name, to: finalName })
      } finally {
        if (!moved) await rm(stagedPath, { force: true }).catch(() => {})
      }
    }
    return report
  } finally {
    if (stagedArchive !== null) await rm(stagedArchive, { force: true }).catch(() => {})
  }
}
