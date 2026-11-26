/**
 * Translate one page block by block in a single vision request.
 *
 * The model gets the page image once plus the block list, and returns a JSON
 * object mapping block id to translated Markdown. Cost stays close to the
 * whole-page call; only missing or invalid blocks are retried.
 *
 * The caller owns the transport: it stores the page image and passes the same
 * `chat` function `translate.js` uses, so both paths always call one model.
 * @module dsh-pdf-workbench/translate-blocks
 */

function promptFor(target, blocks) {
  const language = target === 'zh' ? 'Simplified Chinese' : 'English'
  const list = blocks.map(block => `${block.id}: ${block.text}`).join('\n')
  return [
    'You are a mathematics textbook translator.',
    `Translate each block below into ${language}.`,
    'Keep every mathematical formula as LaTeX ($...$ inline, $$...$$ display).',
    'Do not translate variable names or theorem numbers.',
    // The overlay places one translated block back on one original block, so a
    // merged or split answer silently shifts every box on the page.
    'Translate each block independently: never merge two blocks and never split one block into two entries.',
    'Every block id must appear exactly once; keep an empty string for a block with nothing to translate.',
    'Reply with a JSON object only: block id -> translated Markdown string.',
    '',
    'BLOCKS:',
    list,
  ].join('\n')
}

function parseJson(content) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  // Take the first *balanced* object, not the first `{` .. last `}` pair: model
  // prose after the JSON (or a stray brace in a formula) used to make the slice
  // invalid, which silently sent the whole chapter down the whole-page path.
  const start = trimmed.indexOf('{')
  if (start < 0) throw new Error('模型没有返回 JSON')
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(trimmed.slice(start, index + 1))
    }
  }
  throw new Error('模型返回的 JSON 不完整')
}

/**
 * Some answers wrap the mapping in another object (`{"blocks": {...}}`) or send
 * a list of `{id, md}` rows. Unwrap those before matching block ids.
 * @param {object} parsed - the parsed model answer.
 * @returns {object} a plain id -> markdown mapping.
 */
function unwrap(parsed) {
  if (parsed === null || typeof parsed !== 'object') return {}
  if (Array.isArray(parsed)) {
    const mapped = {}
    for (const row of parsed) {
      if (row !== null && typeof row === 'object' && typeof row.id === 'string') {
        mapped[row.id] = typeof row.md === 'string' ? row.md : row.text
      }
    }
    return mapped
  }
  for (const key of ['blocks', 'translations', 'result', 'data', 'mapping']) {
    const nested = parsed[key]
    if (nested !== null && typeof nested === 'object') return unwrap(nested)
  }
  return parsed
}

/**
 * @param {{ chat: Function, image: object, blocks: object[], target: 'zh'|'en', signal?: AbortSignal, onUsage?: Function }} options - the Host channel, the stored page image, and the block list.
 * @returns {Promise<object[]>} blocks with `md` filled in.
 */
export async function translatePageBlocks(options) {
  if (typeof options.chat !== 'function') {
    throw new Error('翻译通道不可用：请在 设置 → AI 模型 选择翻译模型')
  }
  /**
   * One request for one list of blocks.
   * @param {object[]} list - the blocks to translate.
   * @returns {Promise<object>} the parsed id → Markdown mapping.
   */
  const ask = async list => {
    const content = await options.chat({
      prompt: promptFor(options.target, list),
      image: options.image,
      signal: options.signal,
      onUsage: options.onUsage,
    })
    if (typeof content !== 'string' || content.trim() === '') throw new Error('模型返回了空内容')
    return unwrap(parseJson(content))
  }

  const blocks = options.blocks
  let mapping = await ask(blocks)
  const ids = new Set(blocks.map(block => block.id))
  const matched = () => Object.keys(mapping).filter(key => ids.has(key) && typeof mapping[key] === 'string')
  if (matched().length === 0) {
    // An answer that names no block id is a format failure, not a partial page:
    // retry the same list once, then give up so the job falls back to whole-page.
    mapping = await ask(blocks)
    if (matched().length === 0) throw new Error('模型没有按块返回（键名与块 id 不匹配）')
  }
  // Retry only the blocks this answer skipped. One extra image request beats a
  // silent hole in the overlay, which used to look like a successful page.
  const missing = blocks.filter(block => typeof mapping[block.id] !== 'string')
  if (missing.length > 0) {
    try {
      const retried = await ask(missing)
      for (const block of missing) {
        if (typeof retried[block.id] === 'string') mapping[block.id] = retried[block.id]
      }
    } catch {
      // Keep the first answer; the caller marks whatever stayed empty.
    }
  }
  return blocks.map(block => ({
    ...block,
    md: typeof mapping[block.id] === 'string' ? mapping[block.id] : '',
    missing: typeof mapping[block.id] !== 'string',
  }))
}
