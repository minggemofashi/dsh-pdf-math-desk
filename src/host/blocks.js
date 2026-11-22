/**
 * Read one PDF page's layout blocks with PyMuPDF.
 *
 * pdf.js gives text items only; PyMuPDF already groups them into paragraph
 * blocks and reports span sizes, which is what the paragraph/heading/formula
 * boxes need.
 * @module dsh-pdf-workbench/blocks
 */
import { execFile } from 'node:child_process'

const PYTHONS = [process.env.MATH_DESK_PYTHON, 'python', 'py'].filter(Boolean)

function runPython(script, args) {
  return new Promise((resolve, reject) => {
    const tryNext = index => {
      if (index >= PYTHONS.length) {
        reject(new Error('没有可用的 Python'))
        return
      }
      execFile(
        PYTHONS[index],
        [script, ...args],
        { timeout: 60000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => {
          if (error === null) resolve(stdout)
          else if (index + 1 < PYTHONS.length) tryNext(index + 1)
          else reject(new Error(`${PYTHONS[index]}: ${error.message}`))
        }
      )
    }
    tryNext(0)
  })
}

/**
 * @param {{ script: string, source: string, pageIndex: number }} options - block reader script and page.
 * @returns {Promise<object[]>} blocks with normalized bbox, kind and text.
 */
export async function readPageBlocks(options) {
  const output = await runPython(options.script, [options.source, String(options.pageIndex)])
  const parsed = JSON.parse(output)
  if (!Array.isArray(parsed)) throw new Error('块解析返回格式不对')
  return parsed
}
