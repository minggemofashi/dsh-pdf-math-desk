/**
 * Translate one page block by block in a single vision request.
 *
 * The model gets the page image once plus the block list, and returns a JSON
 * object mapping block id to translated Markdown. Cost stays close to the
 * whole-page call; only missing or invalid blocks are retried.
 * @module dsh-pdf-workbench/translate-blocks
 */

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-flash'

function promptFor(target, blocks) {
  const language = target === 'zh' ? 'Simplified Chinese' : 'English'
  const list = blocks.map(block => `${block.id}: ${block.text}`).join('\n')
  return [
    'You are a mathematics textbook translator.',
    `Translate each block below into ${language}.`,
    'Keep every mathematical formula as LaTeX ($...$ inline, $$...$$ display).',
    'Do not translate variable names or theorem numbers.',
    'Reply with a JSON object only: block id -> translated Markdown string.',
    'Every block id must appear exactly once; keep empty strings for blocks without text.',
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
 * @param {{ apiKey: string, image: string, blocks: object[], target: 'zh'|'en' }} options - page image and block list.
 * @returns {Promise<object[]>} blocks with `md` filled in.
 */
export async function translatePageBlocks(options) {
  if (typeof options.apiKey !== 'string' || options.apiKey === '') {
    throw new Error('缺少 DeepSeek API Key')
  }
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptFor(options.target, options.blocks) },
            { type: 'image_url', image_url: { url: options.image } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 300)}`)
  }
  const data = await response.json()
  if (typeof options.onUsage === 'function' && data !== null && typeof data === 'object' && data.usage) {
    const usage = data.usage
    options.onUsage({
      input: Number(usage.prompt_tokens) || 0,
      output: Number(usage.completion_tokens) || 0,
      total: Number(usage.total_tokens) || 0,
    })
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new Error('DeepSeek API 返回了空内容')
  const mapping = unwrap(parseJson(content))
  const known = new Set(options.blocks.map(block => block.id))
  const matched = Object.keys(mapping).filter(key => known.has(key))
  if (matched.length === 0) throw new Error('模型没有按块返回（键名与块 id 不匹配）')
  return options.blocks.map(block => ({
    ...block,
    md: typeof mapping[block.id] === 'string' ? mapping[block.id] : '',
  }))
}
