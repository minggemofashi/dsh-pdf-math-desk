/**
 * Build the official DSH primitives subset used by the workbench.
 *
 * The host package is build-time source (CSS modules, React automatic runtime),
 * so it cannot be required from the raw client module. We compile it to one CJS
 * file that the client executes with its own module-table `require`, plus a CSS
 * file the client injects once.
 */
import { build } from 'esbuild'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = resolve(root, 'vendor', 'host-ui.cjs')
const jsxShim = resolve(root, 'src', 'client', 'react-jsx-runtime.cjs')

await mkdir(dirname(outfile), { recursive: true })
await build({
  entryPoints: [resolve(root, 'src', 'client', 'host-ui-entry.js')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  sourcemap: false,
  legalComments: 'none',
  external: [
    'react', 'react-dom',
    '@deepseek-ai/dsh-util-*', '@deepseek-ai/dsh-client-store',
    'shiki', 'shiki/*', '@shikijs/*', 'simple-icons', 'katex', 'anser', 'diff',
    'mdast-util-*', 'micromark-*', 'unist-util-*',
  ],
  alias: {
    'react/jsx-runtime': jsxShim,
    'react/jsx-dev-runtime': jsxShim,
  },
  loader: {
    '.css': 'local-css',
    '.woff2': 'file',
    '.woff': 'file',
    '.ttf': 'file',
  },
  assetNames: 'host-ui/[name]-[hash]',
  logLevel: 'warning',
})

for (const file of ['host-ui.cjs', 'host-ui.css']) {
  const info = await stat(resolve(root, 'vendor', file)).catch(() => null)
  if (info === null) throw new Error(`missing build output: vendor/${file}`)
  console.log(`${file}: ${info.size} bytes`)
}
