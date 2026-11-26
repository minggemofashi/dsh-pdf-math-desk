/**
 * Read the target path out of a Windows Shell Link (`.lnk`) file.
 *
 * The browser uploads the shortcut's *bytes*, so the Host has to rebuild the
 * target path from the file itself (MS-SHLLINK) before it can read that file.
 * Only the fields needed to find one path are read, and every offset is bounds
 * checked because the bytes come from the user.
 *
 * Two details matter in practice:
 *
 *   - A link saved by `WScript.Shell` almost always carries the optional
 *     LinkTargetIDList, so the LinkInfo section does *not* start at 0x4C; the
 *     IDList length at 0x4C decides where it starts.
 *   - The ANSI `LocalBasePath` is written in the system code page (GBK on a
 *     Chinese Windows), while the Unicode copy only exists when
 *     `LinkInfoHeaderSize >= 0x24` — which is not guaranteed even for paths with
 *     Chinese characters. The Unicode copy wins when present, and the ANSI copy
 *     is decoded as UTF-8, then GBK, then latin1.
 *
 * @module dsh-pdf-workbench/shortcut
 */

/** Shell Link header size, fixed by MS-SHLLINK. */
const HEADER_SIZE = 0x4c

/** LinkCLSID {00021401-0000-0000-C000-000000000046}. */
const LINK_CLSID = Buffer.from('0114020000000000c000000000000046', 'hex')

/** `LinkFlags` bit: a LinkTargetIDList follows the header. */
const FLAG_HAS_ID_LIST = 0x01

/** `LinkFlags` bit: a LinkInfo section follows. */
const FLAG_HAS_LINK_INFO = 0x02

/** `LinkInfoHeaderSize` of the oldest layout: no Unicode offsets. */
const LINK_INFO_HEADER_BASE = 0x1c

/** `LinkInfoHeaderSize` from which the Unicode path offsets exist. */
const LINK_INFO_HEADER_UNICODE = 0x24

/** `LinkInfoFlags` bit: VolumeID and LocalBasePath (a local target). */
const LINK_INFO_HAS_VOLUME = 0x01

/** `LinkInfoFlags` bit: CommonNetworkRelativeLink (a network target). */
const LINK_INFO_HAS_NETWORK = 0x02

/** GBK decoder for the ANSI copy on Chinese Windows; null when ICU lacks it. */
const gbk = (() => {
  try {
    return new TextDecoder('gbk')
  } catch {
    return null
  }
})()

/**
 * @param {Buffer} bytes - link bytes.
 * @param {number} offset - absolute offset.
 * @returns {number|null} a little-endian uint32, or null when out of range.
 */
function u32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return bytes.readUInt32LE(offset)
}

/**
 * @param {Buffer} bytes - link bytes.
 * @param {number} offset - absolute offset.
 * @returns {number|null} a little-endian uint16, or null when out of range.
 */
function u16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return bytes.readUInt16LE(offset)
}

/**
 * Decode a path the writer stored as ANSI: UTF-8 when it is valid (a UTF-8
 * locale), else GBK (Chinese Windows), else latin1 so the bytes stay readable.
 * @param {Buffer} bytes - raw string bytes.
 * @returns {string} the decoded text.
 */
function decodeAnsi(bytes) {
  if (bytes.length === 0) return ''
  if (!bytes.some(byte => byte > 0x7f)) return bytes.toString('latin1')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    if (gbk !== null) {
      const text = gbk.decode(bytes)
      if (!text.includes('\uFFFD')) return text
    }
    return bytes.toString('latin1')
  }
}

/**
 * Read one NUL-terminated string that must end before `end`.
 * @param {Buffer} bytes - link bytes.
 * @param {number} start - absolute offset of the first byte.
 * @param {number} end - exclusive end of the containing section.
 * @param {boolean} unicode - UTF-16LE (two NUL bytes) instead of ANSI.
 * @returns {string|null} the text, or null when the section is malformed.
 */
function readTerminated(bytes, start, end, unicode) {
  if (start <= 0 || start >= end) return null
  if (unicode) {
    let stop = start
    while (stop + 1 < end && !(bytes[stop] === 0 && bytes[stop + 1] === 0)) stop += 2
    if (stop + 1 >= end) return null
    return bytes.subarray(start, stop).toString('utf16le')
  }
  let stop = start
  while (stop < end && bytes[stop] !== 0) stop += 1
  if (stop >= end) return null
  return decodeAnsi(bytes.subarray(start, stop))
}

/**
 * The first non-empty string, so a present-but-empty Unicode copy falls back to
 * the ANSI one instead of producing no path at all.
 * @param {...(string|null)} values - candidates in priority order.
 * @returns {string|null} the chosen text.
 */
function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

/**
 * Join `LocalBasePath` with the common path suffix. A local file link usually
 * carries the whole path in the base and an empty or `\` suffix.
 * @param {string} base - base path.
 * @param {string|null} suffix - common path suffix.
 * @returns {string} the full path.
 */
function joinPath(base, suffix) {
  const path = base.replace(/[\\/]+$/, '')
  if (suffix === null || suffix === '' || suffix === '\\') return path
  if (path.toLowerCase().endsWith(suffix.toLowerCase())) return path
  return suffix.startsWith('\\') ? `${path}${suffix}` : `${path}\\${suffix}`
}

/**
 * Read `NetName` from a CommonNetworkRelativeLink structure.
 * @param {Buffer} bytes - link bytes.
 * @param {number} start - absolute offset of the structure.
 * @param {number} end - exclusive end of the LinkInfo section.
 * @returns {string|null} the share path (`\\server\share`), or null.
 */
function readNetName(bytes, start, end) {
  const nameOffset = u32(bytes, start)
  if (nameOffset === null || nameOffset < 0x14) return null
  let unicodeName = null
  // NetNameOffsetUnicode sits at +0x0C and only exists when NetName is not the
  // first string (offset > 0x14).
  if (nameOffset > 0x14) {
    const unicodeOffset = u32(bytes, start + 0x0c)
    if (unicodeOffset !== null && unicodeOffset !== 0) {
      unicodeName = readTerminated(bytes, start + unicodeOffset, end, true)
    }
  }
  return firstText(unicodeName, readTerminated(bytes, start + nameOffset, end, false))
}

/**
 * Read one LinkInfo section (a local or a network target).
 * @param {Buffer} bytes - link bytes.
 * @param {number} start - absolute offset of the section.
 * @returns {{ path: string }|null} the target path, or null.
 */
function readLinkInfo(bytes, start) {
  const size = u32(bytes, start)
  const headerSize = u32(bytes, start + 4)
  const flags = u32(bytes, start + 8)
  if (size === null || headerSize === null || flags === null) return null
  if (headerSize < LINK_INFO_HEADER_BASE || size < headerSize) return null
  const end = Math.min(start + size, bytes.length)
  const localOffset = u32(bytes, start + 0x10)
  const networkOffset = u32(bytes, start + 0x14)
  const suffixOffset = u32(bytes, start + 0x18)
  if (localOffset === null || networkOffset === null || suffixOffset === null) return null
  // The Unicode offsets must beat the ANSI ones: the ANSI copy is in the
  // writer's code page and mangles Chinese paths when decoded naively.
  let localUnicode = null
  let suffixUnicode = null
  if (headerSize >= LINK_INFO_HEADER_UNICODE) {
    localUnicode = u32(bytes, start + 0x1c)
    suffixUnicode = u32(bytes, start + 0x20)
  }
  const suffix = firstText(
    suffixUnicode === null || suffixUnicode === 0 ? null : readTerminated(bytes, start + suffixUnicode, end, true),
    suffixOffset === 0 ? null : readTerminated(bytes, start + suffixOffset, end, false),
  )
  if ((flags & LINK_INFO_HAS_VOLUME) !== 0) {
    const base = firstText(
      localUnicode === null || localUnicode === 0 ? null : readTerminated(bytes, start + localUnicode, end, true),
      localOffset === 0 ? null : readTerminated(bytes, start + localOffset, end, false),
    )
    return base === null ? null : { path: joinPath(base, suffix) }
  }
  if ((flags & LINK_INFO_HAS_NETWORK) !== 0 && networkOffset !== 0) {
    const netName = readNetName(bytes, start + networkOffset, end)
    return netName === null ? null : { path: joinPath(netName, suffix) }
  }
  return null
}

/**
 * The target path stored in one Windows shortcut.
 *
 * Local targets come from `LocalBasePath` (+ common suffix); network targets come
 * from `CommonNetworkRelativeLink.NetName` and are returned as the `\\server\...`
 * path they are, so the caller can refuse them with its own message. Anything
 * malformed, truncated, or unreadable yields null instead of throwing.
 *
 * @param {Buffer} bytes - the uploaded `.lnk` bytes.
 * @returns {{ path: string }|null} the target path, or null when there is none.
 */
export function resolveShortcutTarget(bytes) {
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length < HEADER_SIZE) return null
    if (bytes.readUInt32LE(0) !== HEADER_SIZE) return null
    if (!bytes.subarray(4, 20).equals(LINK_CLSID)) return null
    const flags = bytes.readUInt32LE(0x14)
    if ((flags & FLAG_HAS_LINK_INFO) === 0) return null
    let offset = HEADER_SIZE
    if ((flags & FLAG_HAS_ID_LIST) !== 0) {
      const idListSize = u16(bytes, offset)
      if (idListSize === null) return null
      offset += 2 + idListSize
    }
    return readLinkInfo(bytes, offset)
  } catch {
    return null
  }
}
