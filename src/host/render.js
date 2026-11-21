/**
 * Render one Markdown artifact to PDF with the bundled `tools/md2tex.py`.
 * The tool is optional: it needs Python and XeLaTeX, and the route reports a
 * readable error when either is missing instead of touching the runtime.
 * @module dsh-pdf-math-desk/render
 */
import { execFile } from 'node:child_process'

const PYTHON_CANDIDATES = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)

function run(python, args) {
  return new Promise((resolve, reject) => {
    execFile(python, args, { timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) resolve(String(stdout))
      else reject(new Error(String(stderr || error.message).slice(-800)))
    })
  })
}

/**
 * @param {string} script - absolute path of `tools/md2tex.py`.
 * @param {string} mdPath - source Markdown.
 * @param {string} outPath - destination PDF.
 * @returns {Promise<string>} the PDF path.
 */
export async function renderMarkdown(script, mdPath, outPath) {
  let lastError = 'no Python found'
  for (const python of PYTHON_CANDIDATES) {
    try {
      await run(python, [script, mdPath, outPath])
      return outPath
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  throw new Error(lastError)
}
