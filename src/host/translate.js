/**
 * Translate one rendered PDF page with the DeepSeek vision API.
 *
 * The page is sent as a JPEG data URL; the model returns Markdown with LaTeX
 * formulas preserved. The caller renders that Markdown with `md2tex.py`.
 * @module dsh-pdf-math-desk/translate
 */

const API_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-flash'

function promptFor(target) {
  const direction = target === 'zh' ? 'Simplified Chinese' : 'English'
  return [
    'You are a mathematics textbook translator.',
    `Translate the readable text of this page into ${direction}.`,
    'Preserve every mathematical formula exactly, using LaTeX: inline formulas as $...$, display formulas as $$...$$.',
    'Do not translate variable names, theorem numbers, or formula content; only translate natural language.',
    'Keep the document structure: headings, paragraphs, lists, theorem/lemma labels.',
    'Return Markdown only, with no commentary and no code fences.',
  ].join(' ')
}

/**
 * @param {{ apiKey: string, image: string, target: 'zh'|'en', signal?: AbortSignal }} options - key, JPEG data URL, target language.
 * @returns {Promise<string>} Markdown produced by the model.
 */
export async function translatePage(options) {
  if (typeof options.apiKey !== 'string' || options.apiKey === '') {
    throw new Error('缺少 DeepSeek API Key：请在插件配置里设置 deepseekApiKey，或设置环境变量 DEEPSEEK_API_KEY')
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
            { type: 'text', text: promptFor(options.target) },
            { type: 'image_url', image_url: { url: options.image } },
          ],
        },
      ],
    }),
    signal: options.signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 300)}`)
  }
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('DeepSeek API 返回了空内容')
  }
  return content.trim()
}
