/**
 * Chapter digest: summarize a chapter's conversations into one outline.
 *
 * The workbench creates one conversation per chapter and mode and continues it
 * until the context fills. Before that point, a digest of everything discussed
 * under the chapter is worth carrying forward: it costs one model call over the
 * chapter's transcripts, and saves far more than it spends in a continuation.
 *
 * The Host owns this because only it can read session logs and reach the model.
 * The browser sends the session ids it shows under the chapter; the Host folds
 * their text, asks the default model for an outline, and saves the result next to
 * the chapter's produced files so it is readable and reusable.
 *
 * @module dsh-pdf-workbench/digest
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Characters of transcript sent to the model; longer chapters are cut. */
export const MAX_TRANSCRIPT_CHARS = 120000

/** The outline the model is asked for. */
const SYSTEM = [
  '你是一位数学学习助教，负责把一段学习对话压缩成可继续使用的提纲。',
  '只输出 Markdown，不要客套话。结构固定为：',
  '## 本章范围（读了哪几页 / 哪些主题）',
  '## 已解决的问题（要点式，保留关键结论与公式）',
  '## 仍未解决的问题（明确列出）',
  '## 下一步建议（简短）',
  '忠实于对话，不要编造对话里没有的结论；公式用 $...$ 或 $$...$$。',
].join('\n')

/**
 * Pull readable text out of one stored session log.
 * @param {{ events?: object[] }} log - `sessionQuery.readSession` result.
 * @returns {string} the transcript, oldest first.
 */
export function transcriptOf(log) {
  if (log === null || typeof log !== 'object' || !Array.isArray(log.events)) return ''
  const lines = []
  for (const event of log.events) {
    if (event === null || typeof event !== 'object') continue
    const role = event.type === 'user/message' ? '用户' : event.type === 'assistant/message' ? '助手' : ''
    if (role === '') continue
    const content = event.message !== null && typeof event.message === 'object' && Array.isArray(event.message.content)
      ? event.message.content
      : Array.isArray(event.content) ? event.content : []
    const text = content
      .filter(block => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text.trim())
      .filter(text => text !== '')
      .join('\n')
    if (text === '') continue
    lines.push(`${role}：${text}`)
  }
  return lines.join('\n\n')
}

/**
 * Fold several sessions into one bounded transcript.
 * @param {string[]} sessionIds - sessions to read.
 * @param {(id: string) => Promise<{ events?: object[] }>} readSession - host reader.
 * @param {number} [maxChars] - character budget.
 * @returns {Promise<{ text: string, used: string[], dropped: number }>} the transcript and what fit.
 */
export async function collectTranscript(sessionIds, readSession, maxChars = MAX_TRANSCRIPT_CHARS) {
  const parts = []
  const used = []
  let total = 0
  let dropped = 0
  for (const id of sessionIds) {
    let log
    try {
      log = await readSession(id)
    } catch {
      dropped += 1
      continue
    }
    const text = transcriptOf(log)
    if (text === '') {
      dropped += 1
      continue
    }
    if (total + text.length > maxChars) {
      // Keep a head slice of the overflow rather than dropping it whole: early
      // messages usually define the chapter's question.
      const room = Math.max(0, maxChars - total)
      if (room > 2000) {
        parts.push(text.slice(0, room))
        used.push(id)
      }
      dropped += 1
      break
    }
    parts.push(text)
    used.push(id)
    total += text.length
  }
  return { text: parts.join('\n\n---\n\n'), used, dropped }
}

/**
 * Ask the model for the outline.
 * @param {{ provider: string, model: string }} selection - default model.
 * @param {(request: object) => AsyncIterable<object>} stream - `llm.stream`.
 * @param {{ bookTitle: string, code: string, chapterTitle: string, mode?: string, transcript: string }} input - what is being summarized.
 * @returns {Promise<string>} the outline text.
 */
export async function summarize(selection, stream, input) {
  const scope = input.mode === undefined || input.mode === ''
    ? '本章全部对话'
    : `本章「${input.mode}」这一组对话`
  const prompt = [
    `书：${input.bookTitle}`,
    `章节：${input.code} ${input.chapterTitle}`,
    `范围：${scope}`,
    '',
    '以下是这些对话的原文（可能被截断）：',
    '',
    input.transcript,
  ].join('\n')
  let text = ''
  const chunks = stream({
    provider: selection.provider,
    model: selection.model,
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    maxTokens: 2400,
  })
  for await (const chunk of chunks) {
    if (chunk === null || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    else if (chunk.type === 'finish' && chunk.reason !== undefined && chunk.reason.kind === 'error') {
      const failure = chunk.reason.failure
      throw new Error(failure !== undefined && typeof failure.message === 'string' ? failure.message : '模型调用失败')
    }
  }
  return text.trim()
}

/**
 * Save the outline beside the chapter's produced files.
 * @param {{ artifactDir: string }} config - resolved paths.
 * @param {string} bookId - catalog book id.
 * @param {string} code - chapter code.
 * @param {string} mode - `all` or a mode key, used in the file name.
 * @param {string} text - outline Markdown.
 * @returns {Promise<string>} the absolute file path.
 */
export async function saveDigest(config, bookId, code, mode, text) {
  const dir = join(config.artifactDir, bookId, code)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `提纲-${mode}.md`)
  await writeFile(path, `${text}\n`, 'utf8')
  return path
}
