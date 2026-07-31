/**
 * The repo root, in ONE place — imported by every gate tool in this folder.
 *
 * Resolved from this file's location: packages/dev-tools/src/quality-gates -> src
 * -> dev-tools -> packages -> repo root (up 4).
 *
 * Why a module and not a const per file: ADR-014 records a folder move breaking
 * every duplicated `__dirname`-relative constant once already, and the hop count
 * had drifted back into four copies (this folder's three older tools plus the
 * #394 gate guard). One definition means the next move is a one-line fix.
 */
import { resolve } from 'path'

export const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
