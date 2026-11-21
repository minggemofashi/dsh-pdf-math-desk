/**
 * HTTP plumbing for the `/mathdesk/*` surface.
 *
 * Mirrors the guards an installed plugin uses: loopback-only reads, same-origin
 * mutations, a tiny JSON body cap, and `{ ok, error }` envelopes.
 *
 * @module dsh-pdf-math-desk/http
 */

/** Request bodies are a position, not data; anything larger is a client bug. */
const MAX_BODY_BYTES = 16 * 1024

/**
 * Whether the request came from the local machine.
 * @param {import('node:http').IncomingMessage} request - the inbound request.
 * @returns {boolean} true for loopback peers.
 */
export function isLoopback(request) {
  const address = request.socket?.remoteAddress
  if (address === undefined) return true
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address.startsWith('127.')
}

/**
 * Same-origin guard for mutations. A missing Origin is allowed (the Desktop
 * shell strips it); a present Origin must match the Host header.
 * @param {import('node:http').IncomingMessage} request - the inbound request.
 * @returns {boolean} true when the request may mutate.
 */
export function isSameOrigin(request) {
  const origin = request.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  const host = request.headers.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} response - the outbound response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON-serializable body.
 * @returns {void}
 */
export function sendJson(response, status, payload) {
  if (response.writableEnded || response.destroyed) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/**
 * Send one binary response (the reader's PDF bytes, the toolkit archive).
 * @param {import('node:http').ServerResponse} response - the outbound response.
 * @param {number} status - HTTP status.
 * @param {Buffer} body - the bytes.
 * @param {string} contentType - the media type.
 * @param {string} [disposition] - optional `content-disposition` value.
 * @returns {void}
 */
export function sendBytes(response, status, body, contentType, disposition) {
  if (response.writableEnded || response.destroyed) return
  const headers = {
    'content-type': contentType,
    'cache-control': 'no-store',
    'accept-ranges': 'none',
    'content-length': body.length,
  }
  if (disposition !== undefined) headers['content-disposition'] = disposition
  response.writeHead(status, headers)
  response.end(body)
}

/**
 * Send one failure envelope.
 * @param {import('node:http').ServerResponse} response - the outbound response.
 * @param {number} status - HTTP status.
 * @param {string} code - stable machine code.
 * @param {string} message - human-readable message.
 * @returns {void}
 */
export function fail(response, status, code, message) {
  sendJson(response, status, { ok: false, error: { code, message } })
}

/**
 * Read a bounded JSON request body.
 * @param {import('node:http').IncomingMessage} request - the inbound request.
 * @returns {Promise<unknown>} the parsed body.
 */
export function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    request.on('error', reject)
  })
}
