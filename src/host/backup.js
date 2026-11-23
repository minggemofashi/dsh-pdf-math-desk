/**
 * Data-migration backup: collect a staging tree, describe it in `manifest.json`
 * with checksums, and pack/unpack it as a ZIP. The archive never contains book
 * PDFs or credentials; the caller decides which sources are copied in.
 * @module dsh-pdf-workbench/backup
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { readZip, safeZipName, writeZip } from './zip.js'

/** Version of the manifest schema. */
export const BACKUP_FORMAT = 1

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
 * @param {{ root: string, meta?: object }} options - staging root and extra fields (plugin version, machine, included items).
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
    format: BACKUP_FORMAT,
    createdAt: Date.now(),
    ...(options.meta === undefined ? {} : options.meta),
    files,
  }
  await mkdir(options.root, { recursive: true })
  await writeFile(join(options.root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

/**
 * Pack a staging tree into a ZIP, manifest first.
 * @param {{ root: string, outPath: string, compress?: boolean, meta?: object }} options - source tree and destination.
 * @returns {Promise<{ outPath: string, bytes: number, files: number }>} the archive.
 */
export async function packDirectory(options) {
  const manifest = await buildManifest({ root: options.root, meta: options.meta })
  const entries = [{ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8') }]
  for (const file of manifest.files) {
    entries.push({ name: file.path, data: await readFile(join(options.root, file.path)) })
  }
  const bytes = writeZip({ entries, compress: options.compress !== false })
  await mkdir(dirname(options.outPath), { recursive: true })
  const temporary = `${options.outPath}.${process.pid}.tmp`
  await writeFile(temporary, bytes)
  await rename(temporary, options.outPath)
  return { outPath: options.outPath, bytes: bytes.length, files: entries.length }
}

/**
 * Read a backup archive and verify every checksum before the caller touches it.
 * @param {string} archivePath - zip path.
 * @returns {Promise<{ manifest: object, entries: Map<string, Buffer> }>} verified content.
 */
export async function readBackup(archivePath) {
  const bytes = await readFile(archivePath)
  const entries = readZip(bytes)
  const manifestBytes = entries.get('manifest.json')
  if (manifestBytes === undefined) throw new Error('迁移包缺少 manifest.json')
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    throw new Error('迁移包的 manifest.json 不是有效 JSON')
  }
  if (manifest === null || typeof manifest !== 'object' || manifest.format !== BACKUP_FORMAT) {
    throw new Error(`不支持的迁移包版本：${manifest === null ? '?' : manifest.format}`)
  }
  if (!Array.isArray(manifest.files)) throw new Error('迁移包 manifest 缺少文件清单')
  const problems = []
  for (const file of manifest.files) {
    const name = safeZipName(file.path)
    const data = entries.get(name)
    if (data === undefined) {
      problems.push(`缺少文件：${name}`)
      continue
    }
    const actual = sha256(data)
    if (file.sha256 !== undefined && actual !== file.sha256) problems.push(`校验失败：${name}`)
    if (file.bytes !== undefined && data.length !== file.bytes) problems.push(`大小不符：${name}`)
  }
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
