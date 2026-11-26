/**
 * Turn the worktree's `client.js` into the release copy.
 *
 * The release must behave like a normal install: no local debug affordances, no
 * first-run replay switch. This script:
 *   1. deletes every `// pdfdesk:dev-only-start` … `// pdfdesk:dev-only-end` block
 *      (the mechanism stays available for future local-only code);
 *   2. refuses to finish when the old `ENV_GUIDE_ALWAYS` debug switch is back,
 *      when a dev-only marker survives, when a developer-mode artifact is found,
 *      or when the result does not parse.
 *
 * Called by `build-dist.ps1` on the copied package; safe to run on any copy.
 * Usage: node scripts/prepare-release-client.mjs <path-to-client.js>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const target = process.argv[2]
if (typeof target !== 'string' || target === '') {
  console.error('usage: node scripts/prepare-release-client.mjs <path-to-client.js>')
  process.exit(2)
}

const source = readFileSync(target, 'utf8')
if (source.includes('ENV_GUIDE_ALWAYS')) {
  console.error('release guard: the old ENV_GUIDE_ALWAYS debug switch is back — remove it before packaging')
  process.exit(1)
}

const marks = source.split('pdfdesk:dev-only-start').length - 1
const closes = source.split('pdfdesk:dev-only-end').length - 1
if (marks !== closes) {
  console.error(`release guard: unbalanced dev-only markers (${marks} open / ${closes} close)`)
  process.exit(1)
}

// DotAll through every marked block, markers included. Idempotent: a copy with
// no marked blocks passes through unchanged.
let next = source.replace(/[ \t]*\/\/ pdfdesk:dev-only-start[\s\S]*?\/\/ pdfdesk:dev-only-end\n?/g, '')

if (next.includes('pdfdesk:dev-only-start') || next.includes('pdfdesk:dev-only-end')) {
  console.error('release guard: a dev-only block survived the strip')
  process.exit(1)
}
// The developer mode was removed in v1.5; none of its artifacts may come back
// in a packaged client.
for (const artifact of ['DEV_MODE_SUPPORTED', 'devModeBadge', 'devModeHint', 'pdfdesk:dev-mode', 'Ctrl+Shift+D']) {
  if (next.includes(artifact)) {
    console.error(`release guard: developer-mode artifact "${artifact}" must not ship`)
    process.exit(1)
  }
}

writeFileSync(target, next, 'utf8')
try {
  // The stripped copy must still be valid JavaScript; a broken package is worse
  // than a refused one.
  execFileSync(process.execPath, ['--check', target], { stdio: 'inherit' })
} catch {
  console.error('release guard: the stripped client.js does not parse — refusing to package')
  process.exit(1)
}
console.log(`release guard: clean (${target})`)
