/**
 * Remove the empty session records the workbench itself left behind.
 *
 * The workbench creates a session for "New", and a session the user never
 * writes into is a header-only log. Archiving hides such a record but keeps its
 * bytes and its slot in the archived set forever, and DSH exposes no delete
 * API. This module is the narrow exception: it only touches a session that is
 * archived, not live in this process, attached to the library directory, and
 * has never started a turn. Everything else is left alone.
 *
 * @module dsh-pdf-workbench/purge
 */
import { rm, rmdir } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/**
 * Compare two Windows paths loosely.
 * @param {unknown} left - first path.
 * @param {unknown} right - second path.
 * @returns {boolean} whether they name the same directory.
 */
function sameDirectory(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left === '' || right === '') return false
  const normalize = value => value.replace(/[\\/]+$/g, '').replace(/\//g, '\\').toLowerCase()
  return normalize(left) === normalize(right)
}

/**
 * Purge archived, never-started sessions that belong to the library directory.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host context.
 * @param {{ libraryDir: string }} config - resolved paths.
 * @param {{ remove: (id: string) => Promise<void> } | undefined} pending - pending-intent store.
 * @param {{ forget: (id: string) => Promise<void> } | undefined} [links] - extra-placement store.
 * @param {{ forget: (id: string) => Promise<void> } | undefined} [pressure] - context-pressure snapshot store.
 * @returns {Promise<{ purged: number }>} how many stored sessions were removed.
 */
export async function purgeArchivedBlanks(ctx, config, pending, links, pressure) {
  const registry = ctx.get('workspaceRegistry')
  const persistence = ctx.get('sessionPersistence')
  const query = ctx.get('sessionQuery')
  if (registry === undefined || persistence === undefined || query === undefined) return { purged: 0 }
  const archived = Array.isArray(registry.archivedSessionIds) ? registry.archivedSessionIds : []
  const sessions = ctx.get('sessions')
  let purged = 0
  for (const id of archived) {
    // A live session may belong to an open conversation: never touch it.
    if (sessions !== undefined && sessions.get(id) !== undefined) continue
    let snapshot
    try {
      snapshot = await persistence.stat(id)
    } catch {
      continue
    }
    if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object' || snapshot.location === undefined) {
      // The record is already gone; drop any intent that still names it.
      if (pending !== undefined) await pending.remove(id).catch(() => {})
    if (links !== undefined) await links.forget(id).catch(() => {})
    if (pressure !== undefined) await pressure.forget(id).catch(() => {})
      continue
    }
    if (!sameDirectory(snapshot.header?.cwd, config.libraryDir)) continue
    let log
    try {
      log = await query.readSession(id)
    } catch {
      continue
    }
    if (!Array.isArray(log.events)) continue
    // One turn is enough to make the session worth keeping.
    if (log.events.some(event => event?.type === 'turn/start')) continue
    const file = snapshot.location.path
    if (typeof file !== 'string' || file === '') continue
    // Only ever remove a file that lives under this session's own directory.
    if (!file.includes(id)) continue
    try {
      await rm(file, { force: true })
    } catch {
      continue
    }
    const directory = dirname(file)
    if (basename(directory) === id) {
      try {
        await rmdir(directory)
      } catch {
        // A lingering sibling file keeps the directory: the log itself is gone.
      }
    }
    if (pending !== undefined) await pending.remove(id).catch(() => {})
    if (links !== undefined) await links.forget(id).catch(() => {})
    if (pressure !== undefined) await pressure.forget(id).catch(() => {})
    // Drop the dead id from the archive set so it stops occupying that list too.
    try {
      await registry.unarchiveSession(id)
    } catch {
      // The registry keeps a harmless dead id when this fails.
    }
    purged += 1
  }
  return { purged }
}
