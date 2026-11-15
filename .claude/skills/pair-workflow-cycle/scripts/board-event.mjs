// Select the card a privileged PR-event board sync may touch (#642 Maintainer Decision 2026-11-13 and its
// 2026-11-14 amendment). Deny by default: a same-repository PR whose sender holds admin/maintain/write and
// whose links all name ONE card — `native <id>` (closing keyword or branch `#N`) or `ref <id>` (one `Refs:`
// line, which the transition must resolve with --require-card). Ambiguous or absent links print nothing.
// The selection is selectLink(prLinks) — the same one every code host's linkedPr reads.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prLinks, selectLink } from './host/adapter-kit.mjs'
import { bindHosts } from './host/index.mjs'

export function selectEvent(event) {
  const repo = event?.repository
  const pr = event?.pull_request
  if (!repo?.full_name || !repo?.id || !event?.sender?.login || !pr?.head?.repo || !pr?.base?.repo) return null
  if ([pr.head.repo, pr.base.repo].some(r => r.id !== repo.id || r.full_name !== repo.full_name)) return null
  return selectLink(prLinks({ body: pr.body, branch: pr.head.ref }))
}

export const authorized = role => ['admin', 'maintain', 'write'].includes(role)

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const link = selectEvent(event)
    if (link && authorized(bindHosts({ from: process.cwd() }).code.readPermission({ repo: event.repository.full_name, user: event.sender.login }))) process.stdout.write(`${link.source} ${link.id}`)
  } catch {
    // unreadable event: no selection, no failure
  }
}
