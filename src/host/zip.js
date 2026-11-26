/**
 * Minimal ZIP writer/reader. No external dependency: store and deflate entries
 * are supported in both directions, which also lets the Host read archives
 * produced by Python's `zipfile`.
 *
 * `readZip` buffers a whole archive and `writeZip` buffers every entry;
 * `listZipEntries` + `pipeZipEntry` read one entry at a time and `writeZipFile`
 * writes one, so a multi-gigabyte pack is never held in memory just to hand a
 * single PDF over.
 * @module dsh-pdf-workbench/zip
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createDeflateRaw, createInflateRaw, deflateRawSync, inflateRawSync } from 'node:zlib'

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

/**
 * A readable failure from the streaming reader. `code` is stable, so callers can
 * tell "the package is damaged" from "this package shape is unsupported".
 */
export class ZipError extends Error {
  /**
   * @param {'bad-zip'|'zip64'|'encrypted'|'truncated'|'unsupported-method'|'size-mismatch'|'crc-mismatch'|'too-large'} code - stable machine code.
   * @param {string} message - user-facing reason, already localized.
   */
  constructor(code, message) {
    super(message)
    this.name = 'ZipError'
    this.code = code
  }
}

/** EOCD record plus the longest possible archive comment. */
const END_WINDOW = 22 + 0xffff

/** ZIP64 sentinels: the real value would live in a zip64 record. */
const ZIP64_32 = 0xffffffff
const ZIP64_16 = 0xffff

/**
 * Read exactly `length` bytes at `position`; a short read means a truncated file.
 * @param {import('node:fs/promises').FileHandle} handle - open archive.
 * @param {number} position - byte offset.
 * @param {number} length - bytes wanted.
 * @returns {Promise<Buffer>} the bytes actually present.
 */
async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length)
  let done = 0
  while (done < length) {
    const { bytesRead } = await handle.read(buffer, done, length - done, position + done)
    if (bytesRead === 0) break
    done += bytesRead
  }
  return done === length ? buffer : buffer.subarray(0, done)
}

/**
 * Update a running CRC32 with more bytes.
 * @param {number} state - the register after the previous chunk.
 * @param {Buffer} chunk - more bytes.
 * @returns {number} the new register.
 */
function crc32Update(state, chunk) {
  let value = state
  for (const byte of chunk) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return value
}

/** ZIP32 ceilings: one entry, the whole archive, and the entry count. */
const ZIP32_MAX_BYTES = 0xffffffff
const ZIP32_MAX_ENTRIES = 0xffff

/**
 * Feed one chunk to a write stream and wait until the operating system has it.
 * @param {import('node:fs').WriteStream} stream - open output.
 * @param {Buffer} chunk - bytes to append.
 * @returns {Promise<void>} completion.
 */
function writeChunk(stream, chunk) {
  if (chunk.length === 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    stream.write(chunk, error => (error ? reject(error) : resolve()))
  })
}

/**
 * Write a ZIP archive in one streaming pass: only the current chunk is held in
 * memory, so a pack bigger than RAM still works.
 *
 * Entries are appended in order (local file header → data → …), then the
 * central directory and the EOCD record. A local header needs its entry's CRC
 * and sizes, which are only known after the bytes went by, so those three
 * fields are filled in with a positional write once the data is on disk. The
 * result is an ordinary ZIP32 archive — no data descriptor — that `readZip`,
 * `listZipEntries` and Python's `zipfile` read like one from `writeZip`.
 *
 * @param {string} outPath - file to create (its directory must already exist).
 * @param {{ entries: { name: string, data?: Buffer, path?: string }[], compress?: boolean }} options - entries given by bytes or by file path; `compress` raw-deflates each one.
 * @returns {Promise<{ bytes: number, files: number }>} archive size and entry count.
 * @throws {ZipError} `bad-name` for an unsafe entry name, `bad-entry` for an entry with neither `data` nor `path`, `zip64` beyond the ZIP32 limits; file-system errors pass through.
 */
export async function writeZipFile(outPath, options) {
  const entries = Array.isArray(options?.entries) ? options.entries : []
  const compress = options?.compress === true
  // 0xffff entries and 0xffffffff sizes/offsets are the ZIP64 sentinels: a
  // package carrying them would be refused by `listZipEntries`, so refuse to
  // write them in the first place.
  if (entries.length >= ZIP32_MAX_ENTRIES) {
    throw new ZipError('zip64', `条目数超过 ${ZIP32_MAX_ENTRIES - 1}，暂不支持 ZIP64 压缩包`)
  }
  const { time, date } = dosDateTime()
  const out = createWriteStream(outPath)
  let failure = null
  out.on('error', error => { failure = error })
  /** Append bytes; rejects as soon as the file stream fails. */
  const write = async chunk => {
    if (failure !== null) throw failure
    await writeChunk(out, chunk)
    if (failure !== null) throw failure
  }
  let position = 0
  const patches = []
  const centralRecords = []
  try {
    for (const entry of entries) {
      let name
      try {
        name = safeZipName(entry?.name)
      } catch (error) {
        throw new ZipError('bad-name', String(error && error.message ? error.message : error))
      }
      const nameBytes = Buffer.from(name, 'utf8')
      const method = compress ? 8 : 0
      const headerOffset = position
      const local = Buffer.alloc(30)
      local.writeUInt32LE(LOCAL_SIG, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0x0800, 6)
      local.writeUInt16LE(method, 8)
      local.writeUInt16LE(time, 10)
      local.writeUInt16LE(date, 12)
      local.writeUInt16LE(nameBytes.length, 26)
      local.writeUInt16LE(0, 28)
      await write(local)
      await write(nameBytes)
      position += local.length + nameBytes.length

      let rawSize = 0
      let crcState = 0xffffffff
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          rawSize += chunk.length
          crcState = crc32Update(crcState, chunk)
          callback(null, chunk)
        },
      })
      let source
      if (Buffer.isBuffer(entry?.data)) source = Readable.from([entry.data])
      else if (typeof entry?.path === 'string' && entry.path !== '') source = createReadStream(entry.path)
      else throw new ZipError('bad-entry', `ZIP 条目既没有 data 也没有 path：${name}`)
      const stages = [source, meter]
      if (compress) stages.push(createDeflateRaw())
      for (let index = 0; index < stages.length - 1; index += 1) {
        const next = stages[index + 1]
        stages[index].on('error', error => next.destroy(error))
      }
      const tail = stages.slice(1).reduce((upstream, next) => upstream.pipe(next), source)
      let storedSize = 0
      try {
        for await (const chunk of tail) {
          storedSize += chunk.length
          await write(chunk)
        }
      } catch (error) {
        for (const stage of stages) stage.destroy()
        throw error
      }
      const checksum = (crcState ^ 0xffffffff) >>> 0
      if (rawSize >= ZIP32_MAX_BYTES || storedSize >= ZIP32_MAX_BYTES) {
        throw new ZipError('zip64', `文件接近 4 GB，暂不支持 ZIP64 压缩包：${name}`)
      }
      patches.push({ offset: headerOffset + 14, checksum, storedSize, rawSize })
      position += storedSize

      const central = Buffer.alloc(46)
      central.writeUInt32LE(CENTRAL_SIG, 0)
      central.writeUInt16LE(20, 4)
      central.writeUInt16LE(20, 6)
      central.writeUInt16LE(0x0800, 8)
      central.writeUInt16LE(method, 10)
      central.writeUInt16LE(time, 12)
      central.writeUInt16LE(date, 14)
      central.writeUInt32LE(checksum, 16)
      central.writeUInt32LE(storedSize, 20)
      central.writeUInt32LE(rawSize, 24)
      central.writeUInt16LE(nameBytes.length, 28)
      central.writeUInt16LE(0, 30)
      central.writeUInt16LE(0, 32)
      central.writeUInt16LE(0, 34)
      central.writeUInt16LE(0, 36)
      central.writeUInt32LE(0, 38)
      central.writeUInt32LE(headerOffset, 42)
      centralRecords.push(central, nameBytes)
    }
    if (position >= ZIP32_MAX_BYTES) throw new ZipError('zip64', '压缩包超过 4 GB，暂不支持 ZIP64 压缩包')
    const centralStart = position
    const centralBytes = Buffer.concat(centralRecords)
    await write(centralBytes)
    position += centralBytes.length
    if (centralBytes.length >= ZIP32_MAX_BYTES || centralStart >= ZIP32_MAX_BYTES) {
      throw new ZipError('zip64', '压缩包超过 4 GB，暂不支持 ZIP64 压缩包')
    }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(END_SIG, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralBytes.length, 12)
    end.writeUInt32LE(centralStart, 16)
    end.writeUInt16LE(0, 20)
    await write(end)
    position += end.length
    await new Promise((resolve, reject) => {
      out.once('error', reject)
      out.end(resolve)
    })
    // The data is flushed and the writer closed its descriptor, so the three
    // deferred local-header fields can be written where they belong.
    if (patches.length > 0) {
      const handle = await open(outPath, 'r+')
      try {
        for (const patch of patches) {
          const fields = Buffer.alloc(12)
          fields.writeUInt32LE(patch.checksum, 0)
          fields.writeUInt32LE(patch.storedSize, 4)
          fields.writeUInt32LE(patch.rawSize, 8)
          await handle.write(fields, 0, fields.length, patch.offset)
        }
      } finally {
        await handle.close()
      }
    }
    return { bytes: position, files: entries.length }
  } catch (error) {
    out.destroy()
    await rm(outPath, { force: true }).catch(() => {})
    throw error
  }
}

/**
 * List the entries of a ZIP archive without reading their data.
 *
 * Reads the tail for the end-of-central-directory record, then the central
 * directory, then each local file header to work out where the entry's data
 * starts. Names are normalized exactly like `readZip` does (forward slashes, no
 * `..`), and duplicate names keep the last occurrence, matching `readZip`'s Map.
 *
 * @param {string} archivePath - archive on disk.
 * @returns {Promise<Array<{ name: string, method: number, compressedSize: number, size: number, crc32: number, dataStart: number }>>} the entries, in directory order.
 * @throws {ZipError} when the archive is invalid, truncated, zip64 or encrypted.
 */
export async function listZipEntries(archivePath) {
  const handle = await open(archivePath, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new ZipError('bad-zip', '不是有效的 ZIP：不是普通文件')
    if (info.size < 22) throw new ZipError('bad-zip', '不是有效的 ZIP：文件太小')
    const tailLength = Math.min(info.size, END_WINDOW)
    const tail = await readAt(handle, info.size - tailLength, tailLength)
    if (tail.length < 22) throw new ZipError('bad-zip', '不是有效的 ZIP：文件太小')
    let end = -1
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
      if (tail.readUInt32LE(offset) !== END_SIG) continue
      // A comment that does not fit the tail is a stray signature, not the EOCD.
      if (offset + 22 + tail.readUInt16LE(offset + 20) > tail.length) continue
      end = offset
      break
    }
    if (end < 0) throw new ZipError('bad-zip', '不是有效的 ZIP：找不到目录结尾')
    const diskNumber = tail.readUInt16LE(end + 4)
    const centralDisk = tail.readUInt16LE(end + 6)
    const countOnDisk = tail.readUInt16LE(end + 8)
    const count = tail.readUInt16LE(end + 10)
    const centralSize = tail.readUInt32LE(end + 12)
    const centralOffset = tail.readUInt32LE(end + 16)
    if (count === ZIP64_16 || countOnDisk === ZIP64_16 || centralSize === ZIP64_32 || centralOffset === ZIP64_32) {
      throw new ZipError('zip64', '暂不支持 ZIP64 压缩包（条目数或单文件超过 4 GB）')
    }
    if (diskNumber !== 0 || centralDisk !== 0 || countOnDisk !== count) {
      throw new ZipError('bad-zip', '不是有效的 ZIP：不支持分卷压缩包')
    }
    if (count === 0) return []
    if (centralOffset + centralSize > info.size) throw new ZipError('truncated', '不是有效的 ZIP：中央目录被截断')
    const central = await readAt(handle, centralOffset, centralSize)
    if (central.length !== centralSize) throw new ZipError('truncated', '不是有效的 ZIP：中央目录被截断')
    const entries = new Map()
    let cursor = 0
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > central.length) throw new ZipError('truncated', '不是有效的 ZIP：目录被截断')
      if (central.readUInt32LE(cursor) !== CENTRAL_SIG) throw new ZipError('bad-zip', 'ZIP 目录损坏')
      const flags = central.readUInt16LE(cursor + 8)
      const method = central.readUInt16LE(cursor + 10)
      const checksum = central.readUInt32LE(cursor + 16)
      const compressedSize = central.readUInt32LE(cursor + 20)
      const size = central.readUInt32LE(cursor + 24)
      const nameLength = central.readUInt16LE(cursor + 28)
      const extraLength = central.readUInt16LE(cursor + 30)
      const commentLength = central.readUInt16LE(cursor + 32)
      const localOffset = central.readUInt32LE(cursor + 42)
      if (cursor + 46 + nameLength + extraLength + commentLength > central.length) {
        throw new ZipError('truncated', '不是有效的 ZIP：目录被截断')
      }
      const rawName = central.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
      let name
      try {
        name = safeZipName(rawName)
      } catch (error) {
        throw new ZipError('bad-zip', String(error && error.message ? error.message : error))
      }
      if (compressedSize === ZIP64_32 || size === ZIP64_32 || localOffset === ZIP64_32) {
        throw new ZipError('zip64', `暂不支持 ZIP64 压缩包：${name}`)
      }
      if ((flags & 0x1) !== 0 || method === 99) throw new ZipError('encrypted', `加密 ZIP 暂不支持：${name}`)
      if (method !== 0 && method !== 8) throw new ZipError('unsupported-method', `不支持的 ZIP 压缩方式 ${method}：${name}`)
      if (localOffset + 30 > info.size) throw new ZipError('truncated', `不是有效的 ZIP：条目偏移越界：${name}`)
      const local = await readAt(handle, localOffset, 30)
      if (local.length !== 30) throw new ZipError('truncated', `不是有效的 ZIP：条目头被截断：${name}`)
      if (local.readUInt32LE(0) !== LOCAL_SIG) throw new ZipError('bad-zip', `ZIP 条目损坏：${name}`)
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      if (dataStart > info.size || dataStart + compressedSize > info.size) {
        throw new ZipError('truncated', `ZIP 条目被截断：${name}`)
      }
      entries.set(name, { name, method, compressedSize, size, crc32: checksum, dataStart })
      cursor += 46 + nameLength + extraLength + commentLength
    }
    return [...entries.values()]
  } finally {
    await handle.close()
  }
}

/**
 * Stream one entry's decompressed bytes into `writable`, hashing them on the way.
 *
 * `method 0` is copied straight from its data range; `method 8` is inflated
 * through `createInflateRaw`. Nothing larger than a stream chunk is buffered.
 * The byte count and CRC32 are checked against the directory afterwards, so a
 * damaged package is refused instead of imported.
 *
 * @param {string} archivePath - archive on disk.
 * @param {{ name: string, method: number, compressedSize: number, size: number, crc32: number, dataStart: number }} entry - one `listZipEntries` entry.
 * @param {import('node:stream').Writable} writable - destination; the pipeline ends it.
 * @returns {Promise<{ bytes: number, crc32: number, sha256: string }>} what was written.
 * @throws {ZipError} on an unsupported method, damaged data or a size/CRC mismatch.
 */
export async function pipeZipEntry(archivePath, entry, writable) {
  if (entry === null || typeof entry !== 'object') throw new ZipError('bad-zip', 'ZIP 条目为空')
  const name = String(entry.name ?? '')
  const method = entry.method
  if (method !== 0 && method !== 8) throw new ZipError('unsupported-method', `不支持的 ZIP 压缩方式 ${method}：${name}`)
  const dataStart = Number(entry.dataStart)
  const compressedSize = Number(entry.compressedSize)
  if (!Number.isSafeInteger(dataStart) || dataStart < 0 || !Number.isSafeInteger(compressedSize) || compressedSize < 0) {
    throw new ZipError('bad-zip', `ZIP 条目偏移无效：${name}`)
  }
  const source = compressedSize === 0
    ? Readable.from([])
    : createReadStream(archivePath, { start: dataStart, end: dataStart + compressedSize - 1 })
  const hash = createHash('sha256')
  let bytes = 0
  let state = 0xffffffff
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      state = crc32Update(state, chunk)
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  const stages = [source]
  if (method === 8) stages.push(createInflateRaw())
  stages.push(meter, writable)
  try {
    await pipeline(...stages)
  } catch (error) {
    if (error instanceof ZipError) throw error
    // File-system errors (EACCES, ENOSPC…) are the Host's problem, not the
    // package's; only compressed-data errors get the ZIP label.
    if (typeof error?.code === 'string' && /^E[A-Z]+$/.test(error.code)) throw error
    throw new ZipError('bad-zip', `ZIP 条目读取失败：${name}（${String(error && error.message ? error.message : error)}）`)
  }
  const actual = (state ^ 0xffffffff) >>> 0
  const declaredSize = Number(entry.size)
  if (bytes !== declaredSize) {
    throw new ZipError('size-mismatch', `ZIP 条目大小不符：${name}（目录声明 ${declaredSize} 字节，实际 ${bytes} 字节）`)
  }
  if (actual !== Number(entry.crc32) >>> 0) {
    throw new ZipError('crc-mismatch', `ZIP 条目校验失败（CRC32 不符）：${name}`)
  }
  return { bytes, crc32: actual, sha256: hash.digest('hex') }
}

/**
 * Read the first bytes of one entry's decompressed content.
 *
 * Used to check a `%PDF-` header without inflating a whole book. A stored entry
 * is a direct read; a deflated one stops inflating as soon as enough output
 * exists.
 *
 * @param {string} archivePath - archive on disk.
 * @param {{ name: string, method: number, compressedSize: number, size: number, dataStart: number }} entry - one `listZipEntries` entry.
 * @param {number} length - how many bytes to peek at.
 * @returns {Promise<Buffer>} up to `length` bytes (fewer only at the entry's end).
 * @throws {ZipError} when the data cannot be read.
 */
export async function readZipEntryHead(archivePath, entry, length) {
  const wanted = Math.max(0, Math.floor(Number(length) || 0))
  if (entry === null || typeof entry !== 'object') throw new ZipError('bad-zip', 'ZIP 条目为空')
  if (wanted === 0) return Buffer.alloc(0)
  const name = String(entry.name ?? '')
  const compressedSize = Number(entry.compressedSize)
  if (entry.method === 0) {
    const count = Math.min(wanted, compressedSize)
    if (count <= 0) return Buffer.alloc(0)
    const handle = await open(archivePath, 'r')
    try {
      const head = await readAt(handle, Number(entry.dataStart), count)
      return head.subarray(0, Math.min(head.length, Number(entry.size)))
    } finally {
      await handle.close()
    }
  }
  if (entry.method !== 8) throw new ZipError('unsupported-method', `不支持的 ZIP 压缩方式 ${entry.method}：${name}`)
  if (compressedSize <= 0) return Buffer.alloc(0)
  const dataStart = Number(entry.dataStart)
  const source = createReadStream(archivePath, { start: dataStart, end: dataStart + compressedSize - 1 })
  const inflate = source.pipe(createInflateRaw())
  const chunks = []
  let total = 0
  try {
    for await (const chunk of inflate) {
      chunks.push(chunk)
      total += chunk.length
      if (total >= wanted) break
    }
  } catch (error) {
    throw new ZipError('bad-zip', `ZIP 条目读取失败：${name}（${String(error && error.message ? error.message : error)}）`)
  } finally {
    inflate.destroy()
    source.destroy()
  }
  return Buffer.concat(chunks, total).subarray(0, Math.min(wanted, total))
}

/**
 * Read one small entry into memory, refusing anything above `maxBytes`.
 * @param {string} archivePath - archive on disk.
 * @param {{ name: string, method: number, compressedSize: number, size: number, crc32: number, dataStart: number }} entry - one `listZipEntries` entry.
 * @param {number} maxBytes - ceiling for this entry.
 * @returns {Promise<Buffer>} the entry's bytes.
 * @throws {ZipError} when the entry is larger than `maxBytes` or its data is damaged.
 */
export async function readZipEntryBuffer(archivePath, entry, maxBytes) {
  const limit = Number(maxBytes)
  if (!Number.isFinite(limit) || limit < 0) throw new ZipError('too-large', '没有为这条 ZIP 条目设置读取上限')
  if (Number(entry?.size) > limit) {
    throw new ZipError('too-large', `ZIP 条目光过大小：${String(entry?.name ?? '')}（${Number(entry?.size)} 字节 > ${limit} 字节）`)
  }
  const chunks = []
  let total = 0
  const sink = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length
      if (total > limit) {
        callback(new ZipError('too-large', `ZIP 条目光过大小：${String(entry?.name ?? '')}（超过 ${limit} 字节）`))
        return
      }
      chunks.push(chunk)
      callback()
    },
  })
  await pipeZipEntry(archivePath, entry, sink)
  return Buffer.concat(chunks, total)
}
