/**
 * On-demand install of the Typst binary (DEC-0013).
 *
 * The 52 MB executable does not ship in the package: the settings page offers a
 * one-click download into `%LOCALAPPDATA%\dsh-pdf-workbench\typst\`. The archive
 * is pinned to one release and verified by SHA-256 before anything is extracted,
 * and the extracted image is relabelled Medium so a sandboxed workspace's Low
 * integrity label cannot follow it (a Low process cannot write Medium folders).
 *
 * @module dsh-pdf-workbench/typst-install
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const TYPST_VERSION = '0.15.1'
export const TYPST_ARCHIVE = 'typst-x86_64-pc-windows-msvc.zip'
export const TYPST_URL = `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${TYPST_ARCHIVE}`
export const TYPST_SHA256 = '19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736'

/** The directory engine.js also searches: `<LOCALAPPDATA>\dsh-pdf-workbench\typst`. */
export function installDir() {
  const base = String(process.env.LOCALAPPDATA ?? '').trim()
  return base === '' ? join(homedir(), 'AppData', 'Local', 'dsh-pdf-workbench', 'typst') : join(base, 'dsh-pdf-workbench', 'typst')
}

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/** True when a usable typst.exe already sits in the install directory. */
export function installed() {
  return existsSync(join(installDir(), 'typst.exe'))
}

/** Raise a Low integrity label to Medium; best effort on non-Windows hosts. */
function relabel(path) {
  if (process.platform !== 'win32') return
  spawnSync('icacls', [path, '/setintegritylevel', 'Medium'], { windowsHide: true, timeout: 20000 })
}

/** The release zip nests the binary in a folder named after the asset. */
function findBinary(dir, depth) {
  if (depth > 3) return ''
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return ''
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === 'typst.exe') return join(dir, entry.name)
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = findBinary(join(dir, entry.name), depth + 1)
    if (nested !== '') return nested
  }
  return ''
}

/**
 * Download, verify, extract and label Typst. Idempotent: an existing binary wins.
 * @returns {Promise<{ version: string, path: string, reused: boolean }>} the install.
 */
export async function installTypst() {
  if (process.platform !== 'win32') throw fail('unsupported', '按需安装目前只支持 Windows：请手动安装 Typst 并放到 PATH。')
  const dir = installDir()
  const target = join(dir, 'typst.exe')
  if (existsSync(target)) return { version: TYPST_VERSION, path: target, reused: true }
  // A previous attempt may have extracted the archive but failed to move the
  // binary out of the release folder; recover it instead of downloading again.
  const leftover = findBinary(dir, 0)
  if (leftover !== '') {
    if (leftover !== target) {
      renameSync(leftover, target)
      rmSync(dirname(leftover), { recursive: true, force: true })
    }
    relabel(target)
    return { version: TYPST_VERSION, path: target, reused: false }
  }
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, TYPST_ARCHIVE)
  const partial = `${archive}.part`
  try {
    let bytes
    try {
      const response = await fetch(TYPST_URL, { redirect: 'follow' })
      if (!response.ok) throw fail('download-failed', `下载失败：HTTP ${response.status}`)
      bytes = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (error !== null && error !== undefined && error.code === 'download-failed') throw error
      throw fail('download-failed', `下载失败：${String(error && error.message ? error.message : error)}`)
    }
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== TYPST_SHA256) throw fail('checksum-failed', '下载内容校验失败，已放弃安装')
    writeFileSync(partial, bytes)
    renameSync(partial, archive)
    spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${dir}' -Force`], {
      windowsHide: true, timeout: 120000,
    })
    if (!existsSync(target)) {
      const found = findBinary(dir, 0)
      if (found === '') throw fail('extract-failed', '压缩包解压后没有找到 typst.exe')
      if (found !== target) {
        renameSync(found, target)
        rmSync(dirname(found), { recursive: true, force: true })
      }
    }
    relabel(target)
    const size = statSync(target).size
    if (size < 1024 * 1024) throw fail('extract-failed', `typst.exe 体积异常（${size} 字节）`)
    return { version: TYPST_VERSION, path: target, reused: false }
  } finally {
    rmSync(partial, { force: true })
    rmSync(archive, { force: true })
  }
}

/** The binary's reported version, or '' when it cannot run. */
export function probeVersion(binary) {
  if (binary === '' || !existsSync(binary)) return ''
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const match = text.match(/\d+\.\d+\.\d+/)
  return match === null ? '' : match[0]
}

