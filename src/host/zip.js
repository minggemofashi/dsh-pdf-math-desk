/**
 * Minimal ZIP writer/reader used by the data-migration backup. No external
 * dependency: store and deflate entries are supported in both directions, which
 * also lets the Host read archives produced by Python's `zipfile`.
 * @module dsh-pdf-workbench/zip
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'

/** Signature constants from the ZIP specification. */
const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50

/**
 * Normalize one archive path: forward slashes, no leading slash, no `..`.
 * @param {string} value - proposed entry name.
 * @returns {string} safe name.
 */
export function safeZipName(value) {
  const name = String(value ?? '').replace(/\\/g, '/')
  if (name === '' || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`不安全的压缩包路径：${name}`)
  const parts = name.split('/').filter(part => part !== '' && part !== '.')
  if (parts.some(part => part === '..')) throw new Error(`不安全的压缩包路径：${name}`)
  return parts.join('/')
}

/** CRC32 table, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/**
 * @param {Buffer} buffer - bytes.
 * @returns {number} CRC32.
 */
export function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

/**
 * DOS date/time words for the current local clock.
 * @param {Date} [date] - timestamp.
 * @returns {{ time: number, date: number }} the two words.
 */
function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

/**
 * Write a ZIP archive. Entries are stored by default; `compress` switches to
 * raw deflate per entry.
 * @param {{ entries: { name: string, data: Buffer }[], compress?: boolean }} options - files to archive.
 * @returns {Buffer} the ZIP bytes.
 */
export function writeZip(options) {
  const entries = Array.isArray(options.entries) ? options.entries : []
  const compress = options.compress === true
  const { time, date } = dosDateTime()
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const name = safeZipName(entry.name)
    const nameBytes = Buffer.from(name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const data = compress ? deflateRawSync(raw) : raw
    const method = compress ? 8 : 0
    const checksum = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_SIG, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)

    offset += local.length + nameBytes.length + data.length
  }
  const centralStart = offset
  const centralBytes = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_SIG, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, centralBytes, end])
}

/**
 * Find the end-of-central-directory record.
 * @param {Buffer} buffer - archive bytes.
 * @returns {number} the record offset.
 */
function findEnd(buffer) {
  const earliest = Math.max(0, buffer.length - 22 - 0xffff)
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_SIG) return offset
  }
  throw new Error('不是有效的 ZIP：找不到目录结尾')
}

/**
 * Read a ZIP archive (store and deflate).
 * @param {Buffer} buffer - archive bytes.
 * @returns {Map<string, Buffer>} entries by name.
 */
export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('不是有效的 ZIP')
  const end = findEnd(buffer)
  const count = buffer.readUInt16LE(end + 10)
  const centralOffset = buffer.readUInt32LE(end + 16)
  if (count === 0) return new Map()
  if (centralOffset + 46 > buffer.length) throw new Error('不是有效的 ZIP：目录偏移越界')
  const entries = new Map()
  let offset = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length) throw new Error('不是有效的 ZIP：目录被截断')
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIG) throw new Error('ZIP 目录损坏')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    if (localOffset + 30 > buffer.length) throw new Error('不是有效的 ZIP：条目偏移越界')
    const name = safeZipName(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`ZIP 条目损坏：${name}`)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart > buffer.length || dataStart + compressedSize > buffer.length) throw new Error('不是有效的 ZIP：条目数据越界')
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)
    if (raw.length !== compressedSize) throw new Error(`ZIP 条目被截断：${name}`)
    let data
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw)
    else throw new Error(`不支持的 ZIP 压缩方式 ${method}：${name}`)
    if (data.length !== uncompressedSize) throw new Error(`ZIP 条目大小不符：${name}`)
    entries.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
