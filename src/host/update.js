/**
 * Ask GitHub Releases for the newest tag, from the Host.
 *
 * The browser's fetch could not reach GitHub on a proxied desktop (the Electron
 * renderer does not follow the system proxy, and direct access is blocked in
 * some networks), so the Host does the request and tries the usual local proxy
 * ports before falling back to a direct connection. Loopback-only route, no
 * credentials, one GET per click.
 *
 * @module dsh-pdf-workbench/update
 */
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

/** Repository whose Releases are compared. */
export const REPO = 'minggemofashi/dsh-pdf-workbench'

/** Where the release page lives, for the "new version" notice. */
export const RELEASES_URL = `https://github.com/${REPO}/releases`

const API_PATH = `/repos/${REPO}/releases/latest`
const API_HOST = 'api.github.com'
const TIMEOUT = 8000

/**
 * Local proxy ports worth trying when nothing is configured.
 * @returns {string[]} candidate proxy URLs.
 */
function proxyCandidates(configured) {
  const list = []
  if (typeof configured === 'string' && configured.trim() !== '') list.push(configured.trim())
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    if (typeof process.env[key] === 'string' && process.env[key].trim() !== '') list.push(process.env[key].trim())
  }
  list.push('http://127.0.0.1:7890', 'http://127.0.0.1:7897', 'http://127.0.0.1:10809')
  return [...new Set(list)]
}

/**
 * One HTTPS GET, optionally through a CONNECT proxy.
 * @param {string} url - absolute URL.
 * @param {string | null} proxy - proxy URL, or null for a direct request.
 * @returns {Promise<{ status: number, body: Buffer }>} the response.
 */
function requestOnce(url, proxy) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const fail = error => reject(error)
    const finish = (status, body) => resolve({ status, body })
    if (proxy === null) {
      const request = https.get({
        host: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-pdf-workbench' },
        timeout: TIMEOUT,
      }, response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => finish(response.statusCode ?? 0, Buffer.concat(chunks)))
        response.on('error', fail)
      })
      request.on('timeout', () => request.destroy(new Error('timeout')))
      request.on('error', fail)
      return
    }
    const proxyUrl = new URL(proxy)
    const connect = http.request({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port || 80),
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      timeout: TIMEOUT,
    })
    connect.on('timeout', () => connect.destroy(new Error('proxy timeout')))
    connect.on('error', fail)
    connect.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        fail(new Error(`proxy CONNECT ${response.statusCode}`))
        return
      }
      const secure = tls.connect({ socket, servername: target.hostname }, () => {
        secure.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\n`
          + `Host: ${target.hostname}\r\n`
          + 'Accept: application/vnd.github+json\r\n'
          + 'User-Agent: dsh-pdf-workbench\r\n'
          + 'Accept-Encoding: identity\r\n'
          + 'Connection: close\r\n\r\n')
      })
      secure.on('error', fail)
      const chunks = []
      secure.on('data', chunk => chunks.push(chunk))
      secure.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const split = buffer.indexOf('\r\n\r\n')
        if (split < 0) {
          fail(new Error('bad proxy response'))
          return
        }
        const statusLine = buffer.subarray(0, split).toString('latin1').split('\r\n')[0] ?? ''
        const match = /\s(\d{3})\s/.exec(statusLine)
        finish(match === null ? 0 : Number(match[1]), buffer.subarray(split + 4))
      })
    })
    connect.end()
  })
}

/**
 * Fetch the newest release tag.
 * @param {string} [configuredProxy] - `config.updateProxy`, when set.
 * @returns {Promise<{ ok: true, latest: string, url: string, via: string } | { ok: false, error: string }>} the answer.
 */
export async function checkForUpdate(configuredProxy) {
  const url = `https://${API_HOST}${API_PATH}`
  const attempts = [...proxyCandidates(configuredProxy).map(proxy => ({ proxy, via: proxy })), { proxy: null, via: 'direct' }]
  let lastError = ''
  for (const attempt of attempts) {
    try {
      const response = await requestOnce(url, attempt.proxy)
      if (response.status === 404) return { ok: true, latest: '', url: RELEASES_URL, via: attempt.via }
      if (response.status !== 200) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const payload = JSON.parse(response.body.toString('utf8'))
      const latest = typeof payload.tag_name === 'string' ? payload.tag_name : ''
      const version = latest.replace(/^v/i, '')
      const assets = Array.isArray(payload.assets) ? payload.assets : []
      const zip = assets.find(asset => asset !== null && typeof asset === 'object'
        && typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.zip')
        && typeof asset.browser_download_url === 'string'
        && /^https:\/\/github\.com\//.test(asset.browser_download_url))
      const download = zip !== undefined && zip !== null
        ? zip.browser_download_url
        : (version === '' ? '' : `https://github.com/${REPO}/releases/download/${encodeURIComponent(latest)}/dsh-pdf-workbench-${encodeURIComponent(version)}.zip`)
      return { ok: true, latest, version, url: RELEASES_URL, download, via: attempt.via }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: false, error: lastError }
}
