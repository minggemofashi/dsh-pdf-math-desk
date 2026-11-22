/**
 * The subset of the host primitives used by the workbench.
 *
 * Kept deliberately narrow: importing the package root and letting esbuild
 * tree-shake keeps the vendor bundle small and avoids pulling in Markdown,
 * Shiki and KaTeX for three controls.
 */
export { Button } from '@deepseek-ai/dsh-client-ui-primitives/src/Button.tsx'
export { Input } from '@deepseek-ai/dsh-client-ui-primitives/src/Input.tsx'
export { Modal } from '@deepseek-ai/dsh-client-ui-primitives/src/Modal.tsx'
export { Menu } from '@deepseek-ai/dsh-client-ui-primitives/src/Menu.tsx'
