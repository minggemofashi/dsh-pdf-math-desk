/**
 * Resolved plugin paths.
 *
 * Everything the plugin reads or writes is named here once, so the routes and
 * the state store never assemble paths themselves. `libraryDir` comes from the
 * bundle patch (or the user's patch layer); the rest derives from it.
 *
 * @module dsh-pdf-math-desk/config
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This module's folder, so the shipped vendor files resolve in a link install. */
const HERE = dirname(fileURLToPath(import.meta.url))

/** The package version, read once for the update check. */
export const PLUGIN_VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? '0.0.0')
  } catch {
    return '0.0.0'
  }
})()

/** Default split-library root when the bundle patch names none (a fresh install). */
export const DEFAULT_LIBRARY_DIR = join(homedir(), '数学书库')

/** Folder under the library root that holds the chapter-split PDFs. */
const FRAGMENT_FOLDER = '分片'

/** Folder under the library root that holds the per-chapter produced files. */
const ARTIFACT_FOLDER = '产物'

/** Folder under the library root where the user drops book cover images. */
const COVER_FOLDER = '封面'

/** Index file name under the library root. */
const INDEX_FILE = '索引.json'

/** Plugin data folder name under `$DSH_HOME`. */
const DATA_FOLDER = 'mathdesk'

/** Share of a session's context window at which "New" starts a continuation. */
export const DEFAULT_RESUME_RATIO = 0.85

/**
 * Expand a leading `~` to the user's home directory.
 * @param {string} value - user-supplied path.
 * @returns {string} the expanded path.
 */
function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

/**
 * Read one optional string config field.
 * @param {Record<string, unknown>} source - raw config mapping.
 * @param {string} key - field name.
 * @returns {string | undefined} the trimmed value, or undefined when absent.
 */
function textField(source, key) {
  const value = source[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Resolve every path the plugin uses.
 * @param {unknown} rawConfig - the Loader row's `config` value.
 * @returns {{ libraryDir: string, fragmentDir: string, artifactDir: string, coverDir: string, indexPath: string, dataDir: string, vendorDir: string, toolsDir: string, resumeRatio: number, statePath: string, pendingPath: string, linksPath: string, pressurePath: string, librariesPath: string }} resolved paths.
 */
export function resolveConfig(rawConfig) {
  const source = rawConfig !== null && typeof rawConfig === 'object' ? rawConfig : {}
  const libraryDir = resolve(expandHome(textField(source, 'libraryDir') ?? DEFAULT_LIBRARY_DIR))
  const fragmentDir = resolve(expandHome(textField(source, 'fragmentDir') ?? join(libraryDir, FRAGMENT_FOLDER)))
  const artifactDir = resolve(expandHome(textField(source, 'artifactDir') ?? join(libraryDir, ARTIFACT_FOLDER)))
  const coverDir = resolve(expandHome(textField(source, 'coverDir') ?? join(libraryDir, COVER_FOLDER)))
  const indexPath = resolve(expandHome(textField(source, 'indexPath') ?? join(libraryDir, INDEX_FILE)))
  const dshHome = textField(source, 'dshHome') ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const dataDir = resolve(expandHome(textField(source, 'dataDir') ?? join(dshHome, DATA_FOLDER)))
  // The reader's pdf.js build ships inside this package, next to `src/`.
  const vendorDir = resolve(expandHome(textField(source, 'vendorDir') ?? join(HERE, '..', '..', 'vendor')))
  const toolsDir = resolve(expandHome(textField(source, 'toolsDir') ?? join(HERE, '..', '..', 'tools')))
  const ratio = Number(source.resumeRatio)
  const resumeRatio = Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : DEFAULT_RESUME_RATIO
  return {
    libraryDir,
    fragmentDir,
    artifactDir,
    coverDir,
    indexPath,
    dataDir,
    vendorDir,
    toolsDir,
    resumeRatio,
    statePath: join(dataDir, 'state.json'),
    pendingPath: join(dataDir, 'pending.json'),
    linksPath: join(dataDir, 'links.json'),
    pressurePath: join(dataDir, 'pressure.json'),
    librariesPath: join(dataDir, 'libraries.json'),
  }
}
