/**
 * Serve one PDF file with the HTTP semantics pdf.js relies on.
 *
 * The reader used to answer every `/pdfdesk/pdf` request with the whole file,
 * `accept-ranges: none` and `cache-control: no-store`. That has two costs the
 * workbench pays on every open: pdf.js cannot fetch the cross-reference table
 * out of band and cannot reuse bytes the browser already has, and the Host
 * holds a full copy in memory while writing it. The reader and the right-hand
 * preview open the same chapter, so the second open paid the whole price again.
 *
 * This module answers single byte ranges (206), refuses unsatisfiable ones
 * (416), streams from disk, and keeps a strong validator so a re-open costs a
 * `304` instead of the file. `HEAD` answers headers only, like a browser asks
 * before it decides to download.
 *
 * @module dsh-pdf-workbench/pdf-stream
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import { MAX_PDF_BYTES } from './pdf-source.js'

/** One range, possibly open-ended: `bytes=0-1023`, `bytes=500-`, `bytes=-4000`. */
const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/

/** How long a browser may keep a PDF without asking again; it revalidates after. */
const PDF_CACHE_CONTROL = 'private, max-age=0, must-revalidate'

/**
 * Parse one `Range` header against a known file size.
 *
 * A header a server must ignore (several ranges, another unit, garbage) returns
 * `null`, which means "answer with the whole file". A syntactically valid but
 * unsatisfiable range returns `{ unsatisfiable: true }` so the caller can send
 * 416 with the real size, which is what tells a client to stop asking.
 * @param {unknown} header - the `Range` header value.
 * @param {number} size - the file's size in bytes.
 * @returns {{ start: number, end: number } | { unsatisfiable: true } | null} the byte range to send, or why not.
 */
export function parseByteRange(header, size) {
  if (typeof header !== 'string' || size <= 0) return null
  const match = SINGLE_RANGE.exec(header.trim())
  if (match === null) return null
  const fromText = match[1]
  const toText = match[2]
  if (fromText === '' && toText === '') return null
  if (fromText === '') {
    // A suffix range: the last N bytes, which is how pdf.js asks for a trailer.
    const length = Number(toText)
    if (!Number.isFinite(length) || length <= 0) return null
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(fromText)
  if (!Number.isFinite(start)) return null
  if (start >= size) return { unsatisfiable: true }
  const end = toText === '' ? size - 1 : Number(toText)
  if (!Number.isFinite(end) || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

/**
 * A strong validator for one file version: size and modification time.
 * @param {{ size: number, mtimeMs: number }} info - `fs.Stats` (or anything with those fields).
 * @returns {string} a quoted entity tag.
 */
export function fileEtag(info) {
  return `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`
}

/**
 * Whether an `If-None-Match` header names this entity tag.
 * @param {unknown} header - the header value.
 * @param {string} etag - the current entity tag.
 * @returns {boolean} true when the client already has this version.
 */
export function matchesEtag(header, etag) {
  if (typeof header !== 'string' || header === '') return false
  const wanted = header.trim()
  if (wanted === '*') return true
  return wanted.split(',').some(part => part.trim() === etag)
}

/**
 * Pipe one file range to the response, tearing the read down when the client
 * goes away (pdf.js aborts loads on every page-flip in continuous mode).
 * @param {import('node:http').ServerResponse} response - the outbound response.
 * @param {string} path - absolute file path.
 * @param {{ start: number, end: number } | undefined} range - bytes to send, or undefined for all.
 * @returns {void}
 */
function pipeFile(response, path, range) {
  const stream = range === undefined
    ? createReadStream(path)
    : createReadStream(path, { start: range.start, end: range.end })
  let finished = false
  const cleanup = () => {
    if (finished) return
    finished = true
    stream.destroy()
  }
  stream.on('error', () => {
    cleanup()
    try { response.destroy() } catch { /* already gone */ }
  })
  response.on('close', cleanup)
  stream.pipe(response)
}

/**
 * Answer one PDF request from disk.
 *
 * Never throws for a missing file: the caller decides the envelope (the reader
 * shows "找不到这个 PDF", a missing translation says so instead).
 * @param {import('node:http').IncomingMessage} request - the inbound request.
 * @param {import('node:http').ServerResponse} response - the outbound response.
 * @param {string} path - absolute path of the PDF.
 * @returns {Promise<{ ok: true, status: number } | { ok: false, reason: 'not-found' | 'too-large' }>} what was answered.
 */
export async function sendPdfFile(request, response, path) {
  let info
  try {
    info = await stat(path)
  } catch {
    return { ok: false, reason: 'not-found' }
  }
  if (info.isFile() !== true) return { ok: false, reason: 'not-found' }
  if (info.size > MAX_PDF_BYTES) return { ok: false, reason: 'too-large' }
  const etag = fileEtag(info)
  const base = {
    'content-type': 'application/pdf',
    'cache-control': PDF_CACHE_CONTROL,
    'accept-ranges': 'bytes',
    etag,
    'last-modified': info.mtime.toUTCString(),
  }
  if (matchesEtag(request.headers['if-none-match'], etag)) {
    response.writeHead(304, { 'cache-control': PDF_CACHE_CONTROL, etag, 'last-modified': base['last-modified'] })
    response.end()
    return { ok: true, status: 304 }
  }
  const range = parseByteRange(request.headers.range, info.size)
  if (range !== null && range.unsatisfiable === true) {
    response.writeHead(416, {
      'content-type': 'application/pdf',
      'cache-control': PDF_CACHE_CONTROL,
      'accept-ranges': 'bytes',
      'content-range': `bytes */${info.size}`,
      etag,
    })
    response.end()
    return { ok: true, status: 416 }
  }
  const headers = { ...base }
  if (range === null) {
    headers['content-length'] = info.size
  } else {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`
    headers['content-length'] = range.end - range.start + 1
  }
  const status = range === null ? 200 : 206
  response.writeHead(status, headers)
  if (request.method === 'HEAD') {
    response.end()
    return { ok: true, status }
  }
  pipeFile(response, path, range ?? undefined)
  return { ok: true, status }
}
