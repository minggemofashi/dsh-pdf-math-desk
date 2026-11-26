/**
 * Which typesetting kernel the workbench uses for the translation products.
 *
 * v1.5 D replaced the LaTeX overlay/reading kernels with Typst. The engine is
 * resolved once per Host start: an explicit `MATH_DESK_TYPST` (or a copy under
 * `tools/typst/`, or `typst` on PATH) enables Typst when both Typst scripts are
 * present; otherwise the LaTeX kernels stay in charge so the plugin still works
 * on a machine without Typst. `MATH_DESK_ENGINE=latex` forces the old path.
 *
 * @module dsh-pdf-workbench/engine
 */
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { probeVersion } from './typst-install.js'

const TYPST_NAMES = ['typst.exe', 'typst']

function onPath(name) {
  for (const entry of String(process.env.PATH ?? '').split(delimiter)) {
    const dir = entry.trim()
    if (dir === '') continue
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/** Absolute path to a Typst executable, or '' when none is installed. */
export function findTypst(toolsDir) {
  return locateTypst(toolsDir).path
}

/**
 * Where the binary came from, so the settings page can explain a fallback.
 * @param {string} toolsDir - absolute path of the bundled `tools/`.
 * @returns {{ path: string, source: 'env'|'tools'|'local'|'path'|'' }} the chosen copy.
 */
export function locateTypst(toolsDir) {
  const explicit = String(process.env.MATH_DESK_TYPST ?? '').trim()
  if (explicit !== '' && existsSync(explicit)) return { path: explicit, source: 'env' }
  for (const name of TYPST_NAMES) {
    const local = join(toolsDir, 'typst', name)
    if (existsSync(local)) return { path: local, source: 'tools' }
  }
  // A per-user install keeps the 52 MB binary out of the plugin package; this is
  // where a manual/on-demand install is expected to land.
  const localAppData = String(process.env.LOCALAPPDATA ?? '').trim()
  if (localAppData !== '') {
    for (const name of TYPST_NAMES) {
      const perUser = join(localAppData, 'dsh-pdf-workbench', 'typst', name)
      if (existsSync(perUser)) return { path: perUser, source: 'local' }
    }
  }
  for (const name of TYPST_NAMES) {
    const found = onPath(name)
    if (found !== '') return { path: found, source: 'path' }
  }
  return { path: '', source: '' }
}

/**
 * Resolve the engine and the two scripts that belong to it.
 * @param {string} toolsDir - absolute path of the bundled `tools/`.
 * @returns {{ engine: 'typst'|'latex', typst: string, overlayScript: string, readingScript: string, overlayName: string, env: Record<string,string> }} the choice.
 */
export function resolveTypeset(toolsDir) {
  const requested = String(process.env.MATH_DESK_ENGINE ?? 'auto').trim().toLowerCase()
  const found = locateTypst(toolsDir)
  const typst = found.path
  const typstReady = typst !== ''
    && existsSync(join(toolsDir, 'md2overlay_typst.py'))
    && existsSync(join(toolsDir, 'md2typst.py'))
  const useTypst = typstReady && requested !== 'latex'
  return {
    engine: useTypst ? 'typst' : 'latex',
    typst: useTypst ? typst : '',
    typstVersion: useTypst ? probeVersion(typst) : '',
    // Why Typst is not in charge, for the settings row: forced, missing, or the
    // bundled scripts are absent (an old package).
    typstSource: useTypst ? found.source : requested === 'latex' ? 'forced' : typst === '' ? 'missing' : 'incomplete',
    overlayScript: join(toolsDir, useTypst ? 'md2overlay_typst.py' : 'md2overlay.py'),
    readingScript: join(toolsDir, useTypst ? 'md2typst.py' : 'md2tex.py'),
    overlayName: useTypst ? 'md2overlay_typst.py' : 'md2overlay.py',
    // The Python tools resolve Typst themselves; a copy far from tools/typst
    // (for example the tests' .dsh-scratch install) is handed over explicitly.
    env: useTypst ? { MATH_DESK_TYPST: typst } : {},
  }
}
