/**
 * Translate one rendered PDF page through the Host model channel.
 *
 * The caller owns the model: it stores the page image once with
 * `ctx.attachments`, picks the provider/model from the user's "whole-chapter
 * translation" choice, and passes a `chat` function here. This module only keeps
 * the prompt and the post-processing, so switching models never changes how a
 * page is described or how its Markdown is repaired.
 *
 * The model returns Markdown with LaTeX formulas preserved; the caller renders
 * that Markdown with `md2tex.py`.
 * @module dsh-pdf-workbench/translate
 */

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
 * Normalize the model output so XeLaTeX can compile it: balanced display
 * math, LaTeX bracket forms converted, and an unclosed `$$` closed.
 * @param {string} markdown - raw model output.
 * @returns {string} compile-friendly Markdown.
 */
function balanceMath(markdown) {
  let text = markdown
    .replace(/\\\[/g, () => '$$')
    .replace(/\\\]/g, () => '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
  // Split on display delimiters: odd chunks are inside `$$...$$`, so their
  // inline `$` must go. An unmatched trailing display block is cleaned too and
  // then closed.
  const parts = text.split('$$')
  text = parts
    .map((part, index) => (index % 2 === 1 ? part.replace(/(?<!\\)\$/g, '') : part))
    .join('$$')
  if (parts.length % 2 === 0) text = `${text}\n\n$$`
  return text
}

/**
 * @param {{ chat: Function, image: object, target: 'zh'|'en', signal?: AbortSignal, onUsage?: Function }} options - the Host channel, the stored page image, and the target language.
 * @returns {Promise<string>} Markdown produced by the model.
 */
export async function translatePage(options) {
  if (typeof options.chat !== 'function') {
    throw new Error('翻译通道不可用：请在 设置 → AI 模型 选择翻译模型')
  }
  const content = await options.chat({
    prompt: promptFor(options.target),
    image: options.image,
    signal: options.signal,
    onUsage: options.onUsage,
  })
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('模型返回了空内容')
  }
  return balanceMath(content.trim())
}
