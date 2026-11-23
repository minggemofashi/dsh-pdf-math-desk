/**
 * Import a user-supplied PDF archive into one library folder. The archive is
 * read in memory (store/deflate), every entry is path-checked, and name clashes
 * follow the same merge/overwrite/skip policy as the migration import.
 * @module dsh-pdf-workbench/book-import
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { readZip, safeZipName } from './zip.js'

/** Per-file ceiling for a book PDF. */
export const MAX_BOOK_PDF_BYTES = 2 * 1024 * 1024 * 1024
/** Total uncompressed ceiling for one archive. */
export const MAX_BOOK_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024

/**
 * Pick a free file name by appending `-1`, `-2`, ...
 * @param {string} dir - destination folder.
 * @param {string} name - wanted base name.
 * @returns {Promise<string>} an unused name.
 */
async function freeName(dir, name) {
  const extension = extname(name)
  const stem = extension === '' ? name : name.slice(0, -extension.length)
  let candidate = name
  let counter = 0
  while (await stat(join(dir, candidate)).catch(() => null) !== null) {
    counter += 1
    candidate = `${stem}-${counter}${extension}`
    if (counter > 999) throw new Error(`同名文件太多：${name}`)
  }
  return candidate
}

/**
 * Import PDFs from a ZIP into `targetDir`.
 * @param {{ archivePath: string, targetDir: string, strategy?: 'merge'|'overwrite'|'skip' }} options - source, destination and conflict policy.
 * @returns {Promise<{ targetDir: string, imported: string[], renamed: string[], skipped: string[], warnings: string[] }>} the report.
 */
export async function importBookArchive(options) {
  const strategy = options.strategy === 'overwrite' || options.strategy === 'skip' ? options.strategy : 'merge'
  const bytes = await readFile(options.archivePath)
  const entries = readZip(bytes)
  const targetDir = options.targetDir
  await mkdir(targetDir, { recursive: true })
  const report = { targetDir, imported: [], renamed: [], skipped: [], warnings: [] }
  let total = 0
  for (const [name, data] of entries) {
    const safe = safeZipName(name)
    if (extname(safe).toLowerCase() !== '.pdf') {
      report.warnings.push(`跳过非 PDF：${safe}`)
      continue
    }
    if (data.length > MAX_BOOK_PDF_BYTES) {
      report.warnings.push(`文件过大：${safe}`)
      continue
    }
    total += data.length
    if (total > MAX_BOOK_ARCHIVE_BYTES) {
      report.warnings.push('压缩包总大小超过 4 GB，剩余文件未导入')
      break
    }
    const wanted = basename(safe)
    const target = join(targetDir, wanted)
    const exists = await stat(target).catch(() => null)
    if (exists !== null && strategy === 'skip') {
      report.skipped.push(wanted)
      continue
    }
    if (exists !== null && strategy === 'merge') {
      const alternative = await freeName(targetDir, wanted)
      await writeFile(join(targetDir, alternative), data)
      report.renamed.push(`${wanted} → ${alternative}`)
      continue
    }
    await writeFile(target, data)
    report.imported.push(wanted)
  }
  return report
}

/**
 * List the PDFs already in a folder (used by the UI to show a target summary).
 * @param {string} dir - folder.
 * @returns {Promise<number>} count of PDFs.
 */
export async function countPdfs(dir) {
  const names = await readdir(dir).catch(() => [])
  let count = 0
  for (const name of names) {
    if (extname(name).toLowerCase() !== '.pdf') continue
    const info = await stat(join(dir, name)).catch(() => null)
    if (info !== null && info.isFile()) count += 1
  }
  return count
}
