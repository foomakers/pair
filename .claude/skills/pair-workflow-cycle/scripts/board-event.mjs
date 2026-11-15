// Select the card a privileged PR-event board sync may touch (#642 Maintainer Decision 2026-11-13 and its
// 2026-11-14 amendment). Deny by default: a same-repository PR whose sender holds admin/maintain/write, linked
// by a closing keyword or a branch `#N` (`native <id>`), else by exactly one valid `Refs: <ID>` line
// (`ref <id>`, which the transition must resolve with --require-card). Anything else prints nothing (no-op).
// The link grammar is prLinks — the same one every code host's linkedPr reads.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prLinks } from './host/adapter-kit.mjs'
import { bindHosts } from './host/index.mjs'

export function selectLink(event) {
  const repo = event?.repository
  const pr = event?.pull_request
  if (!repo?.full_name || !repo?.id || !event?.sender?.login || !pr?.head?.repo || !pr?.base?.repo) return null
  if ([pr.head.repo, pr.base.repo].some(r => r.id !== repo.id || r.full_name !== repo.full_name)) return null
  const links = prLinks({ body: pr.body, branch: pr.head.ref })
  const native = links.closes[0] ?? links.branch[0]
  if (native) return { source: 'native', id: native }
  return links.refs.length === 1 && links.refs[0] ? { source: 'ref', id: links.refs[0] } : null
}

export const authorized = role => ['admin', 'maintain', 'write'].includes(role)

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const link = selectLink(event)
    if (link && authorized(bindHosts({ from: process.cwd() }).code.readPermission({ repo: event.repository.full_name, user: event.sender.login }))) process.stdout.write(`${link.source} ${link.id}`)
  } catch {
    // unreadable event: no selection, no failure
  }
}
