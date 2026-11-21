/**
 * Render one Markdown artifact to PDF with the bundled `tools/md2tex.py`.
 * The tool is optional: it needs Python and XeLaTeX, and the route reports a
 * readable error when either is missing instead of touching the runtime.
 *
 * The child process is spawned with `stdio: 'ignore'`: under the DSH sandbox
 * piped stdio is denied, and the result is proven by the output file anyway.
 * @module dsh-pdf-math-desk/render
 */
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'

const PYTHON_CANDIDATES = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)

function run(python, args, env) {
  return new Promise((resolve, reject) => {
    execFile(python, args, { timeout: 180000, windowsHide: true, stdio: 'ignore', env: { ...process.env, ...env } }, error => {
      if (error === null) resolve()
      else reject(new Error(`${python}: ${error.message}`))
    })
  })
}

/**
 * @param {string} script - absolute path of `tools/md2tex.py`.
 * @param {string} mdPath - source Markdown.
 * @param {string} outPath - destination PDF.
 * @param {Record<string, string>} [env] - extra environment variables.
 * @returns {Promise<string>} the PDF path.
 */
export async function renderMarkdown(script, mdPath, outPath, env = {}) {
  let lastError = 'no Python found'
  for (const python of PYTHON_CANDIDATES) {
    try {
      await run(python, [script, mdPath, outPath], env)
      await stat(outPath)
      return outPath
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(lastError)
}
