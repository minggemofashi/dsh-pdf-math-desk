/**
 * Chapter attachments: user-supplied files kept beside the chapter, outside the
 * PDF reader. A first version accepts PDFs and images; the manifest records what
 * was copied so the browser can list it without rescanning metadata.
 * @module dsh-pdf-workbench/attachments
 */

import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

/** Extensions the first version accepts, with the kind shown in the UI. */
export const ATTACHMENT_KINDS = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  bmp: 'image',
  avif: 'image',
}

/** Per-file ceiling for a copied attachment. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

/**
 * Where one chapter's attachments live.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} the absolute directory.
 */
export function attachmentsDir(libraryDir, book, code) {
  return join(libraryDir, '.pdfdesk', 'attachments', book, code)
}

/**
 * The manifest beside the files.
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {string} the manifest path.
 */
export function attachmentManifestPath(libraryDir, book, code) {
  return join(attachmentsDir(libraryDir, book, code), 'manifest.json')
}

/**
 * Strip directories and characters Windows or the browser would misread.
 * @param {string} value - proposed file name.
 * @returns {string} a safe base name (never empty).
 */
export function safeAttachmentName(value) {
  const base = basename(String(value ?? '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return base === '' || base === '.' || base === '..' ? 'attachment' : base.slice(0, 120)
}

/**
 * Read the manifest, tolerating a missing or broken file.
 * @param {string} dir - the chapter's attachment directory.
 * @returns {Promise<{ version: number, items: object[] }>} parsed manifest.
 */
async function readManifest(dir) {
  const raw = await readFile(join(dir, 'manifest.json'), 'utf8').catch(() => null)
  if (raw === null) return { version: 1, items: [] }
  try {
    const parsed = JSON.parse(raw)
    const items = Array.isArray(parsed.items) ? parsed.items.filter(item => item !== null && typeof item === 'object' && typeof item.name === 'string') : []
    return { version: 1, items }
  } catch {
    return { version: 1, items: [] }
  }
}

/**
 * Write the manifest atomically.
 * @param {string} dir - the chapter's attachment directory.
 * @param {{ version: number, items: object[] }} manifest - the value.
 * @returns {Promise<void>} completion.
 */
async function writeManifest(dir, manifest) {
  const path = join(dir, 'manifest.json')
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await copyFile(temporary, path)
  await unlink(temporary).catch(() => {})
}

/**
 * List one chapter's attachments, including files the manifest does not know
 * about yet (a copy interrupted before the manifest write).
 * @param {string} libraryDir - the library root.
 * @param {string} book - book id.
 * @param {string} code - chapter code.
 * @returns {Promise<{ dir: string, items: object[] }>} the manifest items.
 */
export async function listAttachments(libraryDir, book, code) {
  const dir = attachmentsDir(libraryDir, book, code)
  const manifest = await readManifest(dir)
  const known = new Set(manifest.items.map(item => item.name))
  const names = await readdir(dir).catch(() => [])
  const extra = []
  for (const name of names) {
    if (name === 'manifest.json' || known.has(name)) continue
    const info = await stat(join(dir, name)).catch(() => null)
    if (info === null || !info.isFile()) continue
    const extension = extname(name).slice(1).toLowerCase()
    if (ATTACHMENT_KINDS[extension] === undefined) continue
    extra.push({ name, kind: ATTACHMENT_KINDS[extension], bytes: info.size, addedAt: info.mtimeMs })
  }
  return { dir, items: [...manifest.items, ...extra] }
}

/**
 * Copy one local file into the chapter's attachments.
 * @param {{ libraryDir: string, book: string, code: string, sourcePath: string, name?: string }} options - the library, chapter and source.
 * @returns {Promise<{ name: string, kind: string, bytes: number, addedAt: number }>} the stored item.
 */
export async function addAttachment(options) {
  const extension = extname(String(options.sourcePath ?? '')).slice(1).toLowerCase()
  const kind = ATTACHMENT_KINDS[extension]
  if (kind === undefined) throw Object.assign(new Error('只支持 PDF 与图片附件'), { code: 'bad-type' })
  const info = await stat(options.sourcePath)
  if (!info.isFile()) throw Object.assign(new Error('附件必须是文件'), { code: 'not-file' })
  if (info.size > MAX_ATTACHMENT_BYTES) throw Object.assign(new Error('附件超过 50 MB'), { code: 'too-large' })
  const dir = attachmentsDir(options.libraryDir, options.book, options.code)
  await mkdir(dir, { recursive: true })
  const manifest = await readManifest(dir)
  const wanted = safeAttachmentName(options.name ?? options.sourcePath)
  const stem = wanted.slice(0, Math.max(1, wanted.length - extension.length - 1))
  let name = wanted
  let counter = 0
  const taken = new Set([...manifest.items.map(item => item.name), 'manifest.json'])
  while (taken.has(name)) {
    counter += 1
    name = `${stem}-${counter}.${extension}`
  }
  await copyFile(options.sourcePath, join(dir, name))
  const item = { name, kind, bytes: info.size, addedAt: Date.now() }
  manifest.items.push(item)
  await writeManifest(dir, manifest)
  return item
}

/**
 * Delete one attachment and drop it from the manifest.
 * @param {{ libraryDir: string, book: string, code: string, name: string }} options - the library, chapter and file.
 * @returns {Promise<{ removed: boolean }>} whether a file was deleted.
 */
export async function removeAttachment(options) {
  const dir = attachmentsDir(options.libraryDir, options.book, options.code)
  const name = safeAttachmentName(options.name)
  const manifest = await readManifest(dir)
  const index = manifest.items.findIndex(item => item.name === name)
  if (index >= 0) manifest.items.splice(index, 1)
  const result = await unlink(join(dir, name)).then(() => true).catch(() => false)
  if (index >= 0 || result) await writeManifest(dir, manifest)
  return { removed: result || index >= 0 }
}
