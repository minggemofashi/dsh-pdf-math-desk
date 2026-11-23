/**
 * PPT/PPTX → PDF for chapter attachments. Windows with PowerPoint uses COM
 * (keeps theme fonts and animations flattened as PowerPoint does); other
 * machines fall back to LibreOffice. Both paths are optional: when neither
 * exists the caller gets a clear `no-converter` error instead of a half-copied
 * file.
 * @module dsh-pdf-workbench/ppt
 */

import { execFile } from 'node:child_process'
import { stat, readdir, rename, rm } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'

/** Extensions this module can convert. */
export const PPT_EXTENSIONS = new Set(['ppt', 'pptx'])

/**
 * @param {string} source - a file path.
 * @returns {boolean} whether it is a presentation this module handles.
 */
export function isPptPath(source) {
  return PPT_EXTENSIONS.has(extname(String(source ?? '')).slice(1).toLowerCase())
}

/**
 * Run one executable and resolve stdout.
 * @param {string} command - executable.
 * @param {string[]} args - arguments.
 * @returns {Promise<string>} stdout.
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 180000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error === null) resolve(stdout)
      else reject(error)
    })
  })
}

/**
 * The PowerShell that drives PowerPoint's COM automation. `SaveAs(..., 32)` is
 * `ppSaveAsPDF`; the presentation opens without a window.
 * @param {string} source - absolute ppt/pptx path.
 * @param {string} outPath - absolute pdf path.
 * @returns {string} the script.
 */
export function powerPointScript(source, outPath) {
  const quote = value => `'${String(value).replace(/'/g, "''")}'`
  return [
    "$ErrorActionPreference = 'Stop'",
    '$app = New-Object -ComObject PowerPoint.Application',
    'try {',
    `  $pres = $app.Presentations.Open(${quote(source)}, $true, $false, $false)`,
    '  try {',
    `    $pres.SaveAs(${quote(outPath)}, 32)`,
    '  } finally {',
    '    $pres.Close()',
    '  }',
    '} finally {',
    '  $app.Quit()',
    '}',
  ].join('\n')
}

/**
 * PowerPoint through COM (Windows only).
 * @param {string} source - ppt/pptx path.
 * @param {string} outPath - target pdf path.
 * @returns {Promise<void>} completion.
 */
export async function convertWithPowerPoint(source, outPath) {
  await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', powerPointScript(source, outPath)])
}

/**
 * LibreOffice fallback: convert into a private folder, then move the produced
 * pdf to the caller's exact path.
 * @param {string} source - ppt/pptx path.
 * @param {string} outPath - target pdf path.
 * @returns {Promise<void>} completion.
 */
export async function convertWithLibreOffice(source, outPath) {
  const work = await mkdtemp(join(tmpdir(), 'pdfdesk-ppt-'))
  try {
    const binaries = process.platform === 'win32' ? ['soffice.exe', 'soffice'] : ['soffice', 'libreoffice']
    let lastError = null
    for (const binary of binaries) {
      try {
        await runCommand(binary, ['--headless', '--convert-to', 'pdf', '--outdir', work, source])
        lastError = null
        break
      } catch (error) {
        lastError = error
      }
    }
    if (lastError !== null) throw lastError
    const produced = (await readdir(work)).find(name => extname(name).toLowerCase() === '.pdf')
    if (produced === undefined) throw new Error('LibreOffice 没有生成 PDF')
    await rename(join(work, produced), outPath)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/**
 * The converters to try, in order, for this platform.
 * @param {string} [platform] - Node platform string.
 * @returns {Function[]} converter functions.
 */
export function defaultConverters(platform = process.platform) {
  return platform === 'win32'
    ? [convertWithPowerPoint, convertWithLibreOffice]
    : [convertWithLibreOffice]
}

/**
 * Convert one presentation and verify a non-empty PDF appeared.
 * @param {{ source: string, outPath: string, converters?: Function[] }} options - input, output and optional converter chain.
 * @returns {Promise<{ outPath: string, bytes: number }>} the produced pdf.
 */
export async function convertPptToPdf(options) {
  const source = String(options.source ?? '')
  const outPath = String(options.outPath ?? '')
  if (!isPptPath(source)) throw Object.assign(new Error('只支持 .ppt / .pptx'), { code: 'bad-type' })
  if (outPath === '' || dirname(outPath) === '') throw Object.assign(new Error('缺少输出路径'), { code: 'bad-output' })
  const converters = Array.isArray(options.converters) ? options.converters : defaultConverters()
  const failures = []
  for (const convert of converters) {
    try {
      await convert(source, outPath)
      const info = await stat(outPath).catch(() => null)
      if (info !== null && info.isFile() && info.size > 0) return { outPath, bytes: info.size }
      failures.push('未生成有效 PDF')
    } catch (error) {
      failures.push(String(error && error.message ? error.message : error).split('\n')[0])
    }
    await rm(outPath, { force: true }).catch(() => {})
  }
  throw Object.assign(new Error(`PPT 转 PDF 失败：${failures.join('；') || '没有可用的转换器'}`), { code: 'no-converter' })
}

/**
 * The default output name for a converted presentation.
 * @param {string} name - original file name.
 * @returns {string} `<stem>.pdf`.
 */
export function pdfNameForPpt(name) {
  const base = basename(String(name ?? ''))
  const extension = extname(base)
  return `${extension === '' ? base : base.slice(0, -extension.length)}.pdf`
}
