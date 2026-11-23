/**
 * The optional Chinese handwriting face (Xiaolai). It used to ship inside the
 * plugin (22 MB); it now lives in the user's data directory and is installed on
 * demand from the settings page, either by download or by picking a local file.
 * When it is absent the CSS falls back to the system Kai fonts.
 * @module dsh-pdf-workbench/fonts
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Stable file name so the browser font URL never has to change. */
export const FONT_FILE = 'Xiaolai-Regular.ttf'

/** Sanity bounds for an installed handwriting font. */
export const MIN_FONT_BYTES = 1024 * 1024
export const MAX_FONT_BYTES = 60 * 1024 * 1024

/** Where the font is downloaded from (release asset, optional). */
export const FONT_DOWNLOAD_URL = 'https://github.com/minggemofashi/dsh-pdf-workbench/releases/latest/download/Xiaolai-Regular.ttf'

/**
 * @param {string} dataDir - the plugin data directory (`~/.dsh/pdfdesk`).
 * @returns {string} the font directory.
 */
export function fontDir(dataDir) {
  return join(dataDir, 'fonts')
}

/**
 * @param {string} dataDir - the plugin data directory.
 * @returns {string} the installed font path.
 */
export function fontPath(dataDir) {
  return join(fontDir(dataDir), FONT_FILE)
}

/**
 * @param {string} dataDir - the plugin data directory.
 * @returns {Promise<{ installed: boolean, bytes: number }>} font state.
 */
export async function fontStatus(dataDir) {
  const info = await stat(fontPath(dataDir)).catch(() => null)
  return info !== null && info.isFile() ? { installed: true, bytes: info.size } : { installed: false, bytes: 0 }
}

/**
 * TrueType/OpenType signature check: `00 01 00 00`, `true`, `ttcf` or `OTTO`.
 * @param {Buffer} bytes - candidate file.
 * @returns {boolean} whether it looks like a font.
 */
export function looksLikeFont(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return false
  const tag = bytes.subarray(0, 4).toString('latin1')
  return tag === 'true' || tag === 'ttcf' || tag === 'OTTO' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
}

/**
 * Install font bytes atomically.
 * @param {{ dataDir: string, bytes: Buffer }} options - destination and payload.
 * @returns {Promise<{ installed: boolean, bytes: number }>} the new state.
 */
export async function installFont(options) {
  const bytes = options.bytes
  if (!Buffer.isBuffer(bytes) || bytes.length < MIN_FONT_BYTES) {
    throw Object.assign(new Error('字体文件太小或不是字体'), { code: 'bad-font' })
  }
  if (bytes.length > MAX_FONT_BYTES) {
    throw Object.assign(new Error('字体文件超过 60 MB'), { code: 'too-large' })
  }
  if (!looksLikeFont(bytes)) {
    throw Object.assign(new Error('不是有效的 TTF/OTF 字体'), { code: 'bad-font' })
  }
  const dir = fontDir(options.dataDir)
  await mkdir(dir, { recursive: true })
  const target = fontPath(options.dataDir)
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, bytes)
  await rename(temporary, target)
  return { installed: true, bytes: bytes.length }
}

/**
 * Read the installed font bytes, or null.
 * @param {string} dataDir - the plugin data directory.
 * @returns {Promise<Buffer | null>} the bytes.
 */
export async function readFont(dataDir) {
  return readFile(fontPath(dataDir)).catch(() => null)
}

/**
 * Delete the installed font.
 * @param {string} dataDir - the plugin data directory.
 * @returns {Promise<{ removed: boolean }>} whether a file was deleted.
 */
export async function removeFont(dataDir) {
  const info = await stat(fontPath(dataDir)).catch(() => null)
  if (info === null) return { removed: false }
  await rm(fontPath(dataDir), { force: true })
  return { removed: true }
}

/**
 * Download the release asset and install it.
 * @param {{ dataDir: string, url?: string, fetchImpl?: Function }} options - destination, source and injectable fetch.
 * @returns {Promise<{ installed: boolean, bytes: number }>} the new state.
 */
export async function downloadFont(options) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : globalThis.fetch
  if (typeof fetchImpl !== 'function') throw Object.assign(new Error('当前运行时不支持下载'), { code: 'no-fetch' })
  const url = typeof options.url === 'string' && options.url !== '' ? options.url : FONT_DOWNLOAD_URL
  const response = await fetchImpl(url)
  if (response === null || response === undefined || response.ok !== true) {
    throw Object.assign(new Error(`下载字体失败（HTTP ${response === undefined ? '?' : response.status}）`), { code: 'download-failed' })
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return installFont({ dataDir: options.dataDir, bytes })
}
