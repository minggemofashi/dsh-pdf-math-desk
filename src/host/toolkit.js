/**
 * The split-toolkit installer.
 *
 * A new computer has no splitting tools, so the workbench ships the same scripts
 * the math library was built with. Starting a split conversation copies them into
 * the library as `<libraryDir>/工具/`, so the conversation can run them from its
 * own workspace.
 *
 * @module dsh-pdf-math-desk/toolkit
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Files installed under `<libraryDir>/工具/`. */
export const TOOLKIT_FILES = [
  'README.md',
  'AGENTS.md',
  'pdfkit.py',
  'auto_chapters.py',
  'rename_chapters.py',
  'dsfile.mjs',
  'py.cmd',
  'node.cmd',
  '规范/00_共同约定.md',
  '规范/01_文本提取.md',
  '规范/02_答疑.md',
  '规范/03_习题解答.md',
  '规范/api提示词_提取.md',
]

/**
 * Copy the toolkit into one library as `<libraryDir>/工具/`, so a split
 * conversation can run the scripts from its own workspace.
 * @param {string} toolsDir - the package's `tools/` directory.
 * @param {string} libraryDir - the library root.
 * @returns {Promise<{ dir: string, copied: number }>} where they went and how many landed.
 */
export async function installToolkit(toolsDir, libraryDir) {
  const target = join(libraryDir, '工具')
  let copied = 0
  for (const relative of TOOLKIT_FILES) {
    const from = join(toolsDir, ...relative.split('/'))
    const to = join(target, ...relative.split('/'))
    try {
      await mkdir(dirname(to), { recursive: true })
      await copyFile(from, to)
      copied += 1
    } catch {
      // An optional file missing from the package is skipped.
    }
  }
  if (copied === 0) throw new Error('工具文件缺失，请重新安装插件')
  return { dir: target, copied }
}
