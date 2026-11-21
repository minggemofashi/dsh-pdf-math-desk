/**
 * Translate one page block by block in a single vision request.
 *
 * The model gets the page image once plus the block list, and returns a JSON
 * object mapping block id to translated Markdown. Cost stays close to the
 * whole-page call; only missing or invalid blocks are retried.
 * @module dsh-pdf-math-desk/translate-blocks
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
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON')
  return JSON.parse(trimmed.slice(start, end + 1))
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
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new Error('DeepSeek API 返回了空内容')
  const mapping = parseJson(content)
  return options.blocks.map(block => ({
    ...block,
    md: typeof mapping[block.id] === 'string' ? mapping[block.id] : '',
  }))
}
