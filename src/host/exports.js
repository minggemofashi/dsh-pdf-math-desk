/**
 * Packaging history and background packing jobs.
 *
 * A migration package of a real profile is large (sessions dominate: ~120 MB
 * here), so packing takes long enough that a synchronous request can be cut by
 * the page/transport timeout. Packing therefore runs as a background job: the
 * click returns immediately and the settings page polls the job list, then the
 * finished archive shows up in the history.
 *
 * History is derived from the folder rather than kept in a side file: the
 * backup folder already holds exactly what exists, so a package moved or
 * deleted by the user disappears from the list without a stale record, and
 * nothing has to be excluded from a migration package (that package never
 * includes the plugin backup folder).
 *
 * @module dsh-pdf-workbench/exports
 */
import { spawn } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Both package prefixes, and nothing else, count as history. The library name
 *  (when present) sits between the prefix and the timestamp. */
const EXPORT_NAME = /^(?:dsh-workbench-backup|(library-export|pdf-pack)(?:-[^/\\:*?"<>|]+?)?)-\d{8}-\d{6}\.zip$/

/** At most this many finished jobs stay in the in-memory list. */
const MAX_JOBS = 20

/** In-memory packing jobs; they do not survive a Host restart. */
const jobs = new Map()

/**
 * Whether a name is one of this plugin's packages.
 * @param {string} name - file name.
 * @returns {boolean} true for a migration backup, library export or PDF pack.
 */
export function isExportName(name) {
  return EXPORT_NAME.test(String(name))
}

/**
 * Split a package name into kind, library label and timestamp.
 * @param {string} name - file name.
 * @returns {{ kind: 'backup' | 'library-export' | 'pdf-pack', library: string }} the label.
 */
export function describeExportName(name) {
  const value = String(name)
  if (/^pdf-pack-/.test(value)) {
    const match = /^pdf-pack-(.+?)-\d{8}-\d{6}\.zip$/.exec(value)
    return { kind: 'pdf-pack', library: match === null ? '' : match[1] }
  }
  if (/^library-export-/.test(value)) {
    const match = /^library-export-(.+?)-\d{8}-\d{6}\.zip$/.exec(value)
    return { kind: 'library-export', library: match === null ? '' : match[1] }
  }
  return { kind: 'backup', library: '' }
}

/**
 * The packages that currently exist in `<dataDir>/backup`, newest first.
 * @param {string} dataDir - the plugin data folder.
 * @returns {Promise<Array<{ name: string, kind: 'backup' | 'library-export', bytes: number, createdAt: number, path: string }>>} the records.
 */
export async function listExports(dataDir) {
  const dir = join(dataDir, 'backup')
  const names = await readdir(dir).catch(() => [])
  const items = []
  for (const name of names) {
    if (!isExportName(name)) continue
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info === null || !info.isFile()) continue
    items.push({
      name,
      ...describeExportName(name),
      bytes: info.size,
      createdAt: info.mtimeMs,
      path,
    })
  }
  items.sort((left, right) => (right.createdAt - left.createdAt) || right.name.localeCompare(left.name))
  return items
}

/**
 * Start one packing job. Only one runs at a time: two 100 MB archives at once
 * would fight over the same disk for no gain.
 * @param {'backup' | 'library-export'} kind - what is being packed.
 * @param {() => Promise<object>} run - the packing work; its result is kept on the job.
 * @returns {{ id: string, kind: string, status: 'running' | 'done' | 'error', startedAt: number, finishedAt: number, result: object | null, error: string | null }} the job (mutated as it runs).
 */
export function startExportJob(kind, run) {
  if (listJobs().some(job => job.status === 'running')) {
    throw Object.assign(new Error('已有打包任务在进行，请等它完成'), { code: 'busy' })
  }
  const id = `ex-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const job = { id, kind, status: 'running', startedAt: Date.now(), finishedAt: 0, result: null, error: null }
  jobs.set(id, job)
  void (async () => {
    try {
      job.result = await run()
      job.status = 'done'
    } catch (error) {
      job.error = String(error && error.message ? error.message : error)
      job.status = 'error'
    } finally {
      job.finishedAt = Date.now()
      const finished = listJobs().filter(entry => entry.status !== 'running')
      for (const stale of finished.slice(MAX_JOBS)) jobs.delete(stale.id)
    }
  })()
  return job
}

/**
 * @returns {Array<object>} jobs, newest first.
 */
export function listJobs() {
  return [...jobs.values()].sort((left, right) => right.startedAt - left.startedAt)
}

/**
 * Show one file in the OS file manager. The caller validates that the path is
 * inside the plugin's own backup folder.
 * @param {string} path - file to reveal.
 * @param {import('node:child_process').SpawnOptions} [options] - override (tests inject a recorder).
 * @returns {void}
 */
export function revealInFileManager(path) {
  const spawnOptions = { detached: true, stdio: 'ignore', windowsHide: false }
  if (process.platform === 'win32') {
    spawn('explorer.exe', ['/select,', path], spawnOptions).unref()
    return
  }
  if (process.platform === 'darwin') {
    spawn('open', ['-R', path], spawnOptions).unref()
    return
  }
  spawn('xdg-open', [dirname(path)], spawnOptions).unref()
}

/**
 * Open a folder in the OS file manager. Used for the library root, where there
 * is no single file to select.
 * @param {string} path - folder to open.
 * @returns {void}
 */
export function revealDirectory(path) {
  const spawnOptions = { detached: true, stdio: 'ignore', windowsHide: false }
  if (process.platform === 'win32') {
    spawn('explorer.exe', [path], spawnOptions).unref()
    return
  }
  if (process.platform === 'darwin') {
    spawn('open', [path], spawnOptions).unref()
    return
  }
  spawn('xdg-open', [path], spawnOptions).unref()
}
