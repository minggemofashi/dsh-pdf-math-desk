// 工具/dsfile.mjs —— 调用 DeepSeek Files API 做服务端 PDF 解析，并让 deepseek-flash 按指令转写
//
// 用法：
//   node dsfile.mjs upload <pdf> [--purpose rich_layout_recognition|text_recognition] [--days 30]
//   node dsfile.mjs ask --file-id <id> --prompt "<指令>" [--prompt-file <md>] [--thinking on|off]
//   node dsfile.mjs run <pdf> --prompt "<指令>" [--purpose ...] [--thinking on|off]
//   node dsfile.mjs list
//
// API key 取自环境变量 DEEPSEEK_API_KEY；缺失时回落到 ~/.dsh/.credentials.yaml 的 refs.DEEPSEEK_API_KEY。
// 全程不打印 key。上传的 file_id 缓存在 缓存/api_files.json，同一文件不重复上传。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '..', '缓存', 'api_files.json');

function die(msg, code = 1) {
  console.error(`[dsfile] 错误: ${msg}`);
  process.exit(code);
}

function loadKey() {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }
  const cred = path.join(os.homedir(), '.dsh', '.credentials.yaml');
  try {
    const txt = fs.readFileSync(cred, 'utf8');
    const m = txt.match(/DEEPSEEK_API_KEY\s*:\s*["']?([A-Za-z0-9_\-]+)["']?/);
    if (m) return m[1];
  } catch { /* ignore */ }
  die('拿不到 API key：请设置环境变量 DEEPSEEK_API_KEY，或在 ~/.dsh/.credentials.yaml 里配置。', 2);
}

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) a[k] = true;
      else { a[k] = nxt; i++; }
    } else a._.push(t);
  }
  return a;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return { formatVersion: 1, records: [] }; }
}
function writeCache(c) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const tmp = `${CACHE}.tmp${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2), 'utf8');
  fs.renameSync(tmp, CACHE);   // 原子替换，多窗口并发写不会截断
}
function fingerprint(file, purpose) {
  const st = fs.statSync(file);
  const h = crypto.createHash('sha256');
  h.update(`${path.resolve(file)}|${st.size}|${st.mtimeMs}|${purpose}`);
  return h.digest('hex');
}

async function api(pathname, opts = {}) {
  const key = loadKey();
  const r = await fetch(BASE + pathname, {
    ...opts,
    headers: { Authorization: `Bearer ${key}`, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 300000),
  });
  const text = await r.text();
  if (!r.ok) die(`HTTP ${r.status} ${pathname}\n${text.slice(0, 1200)}`, 3);
  try { return JSON.parse(text); }
  catch { die(`返回不是 JSON：${text.slice(0, 800)}`, 3); }
}

async function upload(a, quiet = false) {
  const emit = (o) => {
    if (quiet && !a.verbose) return;
    const s = JSON.stringify(o, null, 2);
    if (quiet) console.error(s); else console.log(s);
  };
  const file = a._[1];
  if (!file) die('用法: upload <pdf> [--purpose ...]', 2);
  if (!fs.existsSync(file)) die(`文件不存在: ${file}`, 2);
  const purpose = a.purpose || 'rich_layout_recognition';
  if (!['rich_layout_recognition', 'text_recognition', 'user_data'].includes(purpose))
    die(`purpose 只能是 rich_layout_recognition / text_recognition / user_data`, 2);

  const fp = fingerprint(file, purpose);
  const cache = readCache();
  const hit = cache.records.find((r) => r.fingerprint === fp);
  if (hit && (!hit.expiresAt || hit.expiresAt > Date.now())) {
    emit({ ok: true, cached: true, ...hit });
    return hit;
  }

  const form = new FormData();
  form.append('purpose', purpose);                       // 必须先于 file
  if (a.days) {
    form.append('expires_after[anchor]', 'created_at');
    form.append('expires_after[seconds]', String(Math.round(Number(a.days) * 86400)));
  }
  form.append('file', await fs.openAsBlob(file), path.basename(file));

  process.stderr.write(`[dsfile] 上传并解析 ${path.basename(file)}（purpose=${purpose}），大文件可能需要 1-2 分钟…\n`);
  const res = await api('/files', { method: 'POST', body: form, timeout: 600000 });

  const rec = {
    fingerprint: fp,
    file: path.resolve(file),
    purpose,
    fileId: res.id,
    bytes: res.bytes,
    pages_hint: null,
    createdAt: res.created_at,
    expiresAt: res.expires_at || (a.days ? res.created_at + Number(a.days) * 86400 : null),
  };
  cache.records = cache.records.filter((r) => r.fingerprint !== fp).concat([rec]);
  writeCache(cache);
  emit({ ok: true, cached: false, ...rec });
  return rec;
}

function buildPrompt(a) {
  let prompt = a.prompt;
  if (!prompt && a['prompt-file']) prompt = fs.readFileSync(a['prompt-file'], 'utf8');
  if (!prompt) return null;
  if (a.pages) prompt = `只处理第 ${a.pages} 页（其余页一律忽略，不要输出）。\n\n` + prompt;
  return prompt;
}

async function ask(a) {
  const fileId = a['file-id'];
  if (!fileId) die('用法: ask --file-id <id> --prompt "<指令>"', 2);
  const prompt = buildPrompt(a);
  if (!prompt) die('缺少 --prompt 或 --prompt-file', 2);

  const body = {
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'file', file_id: fileId },
        { type: 'text', text: prompt },
      ],
    }],
    max_tokens: Number(a['max-tokens'] || 16000),
  };
  if (a.thinking === 'off') body.thinking = { type: 'disabled' };
  if (a.thinking === 'on') body.thinking = { type: 'enabled' };

  const res = await api('/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const msg = res.choices?.[0]?.message || {};
  const out = { text: msg.content || '', usage: res.usage || null, thinking: !!msg.reasoning_content };
  if (a.json) console.log(JSON.stringify(out, null, 2));
  else {
    process.stdout.write(out.text);
    if (a.usage) console.error(`[dsfile] usage: ${JSON.stringify(out.usage)}`);
  }
  return out;
}

async function run(a) {
  const file = a._[1];
  if (!file) die('用法: run <pdf> --prompt "<指令>"', 2);
  const prompt = buildPrompt(a);
  if (!prompt) die('缺少 --prompt 或 --prompt-file', 2);
  const rec = await upload({ ...a, _: ['upload', file] }, true);
  return ask({ ...a, 'file-id': rec.fileId, prompt });
}

async function list() {
  const res = await api('/files?limit=50&order=desc');
  console.log(JSON.stringify(res, null, 2));
}

const a = args(process.argv.slice(2));
const cmd = a._[0];
if (cmd === 'upload') await upload(a);
else if (cmd === 'ask') await ask(a);
else if (cmd === 'run') await run(a);
else if (cmd === 'list') await list();
else {
  console.error('子命令: upload | ask | run | list');
  process.exit(2);
}
