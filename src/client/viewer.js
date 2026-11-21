/**
 * PdfViewer — the unified reader face of the rewrite.
 *
 * One component owns: zoom, scroll container, page painting per layer, and the
 * mode layout (single / continuous / dual). Modes only choose which layers and
 * columns are rendered; painting and geometry stay identical, which is what the
 * old per-mode canvases kept getting wrong.
 *
 * This module is the extracted target: `client.js` will mount it once per
 * reader and per side preview, then the legacy paint paths can be deleted.
 *
 * Layers:
 *   { kind: 'source', doc }
 *   { kind: 'translation', doc }
 *   { kind: 'masks', boxes }        // reveal boxes over `translation`
 *   { kind: 'blocks', blocks }      // debug block overlay
 *
 * Geometry rules (from docs/READER-REWRITE.md):
 * - centered content uses `safe center`, so a zoomed page can still scroll to
 *   its left edge;
 * - a mask canvas is displayed at *page* size with a negative offset, never at
 *   the mask's own size;
 * - repainting is driven by (doc, page, scale, version), not by DOM mounting.
 */

/** CSS injected once by the viewer's owner. */
export const VIEWER_STYLE = `
.mdv-root { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; min-height: 0; }
.mdv-stage { flex: 1 1 auto; min-height: 0; overflow: auto; }
.mdv-columns { display: flex; gap: 12px; width: 100%; height: 100%; }
.mdv-column { flex: 1 1 0; min-width: 0; overflow: auto; }
.mdv-page { position: relative; margin: 0 auto 18px; width: fit-content; }
.mdv-canvas { display: block; }
.mdv-layer { position: absolute; inset: 0; pointer-events: none; }
.mdv-mask { position: absolute; overflow: hidden; border: 1px dashed rgba(40, 140, 235, .9); box-sizing: border-box; }
.mdv-mask-page { position: absolute; max-width: none; }
.mdv-block { position: absolute; border: 1px dashed rgba(235, 70, 70, .85); box-sizing: border-box; }
.mdv-block[data-kind="heading"] { border-color: rgba(60, 130, 235, .95); }
.mdv-block[data-kind="formula"] { border-color: rgba(40, 160, 90, .95); }
`

/**
 * Paint one page into a canvas at a given scale.
 * @param {object} options - doc, pageNumber, scale, canvas, signal.
 * @returns {Promise<void>} resolves when the page finished painting.
 */
export async function paintPage(options) {
  const { doc, pageNumber, scale, canvas, signal } = options
  const page = await doc.getPage(pageNumber)
  if (signal !== undefined && signal.aborted) return
  const viewport = page.getViewport({ scale })
  let dpr = Math.min(2, Math.max(1, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  if (viewport.width * dpr > 8000 || viewport.height * dpr > 8000) dpr = 1
  canvas.width = Math.max(1, Math.floor(viewport.width * dpr))
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr))
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
  }).promise
}

/**
 * Compute the geometry for a reveal box that shows the translated page.
 * @param {{ x: number, y: number, w: number, h: number }} box - normalized box.
 * @returns {{ left: string, top: string, width: string, height: string }} CSS percentages.
 */
export function maskPageStyle(box) {
  return {
    left: `${-(box.x / box.w) * 100}%`,
    top: `${-(box.y / box.h) * 100}%`,
    width: `${100 / box.w}%`,
    height: `${100 / box.h}%`,
  }
}
