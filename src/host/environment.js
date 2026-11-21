/**
 * Detect the optional typesetting environment once per bootstrap.
 *
 * The plugin never installs TeX or Python: Markdown-to-PDF is an optional
 * feature, so the browser hides its buttons until both are present.
 * @module dsh-pdf-math-desk/environment
 */
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

/** Where TinyTeX/TeX Live commonly land when not on PATH. */
const TEX_DIRS = [
  'C:\\texlive\\2025\\bin\\windows',
  'C:\\texlive\\2024\\bin\\windows',
  'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'),
]

function onPath(names, extraDirs = []) {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...extraDirs].filter(Boolean)
  for (const dir of dirs) {
    for (const name of names) {
      try {
        accessSync(join(dir, name), constants.X_OK)
        return true
      } catch {
        // try the next candidate
      }
    }
  }
  return false
}

/**
 * @returns {{ python: boolean, tex: boolean }} which optional tools exist.
 */
export function detectEnvironment() {
  return {
    python: onPath(['python.exe', 'python', 'py.exe', 'py']),
    tex: onPath(['xelatex.exe', 'xelatex'], TEX_DIRS),
  }
}
